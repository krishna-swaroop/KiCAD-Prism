import type { SupplyPartDetail } from "@/types/supply";
import { AlertPopover } from "./alert-popover";
import { DatasheetLink } from "./datasheet-link";
import { WatchPopover } from "./watch-popover";
import { WorkItemButton } from "./work-item-dialog";

/** The icons at the top of a part: its alert rules (a watched part), how often it is read, and its datasheet. */
export function PartActions({ detail, canEdit, canFollow, onChanged }: { detail: SupplyPartDetail; canEdit: boolean; canFollow: boolean; onChanged: () => Promise<void> }) {
  return (
    <>
      {detail.watch && canEdit ? <AlertPopover partId={detail.part.id} canEdit={canEdit} watch={detail.watch} onChanged={onChanged} /> : null}
      <WatchPopover detail={detail} canEdit={canFollow} onChanged={onChanged} />
      <DatasheetLink partId={detail.part.id} />
      {canEdit ? <WorkItemButton subject={{ kind: "part", id: detail.part.id }} title={detail.part.mpn} /> : null}
    </>
  );
}
