import type * as ConfigModel from "@supervisor/core/config";
import * as Logger from "@supervisor/core/logger";
import * as RetryPolicy from "@supervisor/core/retry-codec";
import * as Schedule from "@supervisor/core/schedule";
import * as WorkSchedule from "@supervisor/core/workSchedule";
import * as ShellAndroidBridge from "@supervisor/shell/android-bridge";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as ActivationRunner from "./activation-runner";
import * as Args from "./args";
import * as Config from "./config";
import * as Connection from "./connection";
import * as ServiceLogger from "./logger";
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
    const activationGate = WorkSchedule.toSchedule(config.workSchedule);

    logger.info(`Config loaded - schedule: ${WorkSchedule.toString(config.workSchedule)}`)();
    logger.info(`Polling policy: ${RetryPolicy.policyJsonToString(config.monitoring.polling)}`)();

    const slot = Schedule.toTimeSlot(new Date());

    pipe(
      IO.of(activationGate(slot)),
      IO.flatMap((isActive) =>
        isActive
          ? logger.info("Service ACTIVE - currently inside work schedule")
          : logger.info(`Service IDLE - waiting for (${WorkSchedule.toString(config.workSchedule)})`),
      ),
    )();

    const activationLog = logger.child("ActivationRunner");
    const discoveryLog = activationLog.child("Discovery");
    const workflowLog = discoveryLog.child("Workflow");

    const activationRunner = ActivationRunner.create(activationLog, activationGate, activationPolicy, {
      onActive: pipe(
        Connection.discoverAndConnect({ logger: discoveryLog, adbPort: config.adb.port, adbReconnectPolicy }),
        TE.flatMap(
          RA.traverse(TE.ApplicativeSeq)(
            Workflow.run({ logger: workflowLog, recovery: config.recovery })("android-chrome-test"),
          ),
        ),
        // FIXME: Questo deve essere gestito attraverso un recovery workflow, altrimenti
        // non viene notificato l'irranggiungibilità del device
        TE.tapError((error) => TE.fromIO(logger.error(`Activation tick failed: ${error.message}`))),
        T.asUnit,
      ),
    });

    // tRPC Server - fuori dall'ActivationRunner perché abbiamo bisogno che la UI sia sempre operativa

    const trpcLog = logger.child("tRPC");

    const trpcServer = Trpc.startServer({
      port: config.trpc.port,
      hostname: config.trpc.hostname,
      logger: trpcLog,
      services: {
        android: ShellAndroidBridge.create({ logger: trpcLog.child("HTTP").child("AndroidBridge") }),
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
