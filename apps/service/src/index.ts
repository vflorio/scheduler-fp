import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as ActivationRunner from "@supervisor/core/activation/runner";
import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import type * as ConfigModel from "@supervisor/core/config";
import type * as Fs from "@supervisor/core/fs";
import * as Logger from "@supervisor/core/logger";
import * as RetryPolicy from "@supervisor/core/retry/codec";
import * as Schedule from "@supervisor/core/schedule";
import * as Adb from "@supervisor/core/services/adb";
import * as DeviceRegistry from "@supervisor/core/services/device-registry";
import type * as Shell from "@supervisor/core/shell";
import * as Socket from "@supervisor/core/socket";
import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as Args from "./args";
import * as Config from "./config";
import * as Connection from "./connection";
import * as ServiceLogger from "./logger";
import { syncRegistry } from "./registry";
import * as Trpc from "./trpc";
import * as Workflow from "./workflow";

// -------------------------------------------------------------------------------------
// Env
// -------------------------------------------------------------------------------------

export interface Process {
  readonly onSignal: (signal: NodeJS.Signals, handler: () => void) => void;
  readonly exit: (code: number) => never;
}

export interface Env {
  readonly logger: Logger.Tagged;
  readonly configFetcher: Config.ConfigFetcher;
  readonly process: Process;
}

type Effect<A> = RTE.ReaderTaskEither<
  Env,
  Config.LoadError | Config.FetchError | RetryPolicy.PolicyDecodeError | ActivationRunner.StartError,
  A
>;

// -------------------------------------------------------------------------------------
// Capabilities
// -------------------------------------------------------------------------------------

const logInfo = (message: string): Effect<void> =>
  pipe(
    RTE.ask<Env>(),
    RTE.tapIO((env) => env.logger.info(message)),
    RTE.asUnit,
  );

const loadConfig: Effect<ConfigModel.ServiceConfig> = (env) => Config.load(env.configFetcher);

// -------------------------------------------------------------------------------------
// Service
// -------------------------------------------------------------------------------------

export interface ServiceHandle {
  readonly stop: () => void;
}

const spawn: Shell.Spawn = (command, args) =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<string>((resolve, reject) => {
          execFile(command, args, (error, stdout, stderr) =>
            error ? reject({ ...error, message: `${error.message} - ${stderr}` }) : resolve(stdout),
          );
        }),
      (error) => ({ type: "CommandError" as const, message: error instanceof Error ? error.message : String(error) }),
    ),
  );

// Node.js filesystem dependency
export const fsEnv: Fs.Env = {
  logger: pipe(ServiceLogger.create({ level: "debug" }), Logger.tagged("FS")),
  readFile: (path) =>
    TE.tryCatch(
      () => readFile(path, "utf-8"),
      (e) => ({ type: "FileSystemError" as const, message: e instanceof Error ? e.message : String(e) }),
    ),
  writeFile: (path, content) =>
    TE.tryCatch(
      async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
      },
      (e) => ({ type: "FileSystemError" as const, message: e instanceof Error ? e.message : String(e) }),
    ),
};

