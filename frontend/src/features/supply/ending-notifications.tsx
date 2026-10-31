import { useState } from "react";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canEditSupply, canReviewSupply } from "@/lib/roles";
import type { UserRole } from "@/types/auth";
import type { EndingPart } from "@/types/supply";
import { dismissEnding, getEndingParts, retireComponent, setRestriction } from "./ending-api";
import { StatusDot } from "./status-dot";
import { formatStock } from "./supply-format";
import { WorkItemButton } from "./work-item-dialog";
import { useLoaded } from "./use-loaded";

type Decision = "mark" | "retire";

function DecisionDialog({ item, decision, onClose, onDone }: { item: EndingPart; decision: Decision; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(() => item.reasons.map((found) => found.text).join(". "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retiring = decision === "retire";
  const save = () => {
    setBusy(true);
    const work = retiring ? retireComponent(item.component.id, reason) : setRestriction(item.component.id, "not_for_new_designs", reason);
    work
      .then(() => { toast.success(retiring ? `${item.component.name} is retired.` : `${item.component.name} is marked not for new designs.`); onDone(); onClose(); })
      .catch((caught: Error) => { setError(caught.message); setBusy(false); });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{retiring ? "Retire" : "Not for new designs"}: {item.component.name}</DialogTitle>
          <DialogDescription>
            {retiring
              ? "The component is archived and leaves the KiCad library. Symbols already placed stop resolving."
              : "The component stays released and keeps resolving where it is placed. It is marked in the catalog so nobody picks it for a new design."}
          </DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {item.projects.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{retiring ? "Tracked projects that use it" : "Used by"}</p>
            <ul className="list-disc pl-5 text-muted-foreground">{item.projects.map((project) => <li key={project.project_id}>{project.name}, {project.quantity.toLocaleString()} per board</li>)}</ul>
          </div>
        ) : <p className="text-sm text-muted-foreground">No tracked project uses it.</p>}
        <div className="space-y-1">
          <Label htmlFor="ending-reason" className="text-xs">Reason</Label>
          <Textarea id="ending-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={retiring ? "destructive" : "default"} disabled={busy} onClick={save}>{retiring ? "Retire" : "Mark"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ item, canDecide, canPropose, onOpen, onChanged }: {
  item: EndingPart; canDecide: boolean; canPropose: boolean; onOpen: () => void; onChanged: () => void;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const dismiss = () => {
    setBusy(true);
    dismissEnding(item.component.id, item.reasons.map((reason) => reason.kind))
      .then((made) => {
        const name = item.component.name || item.component.mpn;
        toast.success(made.state === "approved" ? `${name} dismissed until its part gains a new reason.` : `${name} waits for QA to dismiss it.`);
        onChanged();
      })
      .catch((caught: Error) => { toast.error(caught.message); setBusy(false); });
  };
  const used = item.projects.length === 0 ? "No tracked project" : item.projects.slice(0, 2).map((project) => project.name).join(", ") + (item.projects.length > 2 ? ` +${item.projects.length - 2}` : "");
  const lastBuy = item.last_buy.length > 0 ? `Last buy ${item.last_buy.map((date) => date.value).join(", ")}` : "";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <button type="button" className="max-w-full truncate text-left font-medium hover:underline" onClick={onOpen} title={`${item.component.mpn}, ${item.component.manufacturer}`}>
          {item.component.name || item.component.mpn}
        </button>
        <p className="truncate text-xs text-muted-foreground" title={item.reasons.map((reason) => `${reason.text} (${reason.source})`).join("; ")}>
          {[
            item.role === "alternate" ? "Alternate" : "",
            item.healthy ? `${item.healthy} healthy ${item.healthy === 1 ? "part" : "parts"}` : "",
            item.reasons.map((reason) => reason.text).join(" · "), lastBuy, used,
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums" title="Distributor stock">
        <StatusDot status={item.status} />{item.stock === null ? "not read" : formatStock(item.stock)}
      </span>
      {canDecide ? (
        <span className="inline-flex shrink-0 gap-1">
          <Button size="sm" variant="outline" onClick={() => setDecision("mark")}>Not for new designs</Button>
          {item.healthy ? null : <Button size="sm" variant="outline" onClick={() => setDecision("retire")}>Retire</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>Dismiss</Button>
          <WorkItemButton subject={{ kind: "component", id: item.component.id }} title={`${item.component.name || item.component.mpn}: ending`} action="alternate" />
        </span>
      ) : canPropose ? (
        <Button size="sm" variant="ghost" className="shrink-0" disabled={busy || item.dismissal_waiting === true} onClick={dismiss}>
          {item.dismissal_waiting ? "Asked QA" : "Ask QA to dismiss"}
        </Button>
      ) : null}
      {decision ? <DecisionDialog item={item} decision={decision} onClose={() => setDecision(null)} onDone={onChanged} /> : null}
    </li>
  );
}

/**
 * The Dashboard's notifications about library components whose part is ending: why, the last buy date, stock and where it is used,
 * with the decision inline. Supply proposes; QA and administrators decide (not for new designs, retire, or dismiss until a new
 * reason). Only components nobody has decided about are listed; nothing shows when there are none.
 */
export function EndingNotifications({ role, onOpenComponent }: { role: UserRole | null | undefined; onOpenComponent: (componentId: string) => void }) {
  const loaded = useLoaded("ending/parts", getEndingParts, "Could not load the ending parts");
  const canDecide = canReviewSupply(role);
  const canPropose = canEditSupply(role);
  if (loaded.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-3">{loaded.error}<Button size="sm" variant="outline" onClick={loaded.retry}>Retry</Button></AlertDescription>
      </Alert>
    );
  }
  const items = (loaded.data?.items ?? []).filter((item) => item.restriction === null && !item.dismissed);
  if (items.length === 0) return null;
  return (
    <details id="dashboard-ending" className="border border-warning/40" aria-label="Ending parts">
      <summary className="flex cursor-pointer items-center gap-2 bg-warning/10 px-3 py-2 text-sm font-semibold">
        <Hourglass className="h-4 w-4 text-warning" aria-hidden />
        {items.length === 1 ? "1 library component's part is ending" : `${items.length} library components' parts are ending`}
      </summary>
      <ul className="divide-y">
        {items.map((item) => <Row key={item.component.id} item={item} canDecide={canDecide} canPropose={canPropose} onOpen={() => onOpenComponent(item.component.id)} onChanged={() => void loaded.refresh()} />)}
      </ul>
      {loaded.data && loaded.data.more > 0 ? <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">{loaded.data.more} more ending parts are not listed.</p> : null}
    </details>
  );
}
