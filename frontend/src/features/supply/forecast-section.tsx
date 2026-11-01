import type { ReactNode } from "react";

import type { ForecastModelState, PartForecast } from "@/types/supply";
import { ModelChip } from "./forecast-chip";
import { chanceText, dateText, isGrey, priceRange, rangeText, whenText } from "./forecast-text";
import { formatLeadTime, formatPrice } from "./supply-format";

function Line({ model, children }: { model: ForecastModelState | undefined; children: ReactNode }) {
  return (
    <div className={isGrey(model) ? "text-muted-foreground" : ""}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span>{children}</span>
        <ModelChip model={model} />
      </div>
    </div>
  );
}

/** Twelve cells, one a week: the darker, the likelier the part can be bought that week. */
function WeekStrip({ forecast, grey }: { forecast: PartForecast; grey: boolean }) {
  return (
    <ol aria-label="Chance it can be bought, week by week" className="flex gap-0.5">
      {(forecast.weeks ?? []).map((week) => (
        <li
          key={week.week}
          title={`Week ${week.week}, ${dateText(week.date, forecast.today)}: ${chanceText(week)}`}
          aria-label={`Week ${week.week}: ${chanceText(week)}`}
          className="h-4 w-5 border"
          style={{ backgroundColor: grey ? `hsl(var(--muted-foreground) / ${0.08 + week.probability * 0.3})` : `hsl(var(--primary) / ${0.08 + week.probability * 0.8})` }}
        />
      ))}
    </ol>
  );
}




/**
 * What Prism expects for the part: the chance it can be bought, when it runs out, when a distributor is back, where its price is going.
 * A forecast whose model has not earned a place is greyed and labelled.
 */
export function ForecastSection({ forecast, currency, titled = true }: {
  forecast: PartForecast | null;
  currency: string;
  /** False inside a section that already carries the title. */
  titled?: boolean;
}) {
  if (!forecast) return null;
  // It is made for the part's price quantity (the pencil beside the price); there is no second counter here.
  const header = titled ? <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Forecast</h3> : null;
  if (!forecast.available) {
    return (
      <section aria-label="Forecast" className="space-y-1">
        {header}
        <p className="text-sm text-muted-foreground">{forecast.reason === "no_readings" ? "Not read yet" : "Under a week of readings"}</p>
      </section>
    );
  }
  const today = forecast.today;
  const buy = forecast.weeks?.[3];
  const buyModel = forecast.buy_state?.["4w"];
  const format = (value: number) => formatPrice(String(value), currency);
  return (
    <section aria-label="Forecast" className="space-y-2">
      {header}
      {buy ? (
        <div className="space-y-1">
          <Line model={buyModel}>
            Can be bought {whenText(buy.date, today)}: <strong>{chanceText(buy)}</strong>
          </Line>
          <WeekStrip forecast={forecast} grey={isGrey(buyModel)} />
        </div>
      ) : null}
      {forecast.out_now ? (
        <p className="text-sm">Out of stock at every distributor now.</p>
      ) : forecast.runout ? (
        <Line model={forecast.runout.state}>
          Runs out <strong>{rangeText(forecast.runout.low, forecast.runout.median, forecast.runout.high, today)}</strong>
          {forecast.inputs?.from_similar ? <span className="text-xs text-muted-foreground"> (from similar parts)</span> : null}
        </Line>
      ) : null}
      {forecast.out_everywhere ? (
        <p className={`text-sm ${isGrey(forecast.buy_state?.["8w"]) ? "text-muted-foreground" : ""}`}>Out everywhere within 8 weeks: <strong>{chanceText(forecast.out_everywhere["8w"])}</strong></p>
      ) : null}
      {(forecast.back ?? []).map((item) => (
        <Line key={item.connector_id} model={item.state}>
          {item.name} back <strong>{rangeText(item.low, item.median, item.high, today)}</strong>
          {item.quote_days ? <span className="text-xs text-muted-foreground"> (quoted {formatLeadTime(item.quote_days)})</span> : null}
        </Line>
      ))}
      {forecast.price ? (
        <Line model={forecast.price.h90.state}>
          In 90 days, at its price quantity: <strong>{priceRange(forecast.price.h90.low, forecast.price.h90.high, format, forecast.price.h90.flat)}</strong>
        </Line>
      ) : null}
    </section>
  );
}

/** The chance of an end-of-life change, which belongs under the Outlook band: the rule-based outlook and this model speak of the same thing. */
export function EndOfLifeLine({ forecast }: { forecast: PartForecast | null }) {
  const eol = forecast?.end_of_life;
  if (!eol) return null;
  return (
    <Line model={eol.state}>
      Chance of an end-of-life change within 12 months: <strong>{chanceText(eol.p12)}</strong>
    </Line>
  );
}
