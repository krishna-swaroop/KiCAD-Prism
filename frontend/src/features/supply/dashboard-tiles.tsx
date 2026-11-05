import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export interface Tile {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  /** More of it is worse. */
  bad?: boolean;
  /** Withheld while a forecast behind the figure is still learning: shown instead of the number. */
  learning?: string;
  /** Its stored values over the last 30 days, oldest first. */
  history?: number[];
  onClick: () => void;
}

/** How much a figure moved over the last 7 stored days. Zero when there are fewer than two. */
export function weekChange(history: readonly number[] | undefined): number {
  if (!history || history.length < 2) return 0;
  return history[history.length - 1] - history[Math.max(0, history.length - 8)];
}

export function TileButton({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  const value = tile.value ?? 0;
  const change = weekChange(tile.history);
  const worse = tile.bad ? change > 0 : false;
  return (
    <button type="button" onClick={tile.onClick} className="flex flex-col gap-1 border p-3 text-left hover:bg-muted/30" title={tile.label}>
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"><Icon aria-hidden className="h-3.5 w-3.5" />{tile.label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className={cn("text-2xl font-semibold tabular-nums", tile.learning ? "text-muted-foreground" : tile.bad && value > 0 && "text-destructive")}>{tile.learning ? "-" : value.toLocaleString()}</span>
        {tile.history && tile.history.length > 1 ? <Sparkline values={tile.history} label={`${tile.label} over the last 30 days`} width={72} height={24} /> : null}
      </span>
      {tile.learning ? <span className="text-xs text-muted-foreground">{tile.learning}</span> : null}
      {change !== 0 && !tile.learning ? (
        <span className={cn("flex items-center gap-0.5 text-xs", worse ? "text-destructive" : "text-muted-foreground")} aria-label={`${change > 0 ? "Up" : "Down"} ${Math.abs(change)} over 7 days`}>
          {change > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(change)} in 7 days
        </span>
      ) : null}
    </button>
  );
}
