import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PushTarget, PushToken } from "@/types/supply";
import { getPushToken, issuePushToken, revokePushToken } from "./push-api";
import { formatDateTime } from "./supply-format";
import { useLoaded } from "./use-loaded";

const message = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));

/** The push token of a file-fed connector or a push inventory source: its prefix and last use, a new one (shown once), or none. */
export function PushTokenDialog({ target, id, name, onClose }: {
  target: PushTarget;
  id: string | null;
  name: string;
  onClose: () => void;
}) {
  const loaded = useLoaded<PushToken | null>(
    id ? `push/${target}/${id}` : null, (signal) => getPushToken(target, id ?? "", signal), "Could not load the push token",
    { onError: (caught) => toast.error(caught.message) },
  );
  // undefined while it loads; null when there is none.
  const current = loaded.status === "ready" ? loaded.data : undefined;
  const [issued, setIssued] = useState("");
  const [busy, setBusy] = useState(false);

  const issue = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const made = await issuePushToken(target, id);
      setIssued(made.token);
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await revokePushToken(target, id);
      setIssued("");
      toast.success("Push token revoked");
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued);
      toast.success("Token copied");
    } catch {
      toast.error("Could not copy the token");
    }
  };

  return (
    <Dialog open={id !== null} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Push token for ${name}`}</DialogTitle>
          <DialogDescription className="sr-only">A token that can push to this target and nowhere else</DialogDescription>
        </DialogHeader>
        {current === undefined ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        {current ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Token</dt><dd className="font-mono">{`${current.prefix}…`}</dd>
            <dt className="text-muted-foreground">Created</dt><dd>{`${formatDateTime(current.created_at)} · ${current.created_by}`}</dd>
            <dt className="text-muted-foreground">Last used</dt><dd>{formatDateTime(current.last_used_at) || "-"}</dd>
          </dl>
        ) : null}
        {current === null && !issued ? <p className="text-sm text-muted-foreground">No token</p> : null}
        {issued ? (
          <div className="flex gap-2">
            <Input readOnly value={issued} aria-label="New push token" className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
            <Button variant="outline" size="icon" aria-label="Copy token" onClick={() => void copy()}><Copy className="h-4 w-4" /></Button>
          </div>
        ) : null}
        <DialogFooter>
          {current ? <Button variant="outline" disabled={busy} onClick={() => void revoke()}>Revoke</Button> : null}
          <Button disabled={busy || current === undefined} onClick={() => void issue()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{current ? "Replace token" : "Create token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
