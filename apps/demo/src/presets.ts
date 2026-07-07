import {
  always,
  block,
  day,
  duration,
  recurring,
  type ScheduleStep,
  timeRange,
  weekdays,
  weekend,
} from "@scheduler-fp/core";

export { config } from "./env";

interface Preset {
  readonly name: string;
  readonly description: string;
  readonly steps: ScheduleStep[];
}

export const PRESETS: Preset[] = [
  {
    name: "Eccezione giornaliera",
    description: "Tutti i giorni 9-18, escludi Lunedì, aggiungi Lun 18-19",
    steps: [
      { label: "Tutti i giorni 9:00-18:00", schedule: timeRange([9, 0], [18, 0]), op: "union" },
      { label: "Lunedì", schedule: day(0), op: "subtract" },
      { label: "Lun 18:00-19:00", schedule: block(0, [18, 0], [19, 0]), op: "union" },
    ],
  },
  {
    name: "Digital signage negozio",
    description: "Promo feriali 9-20, weekend 10-18, blackout pausa pranzo",
    steps: [
      { label: "Feriali 9:00-20:00", schedule: weekdays([9, 0], [20, 0]), op: "union" },
      { label: "Weekend 10:00-18:00", schedule: weekend([10, 0], [18, 0]), op: "union" },
      { label: "Pausa pranzo 13:00-14:00", schedule: timeRange([13, 0], [14, 0]), op: "subtract" },
    ],
  },
  {
    name: "Palinsesto TV",
    description: "TG mattina e sera + spot ricorrenti in fascia diurna",
    steps: [
      { label: "TG Mattina 7:00-7:30", schedule: duration([7, 0], 30), op: "union" },
      { label: "TG Sera 20:00-20:30", schedule: duration([20, 0], 30), op: "union" },
      { label: "Spot 2min ogni 20min", schedule: recurring(20, 2), op: "union" },
      { label: "Solo fascia 6:00-23:00", schedule: timeRange([6, 0], [23, 0]), op: "intersection" },
    ],
  },
  {
    name: "Supporto clienti",
    description: "Lun-Ven 8-18, Sab mattina, mai Domenica",
    steps: [
      { label: "Feriali 8:00-18:00", schedule: weekdays([8, 0], [18, 0]), op: "union" },
      { label: "Sab 9:00-13:00", schedule: block(5, [9, 0], [13, 0]), op: "union" },
    ],
  },
  {
    name: "Manutenzione notturna",
    description: "Sempre attivo h24, escludi finestra manutenzione 2-5 AM",
    steps: [
      { label: "Sempre attivo", schedule: always, op: "union" },
      { label: "Manutenzione 2:00-5:00", schedule: timeRange([2, 0], [5, 0]), op: "subtract" },
      { label: "Niente weekend", schedule: weekend([0, 0], [23, 59]), op: "subtract" },
    ],
  },
  {
    name: "Ristorante",
    description: "Pranzo e cena, chiuso Martedì, brunch domenicale",
    steps: [
      { label: "Pranzo 12:00-14:30", schedule: timeRange([12, 0], [14, 30]), op: "union" },
      { label: "Cena 19:00-23:00", schedule: timeRange([19, 0], [23, 0]), op: "union" },
      { label: "Chiuso Martedì", schedule: day(1), op: "subtract" },
      { label: "Brunch Dom 10:00-14:00", schedule: block(6, [10, 0], [14, 0]), op: "union" },
    ],
  },
];
