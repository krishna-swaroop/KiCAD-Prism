import { chanceText } from "./forecast-text";
import { usePartForecast } from "./use-part-forecast";

/** One line in the BOM drawer: whether the part can be bought for this build in eight weeks. Nothing until that forecast has a good record. */
export function BomForecastLine({ partId, need }: { partId: string; need: number }) {
  const { data } = usePartForecast(partId, Math.max(need, 1), undefined);
  const week = data?.weeks?.[7];
  if (!data?.available || !week || data.buy_state?.["8w"]?.state !== "shown") return null;
  return <p className="text-xs text-muted-foreground">Can be bought for this build in 8 weeks: <strong className="text-foreground">{chanceText(week)}</strong></p>;
}
