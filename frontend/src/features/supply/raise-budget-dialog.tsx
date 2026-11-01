import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSupplyConnector } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

/** One number: a connector's calls a day. Opened over the track dialog, so room is made without leaving it. */
export function RaiseBudgetDialog({ connectorId, name, current, onClose, onSaved }: {
  connectorId: string;
  name: string;
  current: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(current));
  const { busy, error, run } = useConnectorSubmit();
  const budget = Number(value);
  const valid = Number.isInteger(budget) && budget > current && budget <= 1_000_000;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Raise {name}'s Budget</DialogTitle>
          <DialogDescription>Calls a day, now {current.toLocaleString()}.</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div className="space-y-1.5">
          <Label htmlFor="raise-budget">Calls a day</Label>
          <Input id="raise-budget" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !valid} onClick={() => void run(async () => { await updateSupplyConnector(connectorId, { daily_budget: budget }); onSaved(); onClose(); })}>Raise</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
