import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as Ord from "fp-ts/Ord";
import * as t from "io-ts";
import { DayOfWeek, OrdValidTimeString, TimeString } from "./date-time";
import { PolicyJsonCodec } from "./policy-codec";

// -------------------------------------------------------------------------------------
// Model - Configurazione del servizio
// -------------------------------------------------------------------------------------

// Schedule di lavoro: giorni attivi e range orario
const WorkScheduleRaw = t.type({
  days: t.array(DayOfWeek),
  from: TimeString,
  to: TimeString,
});

const WorkScheduleCodec = new t.Type<t.TypeOf<typeof WorkScheduleRaw>>(
  "WorkSchedule",
  WorkScheduleRaw.is,
  (u, c) =>
    pipe(
      WorkScheduleRaw.validate(u, c),
      E.flatMap((schedule) =>
        Ord.lt(OrdValidTimeString)(schedule.from, schedule.to)
          ? t.success(schedule)
          : t.failure(u, c, `workSchedule.from (${schedule.from}) must be before workSchedule.to (${schedule.to})`),
      ),
    ),
  t.identity,
);

export const workScheduleToString = (ws: t.TypeOf<typeof WorkScheduleCodec>): string =>
  `WorkSchedule(days: [${ws.days.join(", ")}], from: ${ws.from}, to: ${ws.to})`;

// Credenziali Suitest
const SuitestCodec = t.type({
  tokenId: t.string,
  tokenPassword: t.string,
});

// Credenziali Slack
const SlackCodec = t.type({
  botToken: t.string,
  channelId: t.string,
});

// Configurazione monitoring con policy di polling
const MonitoringCodec = t.type({
  polling: PolicyJsonCodec,
});

// Configurazione logging
const LogLevel = t.keyof({
  fatal: null,
  error: null,
  warn: null,
  info: null,
  debug: null,
  trace: null,
  silent: null,
});

export type LogLevel = t.TypeOf<typeof LogLevel>;

const LogCodec = t.intersection([t.type({ level: LogLevel }), t.partial({ path: t.string })]);

export type LogConfig = t.TypeOf<typeof LogCodec>;

// Configurazione completa del servizio
const ServiceConfigCodec = t.type({
  workSchedule: WorkScheduleCodec,
  suitest: SuitestCodec,
  slack: SlackCodec,
  monitoring: MonitoringCodec,
  adbPort: t.number,
  log: LogCodec,
});

export type ServiceConfig = t.TypeOf<typeof ServiceConfigCodec>;
export type WorkSchedule = t.TypeOf<typeof WorkScheduleCodec>;

// -------------------------------------------------------------------------------------
// Validazione
// -------------------------------------------------------------------------------------

export interface ConfigDecodeError {
  readonly type: "ConfigDecodeError";
  readonly message: string;
}

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
export const decode = (raw: unknown): E.Either<ConfigDecodeError, ServiceConfig> =>
  pipe(
    raw,
    ServiceConfigCodec.decode,
    E.mapLeft((errors) => ({
      type: "ConfigDecodeError" as const,
      message: `Invalid configuration:\n${formatErrors(errors)}`,
    })),
  );
