import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addRohsExemption, removeRohsExemption } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

/** The RoHS exemptions a part relies on, as the manufacturer's declaration numbers them. They go into the draft declaration. */
export function RohsExemptions({
  partId, items, canEdit, onChanged,
}: {
  partId: string;
  items: Array<{ code: string; note: string; declared_by: string }>;
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useConnectorSubmit();
  if (!canEdit && items.length === 0) return null;
  return (
    <div className="space-y-1" aria-label="RoHS exemptions">
      <p className="text-xs text-muted-foreground">RoHS exemptions the part relies on</p>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-sm">
          {items.map((item) => (
            <li key={item.code} className="flex items-center gap-1">
              <Badge variant="outline" title={item.note || undefined}>{item.code}{item.note ? `, ${item.note}` : ""}</Badge>
              {canEdit ? (
                <Button size="icon-xs" variant="ghost" aria-label={`Remove exemption ${item.code}`} disabled={busy}
                  onClick={() => void run(async () => { await removeRohsExemption(partId, item.code); await onChanged(); })}>
                  <X className="h-3 w-3" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => { await addRohsExemption(partId, code.trim(), note.trim()); setCode(""); setNote(""); await onChanged(); });
        }}>
          <div className="space-y-1">
            <Label htmlFor="exemption-code" className="text-xs">Exemption</Label>
            <Input id="exemption-code" className="h-8 w-24" placeholder="7(a)" value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exemption-note" className="text-xs">Note</Label>
            <Input id="exemption-note" className="h-8 w-56" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={busy || code.trim() === ""}>Name it</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
