import * as E from "fp-ts/Either";
import type { PolicyJson } from "./retry-codec";

// -------------------------------------------------------------------------------------
// Model — Recovery Scripts & Workflows
// -------------------------------------------------------------------------------------

// Coordinate per tap ADB (valori normalizzati 0-1 o pixel)
export type TapCoords = { readonly x: number; readonly y: number };

// Discriminated union dei comandi supportati.
// JSON format: ["commandName", ...args] -> viene decodificato nel tipo corretto.
export type Command =
  | { readonly type: "restartApp"; readonly packageId: string }
  | { readonly type: "reboot" }
  | { readonly type: "inputTap"; readonly coords: TapCoords }
  | { readonly type: "waitForDevice" }
  | { readonly type: "waitForActivity"; readonly activity: string }
  | { readonly type: "run"; readonly scriptName: string };

// Uno script è una sequenza di comandi con un nome identificativo
// JSON: ["nome-script", [command, command, ...]]
export interface Script {
  readonly name: string;
  readonly commands: readonly Command[];
}

// Una fase di recovery ha comandi + policy di retry
export interface WorkflowStrategy {
  readonly commands: readonly Command[];
  readonly policy: PolicyJson;
}

// Un workflow ha un nome e fasi ordinate (primary, secondary, ...)
export interface Workflow {
  readonly name: string;
  readonly strategies: readonly WorkflowStrategy[];
}

// Configurazione recovery completa
export interface RecoveryConfig {
  readonly scripts: readonly Script[];
  readonly workflows: readonly Workflow[];
}

export interface WorkflowDecodeError {
  readonly type: "WorkflowDecodeError";
  readonly message: string;
}

// -------------------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------------------

// Risolve un nome script dall'elenco
export const findScript = (scripts: readonly Script[], name: string): E.Either<WorkflowDecodeError, Script> =>
  E.fromNullable({ type: "WorkflowDecodeError" as const, message: `Script not found: "${name}"` })(
    scripts.find((s) => s.name === name) ?? null,
  );
