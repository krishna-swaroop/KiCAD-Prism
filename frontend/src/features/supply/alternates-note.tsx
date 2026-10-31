import type { SupplyBomAlternate } from "@/types/supply";
import { formatStock } from "./supply-format";

function stockText(stock: number | null): string {
  return stock === null ? "not read" : `${formatStock(stock)} in stock`;
}

/** "+2 alt" beside a line whose component has approved alternates; the title names each with its stock. */
export function AlternatesNote({ alternates, statusFrom }: { alternates: SupplyBomAlternate[] | undefined; statusFrom?: string | null }) {
  if (!alternates?.length) return null;
  const from = alternates.find((alternate) => alternate.part_id === statusFrom);
  const title = [
    ...alternates.map((alternate) => `${alternate.mpn} (${alternate.manufacturer}): ${stockText(alternate.stock)}`),
    ...(from ? [`Status from ${from.mpn}`] : []),
  ].join("\n");
  return <span className="ml-1.5 text-xs text-muted-foreground" title={title}>+{alternates.length} alt</span>;
}
