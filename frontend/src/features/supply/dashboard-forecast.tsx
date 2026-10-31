import { CalendarClock } from "lucide-react";

import type { ForecastEvent, ForecastModelState } from "@/types/supply";
import { ChartCard } from "./chart-card";
import { chanceText, dateText } from "./forecast-text";
import { forecastWord } from "./forecast-words";

/** The tile's number is withheld while the four-week model is learning, and the tile says how far along it is. */
export function likelyOutTile(forecast: { likely_out_4w: number; state: ForecastModelState } | undefined) {
  if (!forecast) return null;
  const learning = forecast.state.state !== "shown";
  return {
    label: "Likely out in 4 weeks",
    value: learning ? 0 : forecast.likely_out_4w,
    learning: learning ? `${forecast.state.state === "paused" ? "Paused" : "Learning"}: ${forecast.state.checks} of ${forecast.state.needs} checks` : undefined,
  };
}

/** The next ten expected events across the tracked parts, soonest first. Shown only once the models behind them have earned a place. */
export function ComingUpCard({ events, today, onOpenPart }: { events: ForecastEvent[]; today: string; onOpenPart: (partId: string) => void }) {
  return (
    <ChartCard title="Coming up" info="What Prism expects in the next weeks, from the forecasts that have a good record." answer={events.length === 0 ? "Nothing is expected soon" : undefined}>
      {events.length === 0 ? null : (
        <ul className="space-y-1 text-sm">
          {events.map((event) => (
            <li key={`${event.kind}-${event.part_id}`}>
              <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left hover:underline" onClick={() => onOpenPart(event.part_id)}>
                <span className="min-w-0 truncate">
                  <CalendarClock aria-hidden className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{event.mpn}</span> {event.text}
                  {event.probability !== null ? <span className="text-xs text-muted-foreground"> ({chanceText(forecastWord(event.probability))})</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{dateText(event.date, today)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
