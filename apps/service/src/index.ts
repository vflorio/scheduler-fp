import * as ConfigModel from "@supervisor/core/config";
import * as Policy from "@supervisor/core/policy-codec";
import * as Retry from "@supervisor/core/retry";
import type * as Schedule from "@supervisor/core/schedule";
import * as Console from "fp-ts/Console";
import * as E from "fp-ts/Either";
import { constVoid } from "fp-ts/lib/function";
import * as T from "fp-ts/lib/Task";
import * as Activation from "./activation";
import * as Args from "./args";
import * as Config from "./config";

// -------------------------------------------------------------------------------------
// Logger
// -------------------------------------------------------------------------------------

const datePrefix = (): string => `[${new Date().toISOString()}]`;
export const logInfo = (message: string) => Console.log(`${datePrefix()} [INFO] ${message}`);
export const logError = (message: string) => Console.error(`${datePrefix()} [ERROR] ${message}`);

// -------------------------------------------------------------------------------------
// Scheduled runner
// -------------------------------------------------------------------------------------

// Esegue `onActive` quando lo schedule e' attivo, `onInactive` quando non lo e'.
// Usa la policy per determinare il delay tra i tick.
// Ritorna un handle con `abort` per fermare il loop.
const createActivationController = (
  // Questo schedule contiene il range di operatività
  gate: Schedule.Schedule,
  // Policy di polling per determinare il delay tra i tick
  policy: Retry.Policy,
  // Status change, vengono chiamati ad ogni tick
  onActive: () => void | Promise<void>,
  onInactive: () => void | Promise<void>,
) => {
  const controller = new AbortController();

  let wasActive = false;
  let status: Retry.Status = Retry.initialStatus;

  const tick = async (): Promise<void> => {
    if (controller.signal.aborted) return;

    const slot = Activation.currentSlot();
    const isActive = gate(slot);

    if (isActive && !wasActive) {
      logInfo("Service ACTIVE - entering work schedule")();
      wasActive = true;
    }

    if (!isActive && wasActive) {
      logInfo("Service IDLE - outside work schedule")();
      wasActive = false;
    }

    if (isActive) {
      await onActive();
    } else {
      await onInactive();
    }

    // Calcola il delay dalla policy
    const delay = policy(status);
    if (delay === null) {
      logInfo("Polling policy exhausted - stopping")();
      return;
    }

    status = { iteration: status.iteration + 1, previousDelay: delay };

    await sleep(delay);

    return tick();
  };

  return {
    start: tick,
    stop: () => {
      controller.abort();
      logInfo("Scheduled runner stopped")();
    },
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// -------------------------------------------------------------------------------------
// Service lifecycle
// -------------------------------------------------------------------------------------

const createService = (fetcher: Config.ConfigFetcher) => {
  let currentRunner: {
    start: () => Promise<void>;
    stop: () => void;
  } | null = null;

  const stop = (): void => {
    if (!currentRunner) return;
    logInfo("Stopping service")();
    currentRunner.stop();
    currentRunner = null;
  };

  // Inizializza (o re-inizializza)
  const start = async (): Promise<void> => {
    // Ferma il runner precedente se esiste
    if (currentRunner) stop();

    logInfo("Loading config...")();

    const configResult = await Config.load(fetcher)();

    if (E.isLeft(configResult)) {
      logError(configResult.left)();
      process.exit(1);
    }

    const config = configResult.right;

    // Decodifica la policy di polling dalla config
    const policyResult = Policy.decode(config.monitoring.polling);

    if (E.isLeft(policyResult)) {
      logError(`Invalid polling policy: ${policyResult.left.message}`)();
      process.exit(1);
    }

    const pollingPolicy = policyResult.right;
    const gate = Activation.toSchedule(config.workSchedule);

    logInfo(`Config loaded - schedule: ${ConfigModel.workScheduleToString(config.workSchedule)}`)();
    logInfo(`Polling policy: ${Policy.policyJsonToString(config.monitoring.polling)}`)();

    // Verifica stato iniziale
    const slot = Activation.currentSlot();

    if (gate(slot)) {
      logInfo("Service ACTIVE - currently inside work schedule")();
    } else {
      logInfo(`Service IDLE - waiting for work schedule (${config.workSchedule.from} - ${config.workSchedule.to})`)();
    }

    currentRunner = createActivationController(
      gate,
      pollingPolicy,
      T.fromIO(logInfo("Executing onActive tick...")),
      constVoid,
    );

    await currentRunner.start();
  };

  // Distrugge il runner corrente e re-inizializza il servizio da config
  const restart = async (): Promise<void> => {
    logInfo("Service restart requested - reloading config from disk")();
    await start();
  };

  return { start, stop, restart };
};

// -------------------------------------------------------------------------------------
// Entry point
// -------------------------------------------------------------------------------------

const main = async () => {
  const sourceResult = Args.parseArgs(process.argv);

  if (E.isLeft(sourceResult)) {
    logError(sourceResult.left)();
    process.exit(1);
  }

  const source = sourceResult.right;
  const fetcher = Config.toFetcher(source);

  logInfo(`Starting service (config: [${source.type}] ${source.type === "file" ? source.path : source.url})`)();

  const service = createService(fetcher);

  // Intercetta SIGHUP per restart (hot-reload config)
  process.on("SIGHUP", () => {
    logInfo("Received SIGHUP - triggering restart")();
    service.restart();
  });

  process.on("SIGINT", () => {
    logInfo("Received SIGINT - shutting down")();
    service.stop();
  });

  await service.start();
};

main();
