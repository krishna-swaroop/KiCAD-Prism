import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { AssessmentSettings } from "@/types/supply";
import { VendorName } from "./vendor-name";
import { useConnectorList } from "./use-supply-connectors";

/** The distributors in the order a BOM is priced at them first, and whether to price that way at all. */
export function PreferredDistributors({ draft, onChange }: { draft: AssessmentSettings; onChange: (next: AssessmentSettings) => void }) {
  const { data } = useConnectorList();
  const order = draft.distributor_order;
  const connectors = useMemo(() => {
    const kept = order ?? [];
    const usable = (data ?? []).filter((item) => item.enabled && item.metered && !item.assembly_only);
    const rank = (id: string) => (kept.includes(id) ? kept.indexOf(id) : kept.length);
    return [...usable].sort((a, b) => rank(a.id) - rank(b.id) || a.display_name.localeCompare(b.display_name));
  }, [data, order]);
  const move = (id: string, step: -1 | 1) => {
    const ids = connectors.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    onChange({ ...draft, distributor_order: ids });
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Preferred distributors</legend>
      <span className="flex items-center gap-2">
        <Checkbox id="prefer-distributors" checked={draft.prefer_distributors ?? false} onCheckedChange={(on) => onChange({ ...draft, prefer_distributors: on === true })} />
        <Label htmlFor="prefer-distributors" className="font-normal">Use a preferred distributor when it has the stock</Label>
      </span>
      <p className="text-xs text-muted-foreground">
        A part's own choice comes first, then this order. Otherwise the cheapest.
      </p>
      {draft.prefer_distributors ? (
        <ol className="divide-y border" aria-label="Order of preferred distributors">
          {connectors.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2 px-2 py-1 text-sm">
              <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <VendorName provider={item.provider} name={item.display_name} className="flex-1" />
              <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Move ${item.display_name} up`} disabled={index === 0} onClick={() => move(item.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Move ${item.display_name} down`} disabled={index === connectors.length - 1} onClick={() => move(item.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ol>
      ) : null}
    </fieldset>
  );
}
