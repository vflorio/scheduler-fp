import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";
import { ActivationScheduleCodec } from "./activation/schedule";
import { of } from "./errors";
import { LogLevel } from "./logger";
import * as NetworkTarget from "./network-target";
import { PolicyJsonCodec } from "./retry/codec";
import { AdbEntryCodec, CameraEntryCodec, CandyboxEntryCodec, TvEntryCodec } from "./services/db";
import type { ValidationError } from "./validation";
import { ScriptJsonCodec, WorkflowJsonCodec } from "./workflow/codec";

// -------------------------------------------------------------------------------------
// Model - Configurazione del servizio
// -------------------------------------------------------------------------------------

// Credenziali Suitest
const SuitestCodec = t.type({
  baseUrl: t.string,
  tokenId: t.string,
  tokenPassword: t.string,
});

// Credenziali Slack
const SlackCodec = t.type({
  active: t.boolean,
  botToken: t.string,
});

// Configurazione monitoring con policy di polling
const MonitoringCodec = t.type({
  polling: PolicyJsonCodec,
});

// Configurazione logging
const LogCodec = t.intersection([t.type({ level: LogLevel }), t.partial({ path: t.string })]);

export type LogConfig = t.TypeOf<typeof LogCodec>; // Esportata e rinominato per servizio

// Configurazione connessione ADB
const AdbCodec = t.type({
  port: NetworkTarget.PortCodec,
  reconnect: PolicyJsonCodec,
});

const RecoveryCodec = t.type({
  scripts: t.array(ScriptJsonCodec),
  workflows: t.array(WorkflowJsonCodec),
});

const TrpcCodec = t.type({
  port: t.number,
  hostname: t.string,
});

const RegistryCodec = t.intersection([
  t.type({ dbPath: t.string }),
  t.partial({
    devices: t.partial({
      candyboxes: t.array(CandyboxEntryCodec),
      cameras: t.array(CameraEntryCodec),
      tvs: t.array(TvEntryCodec),
      adb: t.array(AdbEntryCodec),
    }),
  }),
]);

const ServiceConfigCodec = t.type({
  activationSchedule: ActivationScheduleCodec,
  suitest: SuitestCodec,
  slack: SlackCodec,
  monitoring: MonitoringCodec,
  adb: AdbCodec,
  log: LogCodec,
  recovery: RecoveryCodec,
  trpc: TrpcCodec,
  registry: RegistryCodec,
});

export type ServiceConfig = t.TypeOf<typeof ServiceConfigCodec>;

// -------------------------------------------------------------------------------------
// Validazione
// -------------------------------------------------------------------------------------

const formatErrors = (errors: t.Errors): string =>
  errors
    .map(
      (e) =>
        `  ${e.context
          .map((c) => c.key)
          .filter(Boolean)
          .join(".")} : ${JSON.stringify(e.value)}`,
    )
    .join("\n");

// Valida e decodifica un oggetto JSON in ServiceConfig
export const decode = (raw: unknown): E.Either<ValidationError, ServiceConfig> =>
  pipe(
    raw,
    ServiceConfigCodec.decode,
    E.mapLeft((errors) => of("ValidationError")(`Invalid configuration:\n${formatErrors(errors)}`)),
  );

// -------------------------------------------------------------------------------------
// Redazione - da usare ogni volta che la config viene esposta fuori dal processo (es. UI
// di sola lettura via tRPC): maschera le credenziali, non va mai loggata/servita raw.
// -------------------------------------------------------------------------------------

const REDACTED = "[redacted]";

export const redact = (config: ServiceConfig): ServiceConfig => ({
  ...config,
  suitest: { ...config.suitest, tokenId: REDACTED, tokenPassword: REDACTED },
  slack: { ...config.slack, botToken: REDACTED },
});
