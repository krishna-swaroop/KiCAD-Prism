import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { canEditSupply, canFollowSupply, canReviewSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import { ComponentPartsSection } from "./component-parts-section";
import { ComponentWatch } from "./component-watch";
import { LocalStockSection } from "./local-stock-section";
import { RestrictionNotice } from "./restriction-notice";
import { PartActions } from "./part-actions";
import { PartDetailSections } from "./part-detail-sections";
import { StatusDot } from "./status-dot";
import { STATUS_LABEL } from "./supply-format";
import { followNumber } from "./tracking-api";
import { useSupplyPart, useSupplyPartFor } from "./use-supply-parts";

interface SourcingPanelProps {
  componentId: string;
  manufacturer: string;
  mpn: string;
  user: User | null;
}

/**
 * The Supply tab of a catalog component: its parts (main and alternates), the local stock, then what the distributors hold for its
 * main part. Local stock can match on the SAP code alone; the parts and the distributors need a manufacturer part number.
 */
export default function SourcingPanel({ componentId, manufacturer, mpn, user }: SourcingPanelProps) {
  const hasPart = Boolean(manufacturer.trim() && mpn.trim());
  return (
    <div className="space-y-6">
      <RestrictionNotice componentId={componentId} manufacturer={manufacturer} mpn={mpn} canDecide={canReviewSupply(user?.role)} />
      {hasPart ? <ComponentPartsSection componentId={componentId} canPropose={canEditSupply(user?.role)} canDecide={canReviewSupply(user?.role)} /> : null}
      <LocalStockSection componentId={componentId} />
      {hasPart ? (
        <section className="space-y-2" aria-label="Distributors">
          <h3 className="text-sm font-semibold">Distributors</h3>
          <Lookup componentId={componentId} manufacturer={manufacturer.trim()} mpn={mpn.trim()} user={user} />
        </section>
      ) : (
        <Alert>
          <AlertDescription>This component needs a manufacturer and a manufacturer part number before the distributors can be asked.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Lookup({ componentId, manufacturer, mpn, user }: SourcingPanelProps) {
  const lookup = useSupplyPartFor(manufacturer, mpn);
  if (lookup.status === "loading") return <Skeleton className="h-40 w-full" aria-label="Looking the part up" />;
  if (lookup.status === "error") return <Failure message={lookup.error} onRetry={lookup.retry} />;
  if (lookup.data === null) {
    return <Untracked manufacturer={manufacturer} mpn={mpn} canEdit={canFollowSupply(user?.role)} onTracked={lookup.retry} />;
  }
  return <Tracked key={lookup.data} partId={lookup.data} componentId={componentId} user={user} />;
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex items-center justify-between gap-3">
        {message}
        <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
      </AlertDescription>
    </Alert>
  );
}

function Untracked({ manufacturer, mpn, canEdit, onTracked }: { manufacturer: string; mpn: string; canEdit: boolean; onTracked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const track = async () => {
    setBusy(true);
    setError("");
    try {
      await followNumber({ manufacturer, mpn });
      onTracked();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not watch the part");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border p-4">
      <p className="text-sm font-medium">Prism is not tracking {mpn} yet.</p>
      <p className="text-sm text-muted-foreground">
        Watch it to read its stock, price and lifecycle from the connected distributors and keep the history.
      </p>
      {canEdit ? <Button size="sm" disabled={busy} onClick={() => void track()}>Watch this part</Button> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function Tracked({ partId, componentId, user }: { partId: string; componentId: string; user: User | null }) {
  const part = useSupplyPart(partId);
  if (part.status === "loading") return <Skeleton className="h-40 w-full" aria-label="Loading the part" />;
  if (part.status === "error" || !part.data) return <Failure message={part.error} onRetry={part.retry} />;
  const detail = part.data;
  const canEdit = canEditSupply(user?.role);
  return (
    <div className="space-y-6">
      {/* The component's own watch follows the component (a new part number included), whatever else follows the part today. */}
      <ComponentWatch componentId={componentId} canEdit={canFollowSupply(user?.role)} onChanged={part.refresh} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot status={detail.status} />
          <span className="font-medium">{STATUS_LABEL[detail.status]}</span>
        </div>
        <span className="flex items-center gap-1">
          <PartActions detail={detail} canEdit={canEdit} canFollow={canFollowSupply(user?.role)} onChanged={part.refresh} />
          <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0">
            <Link to={`/?section=supply&supplyView=tracking&part=${encodeURIComponent(partId)}`} aria-label="Open in Supply Tracking" title="Open in Supply Tracking">
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </span>
      </div>
      <PartDetailSections detail={detail} canEdit={canEdit} role={user?.role} onChanged={part.refresh} wide />
    </div>
  );
}
