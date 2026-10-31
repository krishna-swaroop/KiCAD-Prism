import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createWorkItem, type WorkItemAction } from "./work-items-api";

export const ACTION_LABEL: Record<WorkItemAction, string> = {
  investigate: "Investigate",
  alternate: "Find an alternate",
  not_for_new_designs: "Not for new designs",
  retire: "Retire",
  replace: "Replace",
  last_time_buy: "Last time buy",
  other: "Other",
};

/** Opens a work item about a component or a part: a title, the action proposed, an owner, a first note and when to look again. */
export function WorkItemButton({ subject, title, action = "investigate", onCreated }: {
  subject: { kind: "component" | "part"; id: string };
  title: string;
  action?: WorkItemAction;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Work item" aria-label="Open a work item">
        <ClipboardList className="h-3.5 w-3.5" />
      </Button>
      {open ? <WorkItemDialog subject={subject} title={title} action={action} onClose={() => setOpen(false)} onCreated={onCreated} /> : null}
    </>
  );
}

function WorkItemDialog({ subject, title: suggested, action: suggestedAction, onClose, onCreated }: {
  subject: { kind: "component" | "part"; id: string };
  title: string;
  action: WorkItemAction;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState(suggested);
  const [action, setAction] = useState<WorkItemAction>(suggestedAction);
  const [owner, setOwner] = useState("");
  const [recheck, setRecheck] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await createWorkItem({ subject_kind: subject.kind, subject_id: subject.id, title, action, owner, note, recheck_on: recheck || null });
      toast.success("Work item opened");
      onCreated?.();
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not open the work item");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Work item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="work-title">Title</Label>
            <Input id="work-title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="work-action">Action</Label>
              <Select value={action} onValueChange={(value) => setAction(value as WorkItemAction)}>
                <SelectTrigger id="work-action"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_LABEL) as WorkItemAction[]).map((key) => <SelectItem key={key} value={key}>{ACTION_LABEL[key]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="work-recheck">Recheck on</Label>
              <Input id="work-recheck" type="date" value={recheck} onChange={(event) => setRecheck(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="work-owner">Owner</Label>
            <Input id="work-owner" type="email" placeholder="name@example.com" value={owner} onChange={(event) => setOwner(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="work-note">Evidence</Label>
            <Textarea id="work-note" rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !title.trim()} onClick={() => void save()}>Open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
