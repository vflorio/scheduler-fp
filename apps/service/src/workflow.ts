import type * as AdbCore from "@supervisor/core/adb";
import * as Retry from "@supervisor/core/retry";
import type * as RetryPolicy from "@supervisor/core/retry-codec";
import type { RecoveryConfig } from "@supervisor/core/workflow";
import * as WorkflowInterpreter from "@supervisor/core/workflow-interpreter";
import * as AdbShell from "@supervisor/shell/adb";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { TaggedLogger } from "./logger";

const mapWorkflowError = (
  error: WorkflowInterpreter.WorkflowError | AdbCore.AdbError | RetryPolicy.PolicyDecodeError,
): WorkflowInterpreter.WorkflowError => ({ type: "WorkflowError" as const, message: error.message });

const makeCapabilities = (logger: TaggedLogger, target: AdbCore.Target): WorkflowInterpreter.CommandCapabilities => {
  const adbLog = logger.child("AdbShell");
  const adbEnv: AdbShell.AdbShellEnv = { logger: adbLog };

  return {
    // Restart Application (AM)
    restartApp: (packageId) => pipe(AdbShell.restartApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Ensure app is in foreground — launch only if not already resumed
    ensureActivity: (packageId, activity) =>
      pipe(
        AdbShell.isActivityResumed(activity)(target)(adbEnv),
        TE.mapLeft(mapWorkflowError),
        TE.flatMap((active) =>
          active
            ? TE.right(undefined)
            : pipe(AdbShell.launchApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
        ),
      ),

    // Open URL in default browser
    openUrl: (url) => pipe(AdbShell.openUrl(url)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Reboot Device
    reboot: () => pipe(AdbShell.reboot(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wake screen + dismiss keyguard (no PIN)
    wakeUp: () =>
      pipe(
        AdbShell.wakeUp(target)(adbEnv),
        TE.flatMap(() => AdbShell.dismissKeyguard(target)(adbEnv)),
        TE.mapLeft(mapWorkflowError),
      ),

    // Emulates screen tap
    inputTap: (coords) => pipe(AdbShell.inputTap(coords.x, coords.y)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wait for ADB status "device"
    waitForDevice: () => pipe(AdbShell.waitForDevice(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wait for activity to be foreground
    waitForActivity: (activity) =>
      pipe(
        Retry.retrying(
          Retry.constantDelay(1000),
          logger,
        )(
          pipe(
            AdbShell.isActivityResumed(activity)(target)(adbEnv),
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

interface WorkflowRunnerEnv {
  readonly logger: TaggedLogger;
  readonly recovery: RecoveryConfig;
}

export const runWorkflow =
  (env: WorkflowRunnerEnv) =>
  (workflow: string) =>
  (target: AdbCore.Target): TE.TaskEither<WorkflowInterpreter.WorkflowError | RetryPolicy.PolicyDecodeError, void> =>
    pipe(
      WorkflowInterpreter.run(
        env.recovery,
        workflow,
      )({
        logger: env.logger,
        scripts: env.recovery.scripts,
        capabilities: makeCapabilities(env.logger, target),
      }),

      TE.tapIO(() => env.logger.info(`Workflow "${workflow}" completed on ${target}`)),
      TE.tapError((error) => TE.fromIO(env.logger.error(`Workflow failed on ${target}: ${error.message}`))),
    );