export const createService: Effect<ServiceHandle> = pipe(
  logInfo("Loading config..."),
  RTE.flatMap(() => loadConfig),

  RTE.flatMapEither((config) =>
    pipe(
      E.Do,
      E.bind("activationPolicy", () => RetryPolicy.decode(config.monitoring.polling)),
      E.bind("adbReconnectPolicy", () => RetryPolicy.decode(config.adb.reconnect)),
      E.map(({ activationPolicy, adbReconnectPolicy }) => ({ config, activationPolicy, adbReconnectPolicy })),
    ),
  ),

  RTE.flatMap(({ config, activationPolicy, adbReconnectPolicy }) => {
    const logger = pipe(configuredLogger(config.log), Logger.tagged("Service"));
    const activationSchedule = ActivationSchedule.toSchedule(config.activationSchedule);

    logger.info(`Config loaded - schedule: ${ActivationSchedule.toString(config.activationSchedule)}`)();
    logger.info(`Polling policy: ${RetryPolicy.policyJsonToString(config.monitoring.polling)}`)();

    const slot = Schedule.toTimeSlot(new Date());

    pipe(
      IO.of(activationSchedule(slot)),
      IO.flatMap((isActive) =>
        isActive
          ? logger.info("ACTIVE - currently inside work schedule")
          : logger.info(`IDLE - waiting for (${ActivationSchedule.toString(config.activationSchedule)})`),
      ),
    )();

    const activationLog = logger.child("ActivationRunner");
    const discoveryLog = activationLog.child("Discovery");
    const workflowLog = discoveryLog.child("Workflow");
    const registryLog = activationLog.child("Registry");

    const runWorkflow: (targets: readonly Socket.IPv4[]) => TE.TaskEither<Workflow.RunError, void> = flow(
      RA.traverse(TE.ApplicativeSeq)(
        Workflow.run({ logger: workflowLog, spawn, recovery: config.recovery })("android-chrome-test"),
      ),
      TE.asUnit,
    );

    const activationRunner = ActivationRunner.create(activationLog, activationSchedule, activationPolicy, {
      onActive: pipe(
        // Sync registry prima di discover
        syncRegistry({
          logger: registryLog,
          suitestConfig: {
            auth: { tokenId: config.suitest.tokenId, tokenPassword: config.suitest.tokenPassword },
            baseUrl: config.suitest.baseUrl,
          },
          dbPath: config.registry.dbPath,
          seedDevices: config.registry.devices,
          fsEnv,
        }),

        // Utilizza solo i device marcati come controllati
        TE.flatMap((registry) => {
          const controlledIps = DeviceRegistry.controlledIpsByCategory("android-camera")(registry);

          const isControlled = (target: Socket.IPv4): boolean => controlledIps.includes(Socket.from(target).host);

          return pipe(
            // Cerca e connette i device tramite mDNS e ADB
            Connection.discoverAndConnect({
              logger: discoveryLog,
              spawn,
              adbPort: config.adb.port,
              adbReconnectPolicy,
              isControlled,
            }),
            TE.map((targets) => targets.filter(isControlled)),
            TE.flatMap(runWorkflow),
          );
        }),
        TE.tapError((error) => TE.fromIO(logger.error(`Activation tick failed: ${error.message}`))),
        T.asUnit,
      ),
    });

    const trpcLog = logger.child("tRPC");

    const trpcServer = Trpc.startServer({
      port: config.trpc.port,
      hostname: config.trpc.hostname,
      logger: trpcLog,
      services: {
        android: Adb.create({ logger: trpcLog.child("HTTP").child("Adb"), spawn }),
        mdns: {},
        notifications: {},
        registry: {
          getAll: () => DeviceRegistry.read(config.registry.dbPath)(fsEnv),
          update: (ip: string, update: { label?: string; controlled?: boolean }) =>
            DeviceRegistry.modify(config.registry.dbPath)(DeviceRegistry.updateByIp(ip, update))(fsEnv),
          add: (entry: DeviceRegistry.DeviceEntry) =>
            DeviceRegistry.modify(config.registry.dbPath)(DeviceRegistry.addDevice(entry))(fsEnv),
          remove: (ip: string) => DeviceRegistry.modify(config.registry.dbPath)(DeviceRegistry.removeByIp(ip))(fsEnv),
        },
        logger: trpcLog.child("web"),
      },
    });

    return RTE.fromTaskEither(
      pipe(
        activationRunner.start,
        TE.map(() => ({
          stop: () =>
            pipe(
              TE.fromIO(activationRunner.stop),
              TE.flatMap(() => trpcServer.stop),
              TE.flatMapIO(() => logger.info("stop completed")),
            ),
        })),
      ),
    );
  }),
);

// -------------------------------------------------------------------------------------
// Env Instances
// -------------------------------------------------------------------------------------

const startLogger: Logger.Tagged = //Logger.tagged(ServiceLogger.create({ level: "info" }), "Service");
  pipe(ServiceLogger.create({ level: "info" }), Logger.tagged("Service"));

const configuredLogger = (config: ConfigModel.LogConfig) => ServiceLogger.create(config);

const liveProcess: Process = {
  onSignal: (signal, handler) => process.on(signal, handler),
  exit: (code) => process.exit(code),
};

// -------------------------------------------------------------------------------------
// Entry point
// -------------------------------------------------------------------------------------

const main = () => {
  const argsResult = Args.parse(process.argv);

  if (E.isLeft(argsResult)) {
    startLogger.error(argsResult.left)();
    liveProcess.exit(1);
  }

  const args = argsResult.right;

  const env: Env = {
    logger: startLogger,
    process: liveProcess,
    configFetcher: Config.toFetcher(args.config),
  };

  env.logger.info(
    `Starting service (config: ${args.config.type}://${args.config.type === "file" ? args.config.path : args.config.url})`,
  )();

  const run = async (): Promise<void> => {
    const result = await createService(env)();

    if (E.isLeft(result)) {
      env.logger.error(JSON.stringify(result.left))();
      env.process.exit(1);
    }

    const handle = result.right;

    // Restart: SIGHUP ferma il runner corrente e rilancia
    env.process.onSignal("SIGHUP", () => {
      env.logger.info("Received SIGHUP - triggering restart")();
      handle.stop();
      run();
    });

    // Shutdown: SIGINT ferma e termina il processo
    env.process.onSignal("SIGINT", () => {
      env.logger.info("Received SIGINT - shutting down")();
      handle.stop();
      env.process.exit(0);
    });
  };

  run();
};

main();
