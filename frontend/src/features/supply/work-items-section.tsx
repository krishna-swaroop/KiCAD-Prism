import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleSection } from "./collapsible-section";
import { formatAgo } from "./supply-format";
import { useLoaded } from "./use-loaded";
import { ACTION_LABEL } from "./work-item-dialog";
import { decideWorkItem, listWorkItems, updateWorkItem, workItemHistory, type SupplyWorkItem, type WorkItemList, type WorkItemState } from "./work-items-api";

const LISTS: Array<{ key: WorkItemList; label: string }> = [
  { key: "live", label: "Open" }, { key: "mine", label: "Mine" }, { key: "due", label: "Due" }, { key: "done", label: "Done" }, { key: "rejected", label: "Rejected" },
];
const STATE_LABEL: Record<WorkItemState, string> = { open: "Open", accepted: "Accepted", rejected: "Rejected", done: "Done" };

/** One list of work items; the Review page reads the live one too, to know whether anything waits (one read, shared). */
export function useWorkItems(list: WorkItemList) {
  const fetcher = useCallback((signal: AbortSignal) => listWorkItems(list, signal), [list]);
  return useLoaded<SupplyWorkItem[]>(`work-items/list/${list}`, fetcher, "Could not load the work items");
}

/** Supply > Review: the work items people opened about components and parts, by list. QA accepts or rejects them; the owner,
 * whoever opened one, or QA marks it done. The lists stay reachable when the open one is empty (done and rejected items
 * are reopened from theirs). */
export function WorkItemsSection({ email, canFollow, canDecide }: { email: string; canFollow: boolean; canDecide: boolean }) {
  const [list, setList] = useState<WorkItemList>("live");
  const loaded = useWorkItems(list);
  const [open, setOpen] = useState<SupplyWorkItem | null>(null);
  const items = loaded.data ?? [];
  return (
    <CollapsibleSection id="review-work-items" title="Work items" count={items.length} startOpen>
      <div role="group" aria-label="Work item lists" className="flex flex-wrap gap-1 px-3 py-2">
        {LISTS.map((item) => (
          <Button key={item.key} size="sm" variant={list === item.key ? "secondary" : "ghost"} aria-pressed={list === item.key} onClick={() => setList(item.key)}>
            {item.label}
          </Button>
        ))}
      </div>
      {loaded.status === "error" ? (
        <Alert variant="destructive" className="mx-3 mb-2 w-auto">
          <AlertDescription className="flex items-center justify-between gap-3">
            {loaded.error}
            <Button size="sm" variant="outline" onClick={loaded.retry}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(item)}>
              <p className="truncate font-medium hover:underline">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[item.subject_name, ACTION_LABEL[item.action], item.owner, item.recheck_on ? `Recheck ${item.recheck_on}` : "", item.projects.map((project) => project.name).join(", ")].filter(Boolean).join(" · ")}
              </p>
            </button>
            <Badge variant={item.state === "rejected" ? "destructive" : item.state === "accepted" ? "default" : "secondary"}>{STATE_LABEL[item.state]}</Badge>
            <Decide item={item} email={email} canFollow={canFollow} canDecide={canDecide} onChanged={() => void loaded.refresh()} />
          </li>
        ))}
      </ul>
      {open ? <WorkItemSheet item={open} email={email} canFollow={canFollow} canDecide={canDecide} onClose={() => setOpen(null)} onChanged={() => void loaded.refresh()} /> : null}
    </CollapsibleSection>
  );
}

function mayEdit(item: SupplyWorkItem, email: string, canDecide: boolean): boolean {
  return canDecide || email === item.owner || email === item.created_by;
}

function Decide({ item, email, canFollow, canDecide, onChanged }: { item: SupplyWorkItem; email: string; canFollow: boolean; canDecide: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const move = async (state: WorkItemState) => {
    setBusy(true);
    try {
      await decideWorkItem(item.id, state);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not change the work item");
    } finally {
      setBusy(false);
    }
  };
  const live = item.state === "open" || item.state === "accepted";
  return (
    <span className="flex shrink-0 gap-1">
      {canDecide && item.state === "open" ? <Button size="sm" disabled={busy} onClick={() => void move("accepted")}>Accept</Button> : null}
      {canDecide && item.state === "open" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void move("rejected")}>Reject</Button> : null}
      {canFollow && live && mayEdit(item, email, canDecide) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void move("done")}>Done</Button> : null}
      {canDecide && !live ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void move("open")}>Reopen</Button> : null}
    </span>
  );
}

/** One item in full: its evidence with who added what, the projects it touches, its history, and a note to add. */
function WorkItemSheet({ item, email, canFollow, canDecide, onClose, onChanged }: {
  item: SupplyWorkItem; email: string; canFollow: boolean; canDecide: boolean; onClose: () => void; onChanged: () => void;
}) {
  const fetcher = useCallback((signal: AbortSignal) => workItemHistory(item.id, signal), [item.id]);
  const history = useLoaded(`work-items/${item.id}/history/${item.updated_at}`, fetcher, "Could not load the history");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState(item.evidence);
  const add = async () => {
    try {
      const changed = await updateWorkItem(item.id, { note });
      setEvidence(changed.evidence);
      setNote("");
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the note");
    }
  };
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{item.title}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          {[item.subject_name, ACTION_LABEL[item.action], STATE_LABEL[item.state], item.owner, item.recheck_on ? `Recheck ${item.recheck_on}` : ""].filter(Boolean).join(" · ")}
        </p>
        {item.projects.length > 0 ? <p className="text-sm">{item.projects.map((project) => project.name).join(", ")}</p> : null}
        <ul aria-label="Evidence" className="space-y-1.5 text-sm">
          {evidence.map((entry) => (
            <li key={`${entry.at}:${entry.by}`}><span className="whitespace-pre-wrap">{entry.text}</span> <span className="text-xs text-muted-foreground">{entry.by}, {formatAgo(entry.at)}</span></li>
          ))}
        </ul>
        {canFollow && mayEdit(item, email, canDecide) ? (
          <div className="flex items-end gap-2">
            <Textarea aria-label="Note" rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
            <Button size="sm" disabled={!note.trim()} onClick={() => void add()}>Add</Button>
          </div>
        ) : null}
        <ul aria-label="History" className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
          {(history.data ?? []).map((entry) => <li key={`${entry.at}:${entry.action}`}>{entry.action} · {entry.actor} · {formatAgo(entry.at)}</li>)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
