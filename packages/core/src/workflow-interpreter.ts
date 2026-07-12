import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type { Logger } from "./logger";
import { retrying } from "./retry";
import { decode as decodePolicy, type PolicyDecodeError } from "./retry-codec";
import type { Command, RecoveryConfig, Script, TapCoords, Workflow, WorkflowStrategy } from "./workflow";
import { findScript } from "./workflow";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface WorkflowEnv {
  readonly capabilities: CommandCapabilities;
  readonly scripts: readonly Script[];
  readonly log: Logger;
}

export interface CommandCapabilities {
  readonly restartApp: (packageId: string) => TE.TaskEither<WorkflowError, void>;
  readonly reboot: () => TE.TaskEither<WorkflowError, void>;
  readonly inputTap: (coords: TapCoords) => TE.TaskEither<WorkflowError, void>;
  readonly waitForDevice: () => TE.TaskEither<WorkflowError, void>;
  readonly waitForActivity: (activity: string) => TE.TaskEither<WorkflowError, void>;
}

// -------------------------------------------------------------------------------------
// Error
// -------------------------------------------------------------------------------------

export interface WorkflowError {
  readonly type: "WorkflowError";
  readonly message: string;
}

const workflowError = (message: string): WorkflowError => ({ type: "WorkflowError", message });

// -------------------------------------------------------------------------------------
// Interpreters
// -------------------------------------------------------------------------------------

const interpretCommand =
  (env: WorkflowEnv) =>
  (cmd: Command): TE.TaskEither<WorkflowError, void> =>
    match(cmd)
      .with({ type: "restartApp" }, ({ packageId }) => env.capabilities.restartApp(packageId))
      .with({ type: "reboot" }, () => env.capabilities.reboot())
      .with({ type: "inputTap" }, ({ coords }) => env.capabilities.inputTap(coords))
      .with({ type: "waitForDevice" }, () => env.capabilities.waitForDevice())
      .with({ type: "waitForActivity" }, ({ activity }) => env.capabilities.waitForActivity(activity))
      .with({ type: "run" }, ({ scriptName }) =>
        pipe(
          TE.fromEither(findScript(env.scripts, scriptName)),
          TE.mapLeft((e) => workflowError(e.message)),
          TE.flatMap((script) => interpretCommands(env)(script.commands)),
        ),
      )
      .exhaustive();

// Interpreta una sequenza di comandi in ordine
const interpretCommands =
  (env: WorkflowEnv) =>
  (commands: readonly Command[]): TE.TaskEither<WorkflowError, void> =>
    pipe(
      commands.reduce<TE.TaskEither<WorkflowError, void>>(
        (acc, cmd) =>
          pipe(
            acc,
            TE.flatMap(() => interpretCommand(env)(cmd)),
          ),
        TE.right(undefined),
      ),
    );

// Esegue una strategia con la sua retry policy
const interpretStrategy =
  (env: WorkflowEnv) =>
  (strategy: WorkflowStrategy): TE.TaskEither<WorkflowError | PolicyDecodeError, void> =>
    pipe(
      TE.fromEither(decodePolicy(strategy.policy)),
      TE.flatMap((policy) => retrying(policy)(interpretCommands(env)(strategy.commands))),
    );

// Esegue le fasi in ordine, passa alla successiva se la corrente fallisce
export const interpretWorkflow =
  (env: WorkflowEnv) =>
  (workflow: Workflow): TE.TaskEither<WorkflowError | PolicyDecodeError, void> => {
    const { log } = env;

    const runStrategies = (
      strategies: readonly WorkflowStrategy[],
      index: number,
    ): TE.TaskEither<WorkflowError | PolicyDecodeError, void> => {
      if (index >= strategies.length)
        return TE.left(workflowError(`Workflow "${workflow.name}": all strategies exhausted`));

      const strategy = strategies[index]!;

      return pipe(
        TE.fromIO(() => log.info(`Workflow "${workflow.name}": starting strategy ${index + 1}/${strategies.length}`)),
        TE.flatMap(() => interpretStrategy(env)(strategy)),
        TE.orElse((error) => {
          log.error(`Workflow "${workflow.name}": strategy ${index + 1} failed — ${error.message}`);
          return runStrategies(strategies, index + 1);
        }),
      );
    };

    return runStrategies(workflow.strategies, 0);
  };

// -------------------------------------------------------------------------------------
// Recovery runner
// -------------------------------------------------------------------------------------

// esegue un workflow per nome dalla config
export const runWorkflow =
  (env: WorkflowEnv) =>
  (config: RecoveryConfig, workflowName: string): TE.TaskEither<WorkflowError | PolicyDecodeError, void> => {
    const workflow = config.workflows.find((w) => w.name === workflowName);
    if (!workflow) return TE.left(workflowError(`Workflow not found: "${workflowName}"`));

    return interpretWorkflow({ ...env, scripts: config.scripts })(workflow);
  };
