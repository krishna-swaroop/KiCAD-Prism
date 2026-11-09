import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PartsFilter } from "@/types/supply";
import { ANY, FILTER_LABEL, filterLabel, LIFECYCLE_FILTERS } from "./parts-filters";

const isLifecycle = (only: PartsFilter) => LIFECYCLE_FILTERS.some((item) => item === only);

/** Narrows a parts list to one lifecycle. */
export function LifecycleSelect({ only, onChange }: { only: PartsFilter; onChange: (only: PartsFilter) => void }) {
  return (
    <Select value={isLifecycle(only) ? only : ANY} onValueChange={(next) => onChange(next === ANY ? "" : (next as PartsFilter))}>
      <SelectTrigger size="sm" className="w-36" aria-label="Lifecycle">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any lifecycle</SelectItem>
        <SelectItem value="lifecycle">Ending (not active)</SelectItem>
        {LIFECYCLE_FILTERS.flatMap((item) => (item === "lifecycle" ? [] : [<SelectItem key={item} value={item}>{FILTER_LABEL[item]}</SelectItem>]))}
      </SelectContent>
    </Select>
  );
}

/** The group a link from elsewhere narrowed the list to, with a way to let it go. Lifecycles show in their menu instead. */
export function ActiveFilterChip({ only, onClear }: { only: PartsFilter; onClear: () => void }) {
  if (!only || isLifecycle(only)) return null;
  return (
    <Button size="sm" variant="secondary" onClick={onClear} aria-label={`Showing only ${filterLabel(only)}. Show all`}>
      {filterLabel(only)}<X className="h-3.5 w-3.5" />
    </Button>
  );
}
