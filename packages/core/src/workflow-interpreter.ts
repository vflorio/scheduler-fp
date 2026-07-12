import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
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
  readonly logger: Logger;
  readonly capabilities: CommandCapabilities;
  readonly scripts: readonly Script[];
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
// Effect type
// -------------------------------------------------------------------------------------

type Effect<A> = RTE.ReaderTaskEither<WorkflowEnv, WorkflowError | PolicyDecodeError, A>;

// -------------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------------

const logInfo =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.info(message));

const logError =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.error(message));

const commandToString = (cmd: Command): string =>
  match(cmd)
    .with({ type: "restartApp" }, ({ packageId }) => `restartApp(${packageId})`)
    .with({ type: "reboot" }, () => "reboot")
    .with({ type: "inputTap" }, ({ coords }) => `inputTap(${coords.x}, ${coords.y})`)
    .with({ type: "waitForDevice" }, () => "waitForDevice")
    .with({ type: "waitForActivity" }, ({ activity }) => `waitForActivity(${activity})`)
    .with({ type: "run" }, ({ scriptName }) => `run(${scriptName})`)
    .exhaustive();

const liftCommand =
  (effect: (command: CommandCapabilities) => TE.TaskEither<WorkflowError, void>): Effect<void> =>
  ({ capabilities }) =>
    effect(capabilities);

// -------------------------------------------------------------------------------------
// Interpreters
// -------------------------------------------------------------------------------------

const interpretCommand = (cmd: Command): Effect<void> =>
  pipe(
    logInfo(`  → ${commandToString(cmd)}`),
    RTE.flatMap(() =>
      match(cmd)
        .with({ type: "restartApp" }, ({ packageId }) => liftCommand((c) => c.restartApp(packageId)))
        .with({ type: "reboot" }, () => liftCommand((c) => c.reboot()))
        .with({ type: "inputTap" }, ({ coords }) => liftCommand((c) => c.inputTap(coords)))
        .with({ type: "waitForDevice" }, () => liftCommand((c) => c.waitForDevice()))
        .with({ type: "waitForActivity" }, ({ activity }) => liftCommand((c) => c.waitForActivity(activity)))
        .with({ type: "run" }, ({ scriptName }) =>
          pipe(
            RTE.asks<WorkflowEnv, readonly Script[]>((env) => env.scripts),
            RTE.flatMapEither((scripts) => findScript(scripts, scriptName)),
            RTE.mapLeft((e) => workflowError(e.message)),
            RTE.flatMap((script) => interpretCommands(script.commands)),
          ),
        )
        .exhaustive(),
    ),
    RTE.tapError((error) => logError(`  ✗ ${commandToString(cmd)} failed: ${error.message}`)),
  );

// Interpreta una sequenza di comandi in ordine
const interpretCommands = (commands: readonly Command[]): Effect<void> =>
  pipe(
    commands.reduce<Effect<void>>(
      (acc, cmd) =>
        pipe(
          acc,
          RTE.flatMap(() => interpretCommand(cmd)),
        ),
      RTE.right(undefined),
    ),
  );

// Esegue una strategia con la sua retry policy
const interpretStrategy = (strategy: WorkflowStrategy): Effect<void> =>
  pipe(
    RTE.fromEither(decodePolicy(strategy.policy)),
    RTE.flatMap((policy) => (env: WorkflowEnv) => retrying(policy)(interpretCommands(strategy.commands)(env))),
  );

// Esegue le fasi in ordine, passa alla successiva se la corrente fallisce
export const interpretWorkflow = (workflow: Workflow): Effect<void> => {
  const runStrategies = (strategies: readonly WorkflowStrategy[], index: number): Effect<void> => {
    if (index >= strategies.length)
      return RTE.left(workflowError(`Workflow "${workflow.name}": all strategies exhausted`));

    const strategy = strategies[index]!;

    return pipe(
      logInfo(`Workflow "${workflow.name}": starting strategy ${index + 1}/${strategies.length}`),
      RTE.flatMap(() => interpretStrategy(strategy)),
      RTE.orElse((error) =>
        pipe(
          logError(`Workflow "${workflow.name}": strategy ${index + 1} failed — ${error.message}`),
          RTE.flatMap(() => runStrategies(strategies, index + 1)),
        ),
      ),
    );
  };

  return runStrategies(workflow.strategies, 0);
};

// -------------------------------------------------------------------------------------
// Recovery runner
// -------------------------------------------------------------------------------------

// esegue un workflow per nome dalla config
export const runWorkflow = (config: RecoveryConfig, workflowName: string): Effect<void> => {
  const workflow = config.workflows.find((w) => w.name === workflowName);
  if (!workflow) return RTE.left(workflowError(`Workflow not found: "${workflowName}"`));

  return (env) => interpretWorkflow(workflow)({ ...env, scripts: config.scripts });
};
