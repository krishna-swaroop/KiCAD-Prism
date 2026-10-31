import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyPartDetail } from "@/types/supply";
import { clearTradeMark, setTradeMark } from "./supply-api";

type Trade = NonNullable<SupplyPartDetail["trade"]>;

function text(trade: Trade): string {
  if (trade.control === "controlled") return `Export controlled ${trade.eccn.join(", ")}`.trim();
  if (trade.control === "disputed") return "ECCN disputed";
  return "";
}

function MarkDialog({ partId, trade, onClose, onChanged }: { partId: string; trade: Trade; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [control, setControl] = useState<"controlled" | "none">(trade.control === "controlled" ? "controlled" : "none");
  const [eccn, setEccn] = useState(trade.control === "controlled" ? (trade.eccn[0] ?? "") : "");
  const [error, setError] = useState("");
  const save = () => {
    setTradeMark(partId, control, eccn).then(() => onChanged()).then(onClose).catch((caught: Error) => setError(caught.message));
  };
  const clear = () => {
    clearTradeMark(partId).then(() => onChanged()).then(onClose).catch((caught: Error) => setError(caught.message));
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Control</DialogTitle>
          <DialogDescription>
            Distributors say {trade.stated_eccn.length ? trade.stated_eccn.join(", ") : "nothing"}. What you set here wins over them.
          </DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div role="radiogroup" aria-label="Export control" className="grid grid-cols-2 gap-2">
          {([["controlled", "Export controlled"], ["none", "Not controlled"]] as const).map(([value, label]) => (
            <button
              key={value} type="button" role="radio" aria-checked={control === value} onClick={() => setControl(value)}
              className={`border px-3 py-2 text-left text-sm font-medium ${control === value ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {control === "controlled" ? (
          <div className="space-y-1">
            <Label htmlFor="trade-eccn" className="text-xs">Class (ECCN)</Label>
            <Input id="trade-eccn" value={eccn} placeholder="3A991" onChange={(event) => setEccn(event.target.value)} />
          </div>
        ) : null}
        <DialogFooter>
          {trade.mark ? <Button variant="outline" onClick={clear}>Use what distributors say</Button> : null}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Export controlled 3A991" beside the lifecycle, "ECCN disputed" when distributors differ, nothing for EAR99 or no class. A person can set it. */
export function TradeTag({ partId, trade, canEdit, onChanged, show = "both" }: {
  partId: string;
  trade: SupplyPartDetail["trade"];
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
  /** The tag, the button that sets it, or both. The sheet shows the tag high up and the button with the compliance. */
  show?: "both" | "tag" | "button";
}) {
  const [open, setOpen] = useState(false);
  if (!trade) return null;
  const words = show === "button" ? "" : text(trade);
  const button = canEdit && show !== "tag";
  if (!words && !button) return null;
  return (
    <>
      {words ? (
        <Badge variant={trade.control === "controlled" ? "warning" : "info"} title={trade.mark ? `Set by ${trade.mark.set_by}` : trade.control === "disputed" ? `Distributors give different export control classes${trade.eccn.length > 0 ? ` (${trade.eccn.join(", ")})` : ""}. Set the right one with the export control button.` : "What distributors state"}>
          {words}{trade.mark ? " (set by a person)" : ""}
        </Badge>
      ) : null}
      {button ? (
        <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Set export control" title="Set export control" onClick={() => setOpen(true)}>
          <ShieldCheck className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {open ? <MarkDialog partId={partId} trade={trade} onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
    </>
  );
}
