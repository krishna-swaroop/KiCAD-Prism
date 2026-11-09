import type { ForecastChance, ForecastModelState } from "@/types/supply";
import { formatDay } from "./supply-format";

const DAY_MS = 86_400_000;
const NEAR_DAYS = 14;

function utc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Days from `today` to `iso`, both as dates. */
export function daysBetween(today: string, iso: string): number {
  return Math.round((utc(iso) - utc(today)) / DAY_MS);
}

/** "in about 5 days" within two weeks, "14 Dec" beyond (with the year when it is not this one). */
export function dateText(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  if (days <= 0) return "today";
  if (days <= NEAR_DAYS) return days === 1 ? "tomorrow" : `in about ${days} days`;
  return formatDay(iso, today);
}

/** "on 14 Dec" beyond two weeks, "in about 5 days" within. */
export function whenText(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  return days <= NEAR_DAYS ? dateText(iso, today) : `on ${formatDay(iso, today)}`;
}

/** "around 14 Dec (between 2 Dec and 9 Jan)", or "in about 5 days (3 to 9 days)" when it is near. */
export function rangeText(low: string, median: string, high: string, today: string): string {
  if (daysBetween(today, high) <= NEAR_DAYS) {
    const a = Math.max(daysBetween(today, low), 0);
    const b = Math.max(daysBetween(today, high), 0);
    return `${dateText(median, today)} (${a === b ? `${a}` : `${a} to ${b}`} days)`;
  }
  const lead = daysBetween(today, median) <= NEAR_DAYS ? dateText(median, today) : `around ${dateText(median, today)}`;
  return `${lead} (between ${formatDay(low, today)} and ${formatDay(high, today)})`;
}

/** "Likely (78%)": the word, with its number. */
export function chanceText(chance: Pick<ForecastChance, "word" | "percent">): string {
  return `${chance.word} (${chance.percent}%)`;
}

/** Whether a forecast should be drawn greyed: its model has not earned a place yet, or lost it. */
export function isGrey(model: Pick<ForecastModelState, "state"> | undefined): boolean {
  return !model || model.state !== "shown";
}

/** What the chip beside a greyed forecast says, and what hovering it explains. */
export function chipText(model: ForecastModelState): { label: string; title: string } {
  if (model.state === "paused") return { label: "Paused", title: model.reason || "Its latest checks fell outside what a shown forecast must hold" };
  return { label: "Learning", title: model.reason ? `Learning: ${model.reason}` : `Learning: ${model.checks} of ${model.needs} checks` };
}

/** "EUR 0.40 to 0.47" for a price range, or just the price when it is flat. */
export function priceRange(low: number, high: number, format: (value: number) => string, flat: boolean): string {
  return flat ? `${format(low)}, most likely unchanged` : `${format(low)} to ${format(high)}`;
}
