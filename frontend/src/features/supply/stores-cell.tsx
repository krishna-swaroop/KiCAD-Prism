import type { StoresState } from "@/types/supply";
import { formatDay, formatTime } from "./supply-format";

/** "17:09" today, "28 Oct" before. */
export function shortWhen(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const today = new Date().toDateString() === when.toDateString();
  return today ? formatTime(when) : formatDay(iso);
}

/** The words of a stores state, the same on every screen. */
export function storesText(stores: StoresState | null | undefined): { text: string; tone: "plain" | "muted" | "bad" } {
  if (!stores) return { text: "-", tone: "muted" };
  switch (stores.state) {
    case "stock":
      return { text: stores.available === null ? "Mixed units" : stores.available.toLocaleString(), tone: "plain" };
    case "none":
      return { text: "None", tone: "muted" };
    case "not_connected":
      return { text: "Not connected", tone: "muted" };
    case "down":
      return { text: `Feed down · ${shortWhen(stores.since)}`.replace(/ · $/, ""), tone: "bad" };
  }
}

const TONE = { plain: "tabular-nums", muted: "text-muted-foreground", bad: "text-destructive" } as const;

/** A component's stores, as a cell: a quantity, None, Not connected or Feed down. */
export function StoresCell({ stores, className = "" }: { stores: StoresState | null | undefined; className?: string }) {
  const { text, tone } = storesText(stores);
  return <span className={`${TONE[tone]} ${className}`.trim()}>{text}</span>;
}
