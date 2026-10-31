import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CrossReference } from "@/types/supply";
import { followNumber } from "./tracking-api";
import { formatStock } from "./supply-format";

type Suggestion = NonNullable<CrossReference["suggestions"]>[number];

/** What a distributor said about the match, in its words: the package, or how close DigiKey calls it. */
function words(item: Suggestion): string {
  return [...item.notes, item.asked ? "asked at DigiKey" : ""].filter(Boolean).join(", ");
}

function SuggestionRow({ item, canEdit, onTracked }: { item: Suggestion; canEdit: boolean; onTracked: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      onTracked();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not do that");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-2">
      <span className="min-w-0">
        <span className="font-medium">{item.mpn || item.sku}</span>{item.manufacturer ? `, ${item.manufacturer}` : ""}
        <span className="block text-xs text-muted-foreground">
          {item.sources.map((source) => source.name).join(", ")}{words(item) ? `: ${words(item)}` : ""}
          {item.part_id ? ` · ${item.stock === null ? "not read yet" : `${formatStock(item.stock)} in stock`}${item.tracked ? ", tracked" : ""}` : ""}
          {!item.mpn ? " · a distributor number, not a part number" : ""}
        </span>
      </span>
      {canEdit && item.mpn ? (
        <span className="flex gap-2">
          {!item.tracked ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(() => followNumber({ manufacturer: item.manufacturer, mpn: item.mpn }), `${item.mpn} is tracked.`)}>Track</Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

/** Parts distributors suggest in place of this one, before Prism's own graded candidates. Prism has not compared them with the part. */
export function SuggestionsList({ suggestions, canEdit, onTracked }: { suggestions: NonNullable<CrossReference["suggestions"]>; canEdit: boolean; onTracked: () => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">Suggested by distributors</p>
      <ul className="divide-y border text-sm">
        {suggestions.map((item) => <SuggestionRow key={`${item.mpn}|${item.sku}`} item={item} canEdit={canEdit} onTracked={onTracked} />)}
      </ul>
      <p className="text-xs text-muted-foreground">Distributors suggest these. Prism has not compared them with the part: check the function, footprint and pins first.</p>
    </div>
  );
}
