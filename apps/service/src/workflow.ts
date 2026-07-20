import type * as Logger from "@supervisor/core/logger";
import type * as RetryPolicy from "@supervisor/core/retry/codec";
import * as Retry from "@supervisor/core/retry/retry";
import * as Adb from "@supervisor/core/services/adb";
import type * as Shell from "@supervisor/core/shell";
import type { IPv4 } from "@supervisor/core/socket";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { RecoveryConfig } from "@supervisor/core/workflow/workflow";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type * as DeviceRegistry from "./registry";

const mapWorkflowError = (
  error: WorkflowInterpreter.WorkflowError | Adb.AdbError | Shell.ShellSpawnError | DeviceRegistry.SyncError,
): WorkflowInterpreter.WorkflowError => ({ type: "WorkflowError" as const, message: error.message });

interface WorkflowRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly recovery: RecoveryConfig;
  readonly spawn: Shell.Spawn;
}

export type RunError = WorkflowInterpreter.WorkflowError | RetryPolicy.PolicyDecodeError;

export const run =
  (env: WorkflowRunnerEnv) =>
  (workflow: string) =>
  (target: IPv4): TE.TaskEither<RunError, void> =>
    pipe(
      WorkflowInterpreter.run(
        env.recovery,
        workflow,
      )({
        logger: env.logger,
        scripts: env.recovery.scripts,
        capabilities: makeCapabilities(env, target),
      }),

      TE.tapIO(() => env.logger.info(`Workflow "${workflow}" completed on ${target}`)),
      TE.tapError((error) => TE.fromIO(env.logger.error(`Workflow failed on ${target}: ${error.message}`))),
    );

const makeCapabilities = (env: WorkflowRunnerEnv, target: IPv4): WorkflowInterpreter.CommandCapabilities => {
  const adbEnv: Adb.AdbEnv = {
    logger: env.logger.child("ADB"),
    spawn: env.spawn,
  };

  return {
    // Restart Application (AM)
    restartApp: (packageId) => pipe(Adb.restartApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Ensure app is in foreground - launch only if not already resumed
    ensureActivity: (packageId, activity) =>
      pipe(
        Adb.isActivityResumed(activity)(target)(adbEnv),
        TE.mapLeft(mapWorkflowError),
        TE.flatMap((active) =>
          active ? TE.right(undefined) : pipe(Adb.launchApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
        ),
      ),

    // Open URL in default browser
    openUrl: (url) => pipe(Adb.openUrl(url)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Reboot Device
    reboot: () => pipe(Adb.reboot(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wake screen + dismiss keyguard (no PIN)
    wakeUp: () =>
      pipe(
        Adb.wakeUp(target)(adbEnv),
        TE.flatMap(() => Adb.dismissKeyguard(target)(adbEnv)),
        TE.mapLeft(mapWorkflowError),
      ),

    // Emulates screen tap
    inputTap: (coords) => pipe(Adb.inputTap(coords.x, coords.y)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wait for ADB status "device"
    waitForDevice: () => pipe(Adb.waitForDevice(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wait for activity to be foreground
    waitForActivity: (activity) =>
      pipe(
        Retry.retrying(
          Retry.constantDelay(1000),
          env.logger,
        )(
          pipe(
            Adb.isActivityResumed(activity)(target)(adbEnv),
            TE.mapLeft(mapWorkflowError),
            TE.flatMap((active) =>
              active
                ? TE.right(undefined)
                : TE.left(
                    mapWorkflowError({
                      type: "WorkflowError" as const,
                      message: `Activity "${activity}" not yet resumed`,
                    }),
                  ),
            ),
          ),
        ),
      ),
  };
};
