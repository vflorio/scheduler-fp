import type * as Config from "@supervisor/core/config";
import * as DateTime from "@supervisor/core/date-time";
import * as Schedule from "@supervisor/core/schedule";
import { flow } from "fp-ts/function";
import * as M from "fp-ts/Monoid";

// -------------------------------------------------------------------------------------
// Activation Gate
// -------------------------------------------------------------------------------------

// Costruisce lo Schedule dal WorkSchedule in config
export const toSchedule = (workSchedule: Config.WorkSchedule): Schedule.Schedule => {
  const range = Schedule.timeRange(DateTime.toTimeTuple(workSchedule.from), DateTime.toTimeTuple(workSchedule.to));

  const days = workSchedule.days.map(flow(DateTime.toDayNumber, Schedule.day));

  const anyDay = M.concatAll(Schedule.MonoidUnion)(days);

  return Schedule.MonoidIntersection.concat(anyDay, range);
};

// Restituisce il TimeSlot corrente
export const currentSlot = (): Schedule.TimeSlot => {
  const now = new Date();
  const day = DateTime.getDay(now);

  return { day, hour: now.getHours(), minute: now.getMinutes() };
};
