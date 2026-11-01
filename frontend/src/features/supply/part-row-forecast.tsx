import type { ForecastState, SupplyPartRow } from "@/types/supply";
import { chanceText, dateText } from "./forecast-text";
import { forecastWord } from "./forecast-words";

const LIKELY_NOW = 0.7;

/**
 * "out ~14 Dec" under a row's stock, once the runout model has earned a place. The hover text has the range and the chance;
 * it is coloured as a warning when the part is likely (70% or more) to be out everywhere within four weeks. Nothing while the model
 * is learning: the row keeps its straight-line "runs out in about N days".
 */
export function RowRunout({ part, state }: { part: SupplyPartRow; state: ForecastState | undefined }) {
  const forecast = part.forecast;
  if (state !== "shown" || !forecast?.runout || forecast.out_now) return null;
  const run = forecast.runout;
  const chance = forecastWord(forecast.p_out_4w ?? 0);
  const title = `Most likely ${dateText(run.median_date, forecast.made_on)}; between ${dateText(run.low_date, forecast.made_on)} and ${dateText(run.high_date, forecast.made_on)}. Out everywhere within 4 weeks: ${chanceText(chance)}.`;
  const warn = (forecast.p_out_4w ?? 0) >= LIKELY_NOW;
  return <div className={`text-xs ${warn ? "text-warning" : "text-muted-foreground"}`} title={title}>out ~{dateText(run.median_date, forecast.made_on).replace(/^in about /, "in ")}</div>;
}
