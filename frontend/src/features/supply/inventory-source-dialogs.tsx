import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InventoryServerCheck, InventorySource } from "@/types/supply";
import { checkInventorySource, createInventorySource, updateInventorySource } from "./inventory-api";
import { useLoaded } from "./use-loaded";

const WHOLE = "whole";

const message = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));

/** Add a source (``source`` null) or change one. A blank token on an existing source keeps the one it has. */
export function InventorySourceDialog({ open, source, onClose, onSaved }: {
  open: boolean;
  source: InventorySource | null;
  onClose: () => void;
  onSaved: (source: InventorySource) => void;
}) {
  const [kind, setKind] = useState<"inventree" | "push">(source?.kind ?? "inventree");
  const pushed = kind === "push";
  const [name, setName] = useState(source?.display_name ?? "");
  const [url, setUrl] = useState(source?.base_url ?? "https://");
  const [token, setToken] = useState("");
  const [hours, setHours] = useState(String(source?.interval_hours ?? 24));
  const [busy, setBusy] = useState(false);
  const interval = Number(hours);
  const valid = name.trim() !== "" && (pushed || (url.trim().startsWith("https://") && Number.isInteger(interval) && interval >= 1 && interval <= 168
    && (source !== null || token.trim() !== "")));

  const save = async () => {
    setBusy(true);
    try {
      const fields = pushed
        ? { display_name: name.trim() }
        : { display_name: name.trim(), base_url: url.trim(), interval_hours: interval, ...(token.trim() ? { token: token.trim() } : {}) };
      const saved = source ? await updateInventorySource(source.id, fields) : await createInventorySource({ kind, ...fields });
      // Closed first: saving a new source opens the next step, which a later close would undo.
      onClose();
      onSaved(saved);
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{source ? `Edit ${source.display_name}` : "Add inventory source"}</DialogTitle>
          <DialogDescription className="sr-only">An InvenTree-compatible server and its API token, or a source that pushes its stock</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {source ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="inventory-kind">Kind</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as "inventree" | "push")}>
                <SelectTrigger id="inventory-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inventree">InvenTree server</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="inventory-name">Name</Label><Input id="inventory-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Stores" /></div>
          {pushed ? null : (
            <>
              <div className="space-y-1.5"><Label htmlFor="inventory-url">Server</Label><Input id="inventory-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://inventory.example.com" /></div>
              <div className="space-y-1.5">
                <Label htmlFor="inventory-token">API token</Label>
                <Input id="inventory-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder={source?.has_token ? "Unchanged" : ""} />
              </div>
              <div className="space-y-1.5"><Label htmlFor="inventory-hours">Read every (hours)</Label><Input id="inventory-hours" type="number" min={1} max={168} value={hours} onChange={(event) => setHours(event.target.value)} /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !valid} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{source ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ask the server for its categories and choose what Prism reads: the whole inventory, or one category. */
export function InventoryCategoryDialog({ source, onClose, onSaved }: {
  source: InventorySource | null;
  onClose: () => void;
  onSaved: (source: InventorySource) => void;
}) {
  const sourceId = source?.id ?? "";
  const fetcher = useCallback((): Promise<InventoryServerCheck> => checkInventorySource(sourceId), [sourceId]);
  const checked = useLoaded(source ? `inventory/sources/${source.id}/check` : null, fetcher, "Could not reach the server");
  const check = checked.data;
  const failed = checked.status === "error" ? checked.error : "";
  const [chosen, setChosen] = useState(source?.category_id !== null && source?.category_id !== undefined ? String(source.category_id) : WHOLE);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!source) return;
    setBusy(true);
    try {
      onSaved(await updateInventorySource(source.id, { category_id: chosen === WHOLE ? null : Number(chosen) }));
      onClose();
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={source !== null} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What to read</DialogTitle>
          <DialogDescription className="sr-only">The whole inventory, or one server category whose parts and stock Prism reads</DialogDescription>
        </DialogHeader>
        {failed ? <p className="text-sm text-destructive">{failed}</p> : null}
        {!check && !failed ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Asking {source?.base_url}</p> : null}
        {check ? (
          <div className="space-y-2">
            <p className="truncate text-xs text-muted-foreground" title={`${check.server} ${check.instance}, API ${check.api_version}`}>
              {[check.server, check.instance, `API ${check.api_version}`].filter(Boolean).join(" · ")}
            </p>
            <Select value={chosen} onValueChange={setChosen}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE}>Whole inventory</SelectItem>
                {check.categories.map((category) => (
                  <SelectItem key={category.pk} value={String(category.pk)}>{category.pathstring || category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !check} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Read</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
