import type { PartForecast, PartHistory } from "@/types/supply";
import { vendorColor } from "./vendor-colors";

export type HistoryKind = "stock" | "price";

export interface HistoryKey {
  /** The row key of the line. */
  key: string;
  /** The row key of its dashed continuation, when the distributor has not been read for longer than the part's rate allows. */
  dashed: string | null;
  name: string;
  color: string;
  /** Whether it is the part's total, drawn thin and grey. */
  total: boolean;
}

export interface HistoryRows {
  rows: Array<Record<string, number | string | null>>;
  keys: HistoryKey[];
}

const FALLBACK = ["#6b7280", "#a855f7", "#14b8a6", "#eab308"];
export const TOTAL_KEY = "total";

/** The days a timeframe choice asks for. `null` is everything recorded. */
export const TIMEFRAMES: ReadonlyArray<{ id: string; label: string; days: number }> = [
  { id: "1m", label: "1 month", days: 30 },
  { id: "3m", label: "3 months", days: 90 },
  { id: "6m", label: "6 months", days: 180 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "all", label: "All", days: 3650 },
];

/** One row per day with a value for each distributor, ready for a line chart. `hidden` are connector ids switched off in the legend. */
export function historyRows(history: PartHistory, kind: HistoryKind, hidden: ReadonlySet<string>): HistoryRows {
  const days = new Set<string>();
  const keys: HistoryKey[] = [];
  const values = new Map<string, Map<string, number>>();
  history.connectors.forEach((line, index) => {
    if (hidden.has(line.connector_id)) return;
    const points = new Map<string, number>((kind === "stock" ? line.stock : line.price).map(([day, value]) => [day, value]));
    if (points.size === 0) return;
    values.set(line.connector_id, points);
    points.forEach((_, day) => days.add(day));
    keys.push({
      key: line.connector_id, dashed: line.stale ? `${line.connector_id}~` : null, name: line.name,
      color: vendorColor(line.provider) ?? FALLBACK[index % FALLBACK.length], total: false,
    });
  });
  if (kind === "stock" && !hidden.has(TOTAL_KEY) && history.total.length > 0) {
    values.set(TOTAL_KEY, new Map(history.total.map(([day, value]) => [day, value])));
    history.total.forEach(([day]) => days.add(day));
    keys.push({ key: TOTAL_KEY, dashed: null, name: "Counted in total", color: "#9ca3af", total: true });
  }
  const ordered = [...days].sort();
  const last = ordered[ordered.length - 1] ?? "";
  const rows = ordered.map((day) => {
    const row: Record<string, number | string | null> = { day };
    for (const item of keys) row[item.key] = values.get(item.key)?.get(day) ?? null;
    return row;
  });
  // A stale line goes on, dashed, from its last value to the end of the chart.
  for (const item of keys) {
    if (!item.dashed) continue;
    const points = values.get(item.key);
    if (!points || points.size === 0) continue;
    const lastDay = [...points.keys()].sort().pop() as string;
    const lastValue = points.get(lastDay) as number;
    for (const row of rows) {
      const day = String(row.day);
      row[item.dashed] = day >= lastDay && day <= last ? lastValue : null;
    }
  }
  return { rows, keys };
}

/**
 * The vertical range the readings need, with a little room: a forecast that runs far beyond it is cut off at the chart's edge
 * and does not squeeze the real lines together. Null when nothing is drawn.
 */
export function readingsDomain(base: HistoryRows, kind: HistoryKind, extra: number | null = null): [number, number] | null {
  const values: number[] = [];
  for (const row of base.rows) for (const item of base.keys) { const value = row[item.key]; if (typeof value === "number") values.push(value); }
  if (extra !== null) values.push(extra);
  if (values.length === 0) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (kind === "stock") return [0, Math.max(Math.ceil(high * 1.15), 1)];
  const pad = high > low ? (high - low) * 0.2 : Math.max(Math.abs(high) * 0.1, 0.0001);
  return [Math.max(low - pad, 0), high + pad];
}

/** The forecast keys of a chart row: the most likely value and its band (low, high). */
export const FORECAST_KEY = "forecast";
export const BAND_KEY = "band";

export interface ForecastOverlay {
  /** The day the real lines end and the forecast begins. */
  from: string;
  /** The model has not earned a place: drawn as a grey dashed outline and labelled. */
  grey: boolean;
}

function put(rows: HistoryRows["rows"], day: string, median: number, low: number, high: number): void {
  const found = rows.find((row) => row.day === day);
  if (found) {
    found[FORECAST_KEY] = median;
    found[BAND_KEY] = [low, high] as unknown as number;
    return;
  }
  rows.push({ day, [FORECAST_KEY]: median, [BAND_KEY]: [low, high] as unknown as number });
}

/** The row key of a distributor's forecast line; it carries a "~" so the tooltip lists the distributor once. */
export const forecastKeyOf = (connectorId: string) => `${connectorId}~f`;

const DAY_MS = 86_400_000;

