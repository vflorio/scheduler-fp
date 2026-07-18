import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as M from "fp-ts/Monoid";
import * as Ord from "fp-ts/Ord";
import * as t from "io-ts";
import * as DateTime from "./date-time";
import * as Schedule from "./schedule";

// Schedule di lavoro: giorni attivi e range orario
const WorkScheduleRaw = t.type({
  days: t.array(DateTime.DayOfWeek),
  from: DateTime.TimeString,
  to: DateTime.TimeString,
});

export const WorkScheduleCodec = new t.Type<t.TypeOf<typeof WorkScheduleRaw>>(
  "WorkSchedule",
  WorkScheduleRaw.is,
  (value, context) =>
    pipe(
      WorkScheduleRaw.validate(value, context),
      E.flatMap((schedule) =>
        Ord.lt(DateTime.OrdValidTimeString)(schedule.from, schedule.to)
          ? t.success(schedule)
          : t.failure(
              value,
              context,
              `workSchedule.from (${schedule.from}) must be before workSchedule.to (${schedule.to})`,
            ),
      ),
    ),
  t.identity,
);

export type WorkSchedule = t.TypeOf<typeof WorkScheduleCodec>;

// Convertions

// biome-ignore lint/suspicious/noShadowRestrictedNames: <es modules>
export const toString = (ws: t.TypeOf<typeof WorkScheduleCodec>): string =>
  `WorkSchedule(days: [${ws.days.join(", ")}], from: ${ws.from}, to: ${ws.to})`;

// Costruisce lo Schedule dal WorkSchedule in config
export const toSchedule = (workSchedule: WorkSchedule): Schedule.Schedule => {
  const range = Schedule.timeRange(DateTime.toTimeTuple(workSchedule.from), DateTime.toTimeTuple(workSchedule.to));

  const days = workSchedule.days.map(flow(DateTime.toDayNumber, Schedule.day));

  const anyDay = M.concatAll(Schedule.MonoidUnion)(days);

  return Schedule.MonoidIntersection.concat(anyDay, range);
};
