import * as ActivationRunner from "@supervisor/core/activation/runner";
import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import type * as ConfigModel from "@supervisor/core/config";
import * as LogStream from "@supervisor/core/log-stream";
import * as Logger from "@supervisor/core/logger";
import * as RetryPolicy from "@supervisor/core/retry/codec";
import * as Schedule from "@supervisor/core/schedule";
import * as Adb from "@supervisor/core/services/adb";
import * as Db from "@supervisor/core/services/db";
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
import * as Node from "./node";
import * as Registry from "./registry";
import * as Trpc from "./trpc";
import * as Workflow from "./workflow";

// -------------------------------------------------------------------------------------
// Env
// -------------------------------------------------------------------------------------

export interface Env {
  readonly logger: Logger.Tagged;
  readonly configFetcher: Config.ConfigFetcher;
  readonly process: Node.Process;
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
    const logStream = LogStream.createLogStream();
    const logger = pipe(configuredLogger(config.log, [logStream.transport]), Logger.tagged("Service"));
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
        Workflow.run({ logger: workflowLog, spawn: Node.spawn, recovery: config.recovery })("android-chrome-test"),
      ),
      TE.asUnit,
    );

    const activationRunner = ActivationRunner.create(activationLog, activationSchedule, activationPolicy, {
      onActive: pipe(
        // Sync registry prima di discover
        Registry.sync({
          logger: registryLog,
          suitestConfig: {
            auth: { tokenId: config.suitest.tokenId, tokenPassword: config.suitest.tokenPassword },
            baseUrl: config.suitest.baseUrl,
          },
          dbPath: config.registry.dbPath,
          seedDevices: config.registry.devices,
          fsEnv: Node.fsEnv,
        }),

        // Costruisci i predicati per determinare se ci connettiamo al device
        TE.flatMap((db) =>
          pipe(
            TE.Do,
            TE.bind("knownHosts", () => TE.right(Connection.cameraHosts(db.lab))),
            TE.bind("controlledHosts", () => TE.right(Connection.controlledCameraHosts(db.lab))),
            TE.map(({ controlledHosts, knownHosts }) => ({
              // Determina se un determinato IP è noto al registry (controllato o meno)
              // un device completamente esterno al registry non va toccato, viene solo ignorato
              isKnown: (target: Socket.IPv4): boolean => knownHosts.includes(Socket.from(target).host),
              // Determina se un determinato IP è marcato come controllabile dal DB
              isControlled: (target: Socket.IPv4): boolean => controlledHosts.includes(Socket.from(target).host),
            })),
          ),
        ),

        // Cerca e connette i device che rispettano i predicati
        TE.flatMap(({ isControlled, isKnown }) =>
          pipe(
            // Cerca e connette i device tramite mDNS e ADB (Target Machine, 1 device alla volta)
            Connection.discoverAndConnect({
              logger: discoveryLog,
              adbPort: config.adb.port,
              adbReconnectPolicy,
              spawn: Node.spawn,
              isControlled,
              isKnown,
            }),
            TE.flatMap(runWorkflow),
          ),
        ),
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
        // Servizio di logging persistente per web-app
        logger: trpcLog.child("web"),

        // Feed live dei log di servizio, consumato dalla subscription tRPC per la web-app
        logs: logStream,

        // TODO: Servizi di gestione delle dispositivi android
        android: {
          // Recupera la lista dei device connessi tramite ADB
          devices: () => Adb.devices({ logger: trpcLog, spawn: Node.spawn }),

          // Riavvia un device tramite ADB
          reboot: (target) => Adb.reboot(target)({ logger: trpcLog, spawn: Node.spawn }),
        },

        // TODO: Servizio di DNS-SD (Service Discovery)
        mdns: {},

        // TODO: Servizio di notifiche
        notifications: {},

        // Servizio di gestione del registry dei device
        registry: {
          // Recupera l'intero db (mirror Suitest + dominio applicativo)
          getAll: () => Db.read(config.registry.dbPath)(Node.fsEnv),

          controlUnits: {
            update: ({ id, ...update }: Db.ControlUnitUpdateInput) =>
              Db.modifyLab(config.registry.dbPath)(Db.updateControlUnitById(id, update))(Node.fsEnv),

            add: (entry: Db.ControlUnitEntry) =>
              Db.modifyLab(config.registry.dbPath)(Db.addControlUnit(entry))(Node.fsEnv),

            remove: (id: string) => Db.modifyLab(config.registry.dbPath)(Db.removeControlUnitById(id))(Node.fsEnv),
          },

          cameras: {
            update: ({ id, ...update }: Db.CameraUpdateInput) =>
              Db.modifyLab(config.registry.dbPath)(Db.updateCameraById(id, update))(Node.fsEnv),

            add: (entry: Db.CameraEntry) => Db.modifyLab(config.registry.dbPath)(Db.addCamera(entry))(Node.fsEnv),

            remove: (id: string) => Db.modifyLab(config.registry.dbPath)(Db.removeCameraById(id))(Node.fsEnv),
          },

          tvs: {
            update: ({ ip, ...update }: Db.TvUpdateInput) =>
              Db.modifyLab(config.registry.dbPath)(Db.updateTvByIp(ip, update))(Node.fsEnv),

            add: (entry: Db.TvEntry) => Db.modifyLab(config.registry.dbPath)(Db.addTv(entry))(Node.fsEnv),

            remove: (ip: string) => Db.modifyLab(config.registry.dbPath)(Db.removeTvByIp(ip))(Node.fsEnv),
          },
        },
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

const startLogger: Logger.Tagged = pipe(ServiceLogger.create({ level: "debug" }), Logger.tagged("Service"));

const configuredLogger = (config: ConfigModel.LogConfig, extraTransports: readonly Logger.Transport[] = []) =>
  ServiceLogger.create(config, extraTransports);

const liveProcess: Node.Process = {
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