/** A straight line through the points, a value for every day between them (the ends included, the first left out when `skipFirst`). */
export function dailyBetween(knots: ReadonlyArray<readonly [string, number]>): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let index = 0; index < knots.length - 1; index += 1) {
    const [fromDay, fromValue] = knots[index];
    const [toDay, toValue] = knots[index + 1];
    const start = Date.parse(`${fromDay}T00:00:00Z`);
    const days = Math.round((Date.parse(`${toDay}T00:00:00Z`) - start) / DAY_MS);
    for (let step = 1; step <= days; step += 1) {
      out.push([new Date(start + step * DAY_MS).toISOString().slice(0, 10), fromValue + ((toValue - fromValue) * step) / days]);
    }
  }
  return out;
}

/** The low and high of a distributor's projected value on a day; the tooltip reads them from the row. */
export const lowKeyOf = (connectorId: string) => `${connectorId}~lo`;
export const highKeyOf = (connectorId: string) => `${connectorId}~hi`;

function setValue(rows: HistoryRows["rows"], day: string, key: string, value: number): void {
  const found = rows.find((row) => row.day === day);
  if (found) found[key] = value;
  else rows.push({ day, [key]: value });
}

/**
 * Each distributor's forecast as a line of its own, in its colour: from its last reading onward, on the days the forecast has.
 * Adds to `rows` and returns the keys of the lines to draw. A distributor switched off in the legend has none.
 */
export function withDistributorForecasts(
  history: PartHistory, kind: HistoryKind, rows: HistoryRows["rows"], forecast: PartForecast | null | undefined, hidden: ReadonlySet<string>,
): string[] {
  const by = forecast?.available ? forecast.by_distributor : undefined;
  if (!by) return [];
  const drawn: string[] = [];
  const points = (kind === "stock" ? by.stock : by.price).flatMap((item) => {
    if (hidden.has(item.connector_id)) return [];
    const line = history.connectors.find((entry) => entry.connector_id === item.connector_id);
    const readings = line ? (kind === "stock" ? line.stock : line.price) : [];
    const lastReading = readings[readings.length - 1];
    if (!lastReading) return [];
    const future: Array<[string, number]> = "path" in item
      ? item.path.flatMap((point): Array<[string, number]> => (point.day > lastReading[0] ? [[point.day, point.median]] : []))
      // The price is known at 30 and 90 days; a value for every day between lets the hover find one wherever the pointer is.
      : dailyBetween([[lastReading[0], lastReading[1]], [item.h30.date, item.h30.median], [item.h90.date, item.h90.median]]);
    let ranges: Array<[string, number, number]> = [];
    if (!("path" in item)) {
      const knots = (pick: "low" | "high") => dailyBetween([[lastReading[0], lastReading[1]], [item.h30.date, item.h30[pick]], [item.h90.date, item.h90[pick]]]);
      const highs = knots("high");
      ranges = knots("low").map(([day, low], at) => [day, low, highs[at][1]]);
    }
    return future.length > 0 ? [{ id: item.connector_id, from: lastReading, future, ranges }] : [];
  });
  for (const item of points) {
    const key = forecastKeyOf(item.id);
    setValue(rows, item.from[0], key, item.from[1]);
    for (const [day, value] of item.future) setValue(rows, day, key, value);
    for (const [day, low, high] of item.ranges) {
      setValue(rows, day, lowKeyOf(item.id), low);
      setValue(rows, day, highKeyOf(item.id), high);
    }
    drawn.push(item.id);
  }
  rows.sort((a, b) => String(a.day).localeCompare(String(b.day)));
  return drawn;
}

/**
 * Rows continued into the future with a forecast: stock from its simulated path (the total line), price from the ranges at 30 and 90 days.
 * Returns the overlay to draw, or null when there is nothing to add (no forecast, the total switched off, no readings).
 */
export function withForecast(
  history: PartHistory, kind: HistoryKind, base: HistoryRows, forecast: PartForecast | null | undefined, hidden: ReadonlySet<string>,
): { rows: HistoryRows["rows"]; overlay: ForecastOverlay | null } {
  const rows = base.rows.map((row) => ({ ...row }));
  if (!forecast?.available) return { rows, overlay: null };
  if (kind === "stock") {
    if (hidden.has(TOTAL_KEY) || history.total.length === 0 || !forecast.path?.length) return { rows, overlay: null };
    const [from, value] = history.total[history.total.length - 1];
    put(rows, from, value, value, value);
    for (const point of forecast.path) if (point.day > from) put(rows, point.day, point.median, point.low, point.high);
    rows.sort((a, b) => String(a.day).localeCompare(String(b.day)));
    return { rows, overlay: { from, grey: forecast.buy_state?.["4w"]?.state !== "shown" } };
  }
  const price = forecast.price;
  const last = history.connectors.flatMap((line) => line.price.map(([day]) => day)).sort().pop();
  if (!price || !last) return { rows, overlay: null };
  put(rows, last, price.now, price.now, price.now);
  const along = (pick: (point: { median: number; low: number; high: number }) => number, start: number) => dailyBetween([[last, start], [price.h30.date, pick(price.h30)], [price.h90.date, pick(price.h90)]]);
  const medians = along((point) => point.median, price.now);
  const lows = along((point) => point.low, price.now);
  const highs = along((point) => point.high, price.now);
  medians.forEach(([day, median], at) => put(rows, day, median, lows[at][1], highs[at][1]));
  rows.sort((a, b) => String(a.day).localeCompare(String(b.day)));
  return { rows, overlay: { from: last, grey: price.h90.state.state !== "shown" } };
}
