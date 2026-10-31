import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SupplyWatchSummary } from "@/types/supply";
import { AlertRulesSection } from "./alert-rules-section";

/** A bell beside the title: which alerts this part raises, how big a price rise matters, and a target price. Only for a watched part. */
export function AlertPopover({ partId, canEdit, watch, onChanged }: {
  partId: string; canEdit: boolean; watch?: SupplyWatchSummary | null; onChanged?: () => Promise<void>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Alert rules for this part" title="Alert rules for this part">
          <Bell className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[28rem] w-[min(26rem,90vw)] gap-3 themed-scrollbar overflow-y-auto p-3">
        <AlertRulesSection partId={partId} canEdit={canEdit} watch={watch} onChanged={onChanged} />
      </PopoverContent>
    </Popover>
  );
}
