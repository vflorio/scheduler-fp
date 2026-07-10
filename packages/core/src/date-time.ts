import * as N from "fp-ts/number";
import * as Ord from "fp-ts/Ord";
import * as t from "io-ts";
import { match } from "ts-pattern";

// -------------------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------------------

// Start of week = monday

export const DayOfWeek = t.union([
  t.literal("monday"),
  t.literal("tuesday"),
  t.literal("wednesday"),
  t.literal("thursday"),
  t.literal("friday"),
  t.literal("saturday"),
  t.literal("sunday"),
]);

export type DayOfWeek = t.TypeOf<typeof DayOfWeek>;

export const toDayNumber = (day: DayOfWeek): number =>
  match<DayOfWeek>(day)
    .with("monday", () => 0)
    .with("tuesday", () => 1)
    .with("wednesday", () => 2)
    .with("thursday", () => 3)
    .with("friday", () => 4)
    .with("saturday", () => 5)
    .with("sunday", () => 6)
    .exhaustive();

// -------------------------------------------------------------------------------------
// TimeString - format "HH:MM" (00-23:00-59) -> [hour, minute]
// -------------------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidTime = (t: string): t is ValidTimeString => TIME_RE.test(t);

const validateTimeString = (u: unknown, c: t.Context): t.Validation<ValidTimeString> =>
  typeof u === "string" && isValidTime(u) ? t.success(u) : t.failure(u, c, "Expected: HH:MM (00-23:00-59)");

const isTimeString = (u: unknown): u is ValidTimeString => typeof u === "string" && TIME_RE.test(u);

export type ValidTimeString = `${number}:${number}`; // 00-23:00-59

export const ValidTimeString = new t.Type<ValidTimeString, ValidTimeString, unknown>(
  "TimeString",
  isTimeString,
  validateTimeString,
  t.identity,
);

export const toTimeTuple = (time: ValidTimeString): [number, number] => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return [h, m];
};

const toMinutes = (time: ValidTimeString): number => {
  const [h, m] = toTimeTuple(time);
  return h * 60 + m;
};

export const OrdValidTimeString: Ord.Ord<ValidTimeString> = Ord.contramap(toMinutes)(N.Ord);

export const getDay = (date: Date): number => {
  const jsDay = date.getDay(); // 0=dom, 1=lun ... 6=sab
  // Convertiamo in 0=lun ... 6=dom
  return jsDay === 0 ? 6 : jsDay - 1;
};

// -------------------------------------------------------------------------------------
// DurationString - format "Ns", "Nm", "Nh" (seconds, minutes, hours) -> milliseconds
// -------------------------------------------------------------------------------------

const DURATION_RE = /^(\d+(?:\.\d+)?)(s|m|h)$/;

const DURATION_MULTIPLIERS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
} as const;

export type DurationString = `${number}${"s" | "m" | "h"}`;

const isDurationString = (u: unknown): u is DurationString => typeof u === "string" && DURATION_RE.test(u);

const validateDurationString = (u: unknown, c: t.Context): t.Validation<DurationString> =>
  isDurationString(u) ? t.success(u) : t.failure(u, c, "Expected: <number>s|m|h (e.g. 30s, 5m, 1h)");

export const DurationString = new t.Type<DurationString, DurationString, unknown>(
  "DurationString",
  isDurationString,
  validateDurationString,
  t.identity,
);

export const durationToMs = (duration: DurationString): number => {
  const m = DURATION_RE.exec(duration);
  if (!m?.[1] || !m?.[2]) return 0; // non raggiungibile dopo validazione

  const value = Number.parseFloat(m[1]);
  const unit = m[2] as "s" | "m" | "h";

  return value * (DURATION_MULTIPLIERS?.[unit] ?? 0);
};
