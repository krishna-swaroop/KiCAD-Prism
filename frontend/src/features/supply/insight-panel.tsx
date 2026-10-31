import { Badge } from "@/components/ui/badge";
import type { SupplyInsight } from "@/types/supply";
import { confidenceLabel, insightBasis, insightLines } from "./insight-text";

/** What the stock history says, with the confidence and the readings it rests on. It opens from the info icon beside the stock. */
export function InsightDetails({ insight }: { insight: SupplyInsight }) {
  const lines = insightLines(insight);
  if (lines.length === 0) return null;
  return (
    <div aria-label="Stock trend" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trend</h3>
        <Badge variant="outline">{confidenceLabel(insight)}</Badge>
      </div>
      {lines.map((line) => <p key={line} className="text-sm">{line}</p>)}
      <p className="text-xs text-muted-foreground">
        {insightBasis(insight)} A fall in stock is not always sales: transfers between warehouses and reporting caps look the same.
      </p>
    </div>
  );
}
