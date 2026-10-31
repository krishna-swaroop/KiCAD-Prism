import { useEffect } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { canEditSupply, canFollowSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { SupplyPartDetail } from "@/types/supply";
import { PartDetailSections } from "./part-detail-sections";
import { StatusDot } from "./status-dot";
import { PartActions } from "./part-actions";
import { LibraryComponentLink } from "./library-component-link";
import { LIFECYCLE_BADGE } from "./lifecycle-tone";
import { JlcIcon } from "./supply-icons";
import { LIFECYCLE_LABEL } from "./supply-format";
import { TradeTag } from "./trade-tag";
import { UsedInLinks } from "./used-in-links";
import { useSupplyPart } from "./use-supply-parts";

interface PartSheetProps {
  partId: string | null;
  user: User | null;
  onClose: () => void;
  /** Called after a watch changes, so the list behind the sheet can reload. */
  onWatchChanged: () => void;
}

/** One part: its stock and history, its watch, and every listing behind the numbers. */
export function PartSheet({ partId, user, onClose, onWatchChanged }: PartSheetProps) {
  // One Escape closes the sheet even while a hover popover is open (a popover would otherwise take the first one). A dialog opened
  // from the sheet, such as a waiver, takes its own Escape and leaves the sheet.
  useEffect(() => {
    if (partId === null) return undefined;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"]:not([data-part-sheet]):not([data-slot="popover-content"])')) return;
      onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [partId, onClose]);
  return (
    <Sheet open={partId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" data-part-sheet className="w-full themed-scrollbar overflow-y-auto sm:max-w-[43rem]">
        {partId ? <PartBody key={partId} partId={partId} user={user} onWatchChanged={onWatchChanged} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PartBody({ partId, user, onWatchChanged }: { partId: string; user: User | null; onWatchChanged: () => void }) {
  const { status, data, error, retry, refresh } = useSupplyPart(partId);
  const changed = async () => {
    await refresh();
    onWatchChanged();
  };

  if (status === "loading") {
    return (
      <>
        <SheetHeader><SheetTitle>Loading part</SheetTitle><SheetDescription>One moment.</SheetDescription></SheetHeader>
        <Skeleton className="mt-4 h-40 w-full" aria-label="Loading the part" />
      </>
    );
  }
  if (status === "error" || !data) {
    return (
      <>
        <SheetHeader><SheetTitle>Part</SheetTitle><SheetDescription>It could not be loaded.</SheetDescription></SheetHeader>
        <Alert variant="destructive" className="mt-4">
          <AlertDescription className="flex items-center justify-between gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }
  return <PartDetail detail={data} canEdit={canEditSupply(user?.role)} role={user?.role} onChanged={changed} />;
}

function PartDetail({ detail, canEdit, role, onChanged }: { detail: SupplyPartDetail; canEdit: boolean; role: User["role"] | undefined; onChanged: () => Promise<void> }) {
  return (
    <div className="space-y-6">
      <SheetHeader>
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0 space-y-1">
            <SheetTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex items-center gap-2"><StatusDot status={detail.status} />{detail.part.mpn}</span>
              <span className="text-sm font-normal text-muted-foreground">{detail.part.manufacturer}</span>
              <Badge variant={LIFECYCLE_BADGE[detail.lifecycle]}>{LIFECYCLE_LABEL[detail.lifecycle]}</Badge>
              <TradeTag show="tag" partId={detail.part.id} trade={detail.trade} canEdit={canEdit} onChanged={onChanged} />
              <JlcIcon jlc={detail.jlc} />
            </SheetTitle>
            <UsedInLinks uses={detail.used_in} />
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <PartActions detail={detail} canEdit={canEdit} canFollow={canFollowSupply(role)} onChanged={onChanged} />
            <LibraryComponentLink partId={detail.part.id} />
          </span>
        </div>
        <SheetDescription className="sr-only">{detail.part.manufacturer} {detail.part.mpn}</SheetDescription>
      </SheetHeader>

      <PartDetailSections detail={detail} canEdit={canEdit} role={role} onChanged={onChanged} />
    </div>
  );
}
