import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyConnector } from "@/types/supply";
import { pauseSupplyConnector } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

interface PauseConnectorDialogProps {
  connector: SupplyConnector | null;
  onClose: () => void;
  onPaused: (connector: SupplyConnector) => void;
}

export function PauseConnectorDialog({ connector, onClose, onPaused }: PauseConnectorDialogProps) {
  return (
    <Dialog open={connector !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {connector ? <PauseForm key={connector.id} connector={connector} onClose={onClose} onPaused={onPaused} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PauseForm({ connector, onClose, onPaused }: { connector: SupplyConnector } & Omit<PauseConnectorDialogProps, "connector">) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useConnectorSubmit();
  const trimmed = reason.trim();

  const submit = async () => {
    const paused = await run(async () => onPaused(await pauseSupplyConnector(connector.id, trimmed)));
    if (paused) onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Pause {connector.display_name}</DialogTitle>
        <DialogDescription>Polling and lookups stop until it is resumed. Stored data stays.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="pause-reason">Reason</Label>
        <Input
          id="pause-reason"
          maxLength={200}
          placeholder="Over budget, key rotation, provider outage"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !trimmed}>{busy ? "Pausing…" : "Pause"}</Button>
      </DialogFooter>
    </form>
  );
}
