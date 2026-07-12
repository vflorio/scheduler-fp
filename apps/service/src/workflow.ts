import type * as AdbCore from "@supervisor/core/adb";
import * as Retry from "@supervisor/core/retry";
import type * as RetryPolicy from "@supervisor/core/retry-codec";
import type { RecoveryConfig } from "@supervisor/core/workflow";
import * as WorkflowInterpreter from "@supervisor/core/workflow-interpreter";
import * as AdbShell from "@supervisor/shell/adb";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { Logger } from "./logger";

const mapWorkflowError = (
  error: WorkflowInterpreter.WorkflowError | AdbCore.AdbError | RetryPolicy.PolicyDecodeError,
): WorkflowInterpreter.WorkflowError => ({ type: "WorkflowError" as const, message: error.message });

const makeCapabilities = (target: AdbCore.Target): WorkflowInterpreter.CommandCapabilities => ({
  // Restart Application (AM)
  restartApp: (packageId) => pipe(AdbShell.restartApp(packageId)(target), TE.mapLeft(mapWorkflowError)),

  // Reboot Device
  reboot: () => pipe(AdbShell.reboot(target), TE.mapLeft(mapWorkflowError)),

  // Emulates screen tap
  inputTap: (coords) => pipe(AdbShell.inputTap(coords.x, coords.y)(target), TE.mapLeft(mapWorkflowError)),

  // Wait for ADB status "device"
  waitForDevice: () => pipe(AdbShell.waitForDevice(target), TE.mapLeft(mapWorkflowError)),

  // Wait for activity to be foreground
  waitForActivity: (activity) =>
    pipe(
      Retry.retrying(Retry.constantDelay(1000))(
        pipe(
          AdbShell.isActivityResumed(activity)(target),
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
});

interface WorkflowRunnerEnv {
  readonly logger: Logger;
  readonly recovery: RecoveryConfig;
}

export const runWorkflow =
  (env: WorkflowRunnerEnv) =>
  (workflow: string) =>
  (target: AdbCore.Target): TE.TaskEither<WorkflowInterpreter.WorkflowError | RetryPolicy.PolicyDecodeError, void> =>
    pipe(
      WorkflowInterpreter.runWorkflow(
        env.recovery,
        workflow,
      )({
        logger: env.logger,
        capabilities: makeCapabilities(target),
        scripts: env.recovery.scripts,
      }),

      TE.tapIO(() => env.logger.info(`Workflow "${workflow}" completed on ${target}`)),
      TE.tapError((error) => TE.fromIO(env.logger.error(`Workflow failed on ${target}: ${error.message}`))),
    );
