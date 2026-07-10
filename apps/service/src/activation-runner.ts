import * as Retry from "@supervisor/core/retry";
import * as Schedule from "@supervisor/core/schedule";
import type * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Activation Runner
// -------------------------------------------------------------------------------------

export interface StartError {
  readonly type: "StartError";
  readonly message: string;
}

// Esegue `onActive` quando lo schedule e' attivo, `onInactive` quando non lo e'.
// Usa la policy per determinare il delay tra i tick.
// Ritorna un handle con `abort` per fermare il loop.
export const create = (
  // Questo schedule contiene il range di operatività
  activationGate: Schedule.Schedule,
  // Policy di polling per determinare il delay tra i tick
  policy: Retry.Policy,
  // Status change, vengono chiamati ad ogni tick
  onActive: () => void | Promise<void>,
  onInactive: () => void | Promise<void>,
  // Logger
  log: { info: (msg: string) => IO.IO<void> },
) => {
  const controller = new AbortController();

  let status: Retry.Status = Retry.initialStatus;
  let wasInWorkSchedule = false;

  const tick = async (): Promise<void> => {
    if (controller.signal.aborted) return;

    const now = new Date();
    const slot = Schedule.toTimeSlot(now);
    const isActive = activationGate(slot);

    if (isActive && !wasInWorkSchedule) {
      log.info("Service ACTIVE - entering work schedule")();
      wasInWorkSchedule = true;
    }

    if (!isActive && wasInWorkSchedule) {
      log.info("Service IDLE - outside work schedule")();
      wasInWorkSchedule = false;
    }

    if (isActive) {
      await onActive();
    } else {
      await onInactive();
    }

    // Calcola il delay dalla policy
    const delay = policy(status);
    if (delay === null) {
      log.info("Polling policy exhausted - stopping")();
      return;
    }

    status = { iteration: status.iteration + 1, previousDelay: delay };

    await sleep(delay);

    return tick();
  };

  return {
    start: TE.tryCatch(
      () => tick(),
      (err) => ({ type: "StartError" as const, message: `Activation runner start error: ${err}` }),
    ),
    stop: () => {
      controller.abort();
      log.info("Scheduled runner stopped")();
    },
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
