import { useCallback, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComponentPart } from "@/types/supply";
import { decideAlternate, getComponentParts, proposeAlternate, removeAlternate } from "./component-supply-api";
import { invalidateSupply, useLoaded } from "./use-loaded";

const APPROVAL: Record<ComponentPart["approval"], { label: string; tone: "default" | "secondary" | "outline" | "destructive" }> = {
  approved: { label: "Approved", tone: "default" },
  pending: { label: "Waiting for QA", tone: "outline" },
  rejected: { label: "Rejected", tone: "destructive" },
};

const message = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

/** A component's main part and its alternates. Designers propose an alternate; QA approves, rejects or removes it. Only approved
 * alternates count toward stock and price. */
export function ComponentPartsSection({ componentId, canPropose, canDecide }: { componentId: string; canPropose: boolean; canDecide: boolean }) {
  const fetcher = useCallback(async (signal: AbortSignal) => (await getComponentParts(componentId, signal)).parts, [componentId]);
  const loaded = useLoaded<ComponentPart[]>(`components/${componentId}/parts`, fetcher, "Could not load the component's parts");
  const parts = loaded.data;
  const mainPartId = parts?.find((part) => part.role === "main")?.part_id ?? "";
  const failed = loaded.status === "error" ? loaded.error : "";
  const [busy, setBusy] = useState(false);
  const [maker, setMaker] = useState("");
  const [mpn, setMpn] = useState("");

  const act = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await run();
      await invalidateSupply(`components/${componentId}`, "catalog");
      toast.success(done);
      return true;
    } catch (caught) {
      toast.error(message(caught, "Could not save"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const propose = async () => {
    if (await act(() => proposeAlternate(componentId, maker.trim(), mpn.trim()), `Proposed ${mpn.trim()}`)) {
      setMaker("");
      setMpn("");
    }
  };

  return (
    <section className="space-y-2" aria-label="Parts">
      <h3 className="text-sm font-semibold">Parts</h3>
      {failed ? <p className="text-sm text-destructive">{failed}</p> : null}
      {!parts && !failed ? <Skeleton className="h-16 w-full" aria-label="Loading the parts" /> : null}
      {parts ? (
        <ul className="divide-y border">
          {parts.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No manufacturer part</li> : null}
          {parts.map((part) => (
            <li key={part.part_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{part.mpn}</p>
                <p className="truncate text-xs text-muted-foreground">{part.manufacturer}</p>
              </div>
              {part.role === "main" ? <Badge variant="secondary">Main</Badge> : (
                <Badge variant={APPROVAL[part.approval].tone} title={part.decided_by ? `${APPROVAL[part.approval].label} by ${part.decided_by}` : `Proposed by ${part.created_by}`}>
                  {APPROVAL[part.approval].label}
                </Badge>
              )}
              {part.role === "alternate" && canDecide ? (
                <span className="flex shrink-0 gap-1">
                  {part.approval !== "approved" ? (
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={`Approve ${part.mpn}`} title="Approve"
                      onClick={() => void act(() => decideAlternate(componentId, part.part_id, true, mainPartId), `Approved ${part.mpn}`)}><Check className="h-4 w-4" /></Button>
                  ) : null}
                  {part.approval !== "rejected" ? (
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={`Reject ${part.mpn}`} title="Reject"
                      onClick={() => void act(() => decideAlternate(componentId, part.part_id, false, mainPartId), `Rejected ${part.mpn}`)}><X className="h-4 w-4" /></Button>
                  ) : null}
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={`Remove ${part.mpn}`} title="Remove"
                    onClick={() => void act(() => removeAlternate(componentId, part.part_id), `Removed ${part.mpn}`)}><Trash2 className="h-4 w-4" /></Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canPropose ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void propose(); }}>
          <Input className="h-8 w-44" value={maker} onChange={(event) => setMaker(event.target.value)} placeholder="Manufacturer" aria-label="Alternate manufacturer" />
          <Input className="h-8 w-56" value={mpn} onChange={(event) => setMpn(event.target.value)} placeholder="Part number" aria-label="Alternate part number" />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !mpn.trim()}><Plus className="h-4 w-4" />Propose alternate</Button>
        </form>
      ) : null}
    </section>
  );
}
