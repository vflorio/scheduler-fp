import * as ConfigModel from "@supervisor/core/config";
import * as Policy from "@supervisor/core/policy-codec";
import * as Schedule from "@supervisor/core/schedule";
import * as E from "fp-ts/Either";
import { constVoid, pipe } from "fp-ts/function";
import type * as IO from "fp-ts/IO";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as Activation from "./activation";
import * as ActivationRunner from "./activation-runner";
import * as Args from "./args";
import * as Config from "./config";
import * as PinoLogger from "./logger";

// -------------------------------------------------------------------------------------
// Env
// -------------------------------------------------------------------------------------

export interface Logger {
  readonly info: (message: string) => IO.IO<void>;
  readonly error: (message: string) => IO.IO<void>;
}

export interface Process {
  readonly onSignal: (signal: NodeJS.Signals, handler: () => void) => void;
  readonly exit: (code: number) => never;
}

export interface Env {
  readonly logger: Logger;
  readonly configFetcher: Config.ConfigFetcher;
  readonly process: Process;
}

type Effect<A> = RTE.ReaderTaskEither<
  Env,
  Config.LoadError | Config.FetchError | Policy.PolicyDecodeError | ActivationRunner.StartError,
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
      Policy.decode(config.monitoring.polling),
      E.map((activationPolicy) => ({ config, activationPolicy })),
    ),
  ),
  RTE.flatMap(({ config, activationPolicy }) => {
    const logger = permanentLogger(config.log);
    const activationGate = Activation.toSchedule(config.workSchedule);

    logger.info(`Config loaded - schedule: ${ConfigModel.workScheduleToString(config.workSchedule)}`)();
    logger.info(`Polling policy: ${Policy.policyJsonToString(config.monitoring.polling)}`)();

    const slot = Schedule.toTimeSlot(new Date());

    if (activationGate(slot)) {
      logger.info("Service ACTIVE - currently inside work schedule")();
    } else {
      logger.info(`Service IDLE - waiting for (${ConfigModel.workScheduleToString(config.workSchedule)})`)();
    }

    const runner = ActivationRunner.create(
      activationGate,
      activationPolicy,
      T.fromIO(pipe(logger.info("Executing onActive tick..."))),
      constVoid,
      logger,
    );

    return RTE.fromTaskEither(
      pipe(
        runner.start,
        TE.map(() => ({ stop: runner.stop })),
      ),
    );
  }),
);

// -------------------------------------------------------------------------------------
// Env Instances
// -------------------------------------------------------------------------------------

const permanentLogger = (config: ConfigModel.LogConfig): Logger => PinoLogger.create(config);

const volativeLogger: Logger = PinoLogger.create({ level: "info" });

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
    volativeLogger.error(argsResult.left)();
    liveProcess.exit(1);
  }

  const args = argsResult.right;

  const env: Env = {
    logger: volativeLogger,
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
