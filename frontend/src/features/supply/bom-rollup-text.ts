import type { SupplyBomRollup } from "@/types/supply";
import type { BomLineDetail } from "./bom-supply";
import { formatPrice } from "./supply-format";

export type RollupKind = "build" | "cost" | "risk" | "health" | "short" | "untracked";

export interface RollupSentence {
  kind: RollupKind;
  /** What the chip shows; the sentence is its tooltip and accessible text. */
  short: string;
  text: string;
  tone: "plain" | "warn" | "bad";
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** " (from 80.00 USD and 30.00 EUR)": what a converted total was made of. */
function originals(rollup: SupplyBomRollup): string {
  const parts = Object.entries(rollup.original_costs ?? {}).map(([code, amount]) => `${amount} ${code}`);
  return parts.length > 1 ? ` (from ${parts.join(" and ")})` : "";
}

/** What the rollup of a lookup says about a build, as short sentences. */
export function rollupSentences(rollup: SupplyBomRollup, build: number, lines: readonly BomLineDetail[]): RollupSentence[] {
  const sentences: RollupSentence[] = [];

  if (rollup.can_build === null) {
    sentences.push({ kind: "build", short: "?", text: rollup.tracked > 0 ? "No stock data yet" : "No parts tracked yet", tone: "warn" });
  } else if (rollup.can_build >= build) {
    sentences.push({ kind: "build", short: build.toLocaleString(), text: `Stock covers ${plural(build, "board", "boards")}`, tone: "plain" });
  } else {
    const limiting = lines.find((line) => line.key === rollup.limited_by)?.mpn;
    sentences.push({
      kind: "build",
      short: `${rollup.can_build.toLocaleString()} of ${build.toLocaleString()}`,
      text: `Can build ${rollup.can_build.toLocaleString()} of ${build.toLocaleString()}${limiting ? `, limited by ${limiting}` : ""}`,
      tone: "bad",
    });
  }

  if (rollup.cost_build !== null && rollup.currency) {
    const each = rollup.cost_per_board ? ` (${formatPrice(rollup.cost_per_board, rollup.currency)} a board in use)` : "";
    // A cost that leaves lines out is not the cost of the BOM, so it says how much it covers.
    const covers = rollup.lines_priced < rollup.lines ? `, covers ${rollup.lines_priced.toLocaleString()} of ${plural(rollup.lines, "line", "lines")}` : "";
    sentences.push({
      kind: "cost",
      short: `${formatPrice(rollup.cost_build, rollup.currency)}${rollup.lines_priced < rollup.lines ? "+" : ""}`,
      text: `${formatPrice(rollup.cost_build, rollup.currency)} to buy for ${plural(build, "board", "boards")}${each}${covers}${rollup.converted && rollup.rates_day ? `, converted at the rates of ${rollup.rates_day}${originals(rollup)}` : ""}, list prices without VAT or shipping`,
      tone: rollup.lines_priced < rollup.lines ? "warn" : "plain",
    });
  } else if (rollup.priced > 0) {
    sentences.push({ kind: "cost", short: "?", text: "Prices are in more than one currency and the exchange rates are missing, so no total", tone: "warn" });
  }

  if (rollup.at_risk > 0) sentences.push({ kind: "risk", short: rollup.at_risk.toLocaleString(), text: `${rollup.at_risk.toLocaleString()} at risk`, tone: "bad" });
  if (rollup.health !== null) {
    const tone = rollup.health_status === "ok" ? "plain" : rollup.health_status === "warning" ? "warn" : "bad";
    sentences.push({ kind: "health", short: rollup.health.toFixed(1), text: `Health ${rollup.health.toFixed(1)} of 10`, tone });
  }
  if (rollup.short > 0) sentences.push({ kind: "short", short: rollup.short.toLocaleString(), text: `${rollup.short.toLocaleString()} short for this build`, tone: "bad" });
  if (rollup.not_tracked > 0) sentences.push({ kind: "untracked", short: rollup.not_tracked.toLocaleString(), text: `${rollup.not_tracked.toLocaleString()} not tracked`, tone: "warn" });
  return sentences;
}
