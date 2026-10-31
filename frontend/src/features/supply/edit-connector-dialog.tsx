import { useReducer } from "react";

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
import { Switch } from "@/components/ui/switch";
import type { SupplyConnector } from "@/types/supply";
import { changesFrom, settingsProblem, valuesOf, type EditValues } from "./connector-form-model";
import { updateSupplyConnector } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

function mergeValues(state: EditValues, change: Partial<EditValues>): EditValues {
  return { ...state, ...change };
}

interface EditConnectorDialogProps {
  connector: SupplyConnector | null;
  /** The storefronts the connector's provider offers, when it has any. */
  storefronts?: readonly string[];
  onClose: () => void;
  onSaved: (connector: SupplyConnector) => void;
}

export function EditConnectorDialog({ connector, storefronts = [], onClose, onSaved }: EditConnectorDialogProps) {
  return (
    <Dialog open={connector !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {connector ? <EditForm key={connector.id} connector={connector} storefronts={storefronts} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ connector, storefronts = [], onClose, onSaved }: { connector: SupplyConnector } & Omit<EditConnectorDialogProps, "connector">) {
  const [values, update] = useReducer(mergeValues, connector, valuesOf);
  const { busy, error, run } = useConnectorSubmit();
  const changes = changesFrom(connector, values);
  const problem = settingsProblem(values);
  const unchanged = Object.keys(changes).length === 0;

  const submit = async () => {
    const saved = await run(async () => onSaved(await updateSupplyConnector(connector.id, changes)));
    if (saved) onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !unchanged) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit {connector.display_name}</DialogTitle>
        <DialogDescription>{connector.provider_label}{connector.storefront ? ` · ${connector.storefront}` : ""}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="edit-connector-name">Name</Label>
          <Input id="edit-connector-name" value={values.displayName} onChange={(event) => update({ displayName: event.target.value })} />
        </div>
        {storefronts.length > 0 ? (
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="edit-connector-storefront">Storefront</Label>
            <select
              id="edit-connector-storefront"
              className="h-9 w-full border bg-background px-2 text-sm"
              value={values.storefront}
              onChange={(event) => update({ storefront: event.target.value })}
            >
              {storefronts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">Listings found so far keep their part numbers; prices and stock are read from this store from the next poll.</p>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="edit-connector-currency">Currency</Label>
          <Input id="edit-connector-currency" maxLength={3} value={values.currency} onChange={(event) => update({ currency: event.target.value })} />
        </div>
        {connector.metered ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="edit-connector-budget">Daily call budget</Label>
              <Input id="edit-connector-budget" inputMode="numeric" value={values.budget} onChange={(event) => update({ budget: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-connector-reserve">Held for people and one-off checks (%)</Label>
              <Input id="edit-connector-reserve" inputMode="numeric" value={values.reserve} onChange={(event) => update({ reserve: event.target.value })} />
              <p className="text-xs text-muted-foreground">The part of the day people can always use. First searches and one-off checks take at most half of it. Calls nothing else needs come on top.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-connector-reset">Provider's day begins at</Label>
              <Input id="edit-connector-reset" placeholder="00:00" value={values.resetTime} onChange={(event) => update({ resetTime: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-connector-tz">Time zone</Label>
              <Input id="edit-connector-tz" placeholder="UTC" value={values.resetTz} onChange={(event) => update({ resetTz: event.target.value })} />
            </div>
          </>
        ) : null}
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="edit-connector-retention">Keep raw samples (days)</Label>
          <Input
            id="edit-connector-retention"
            inputMode="numeric"
            placeholder="60"
            value={values.retention}
            onChange={(event) => update({ retention: event.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">Older samples are kept as one row per day.</p>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="edit-connector-keep">Delete all history after (days)</Label>
          <Input
            id="edit-connector-keep"
            inputMode="numeric"
            placeholder="Keep it"
            value={values.keep}
            onChange={(event) => update({ keep: event.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">Set it if the provider&apos;s terms limit how long its data may be stored.</p>
        </div>
        {connector.catalogue_available ? (
          <div className="col-span-2 flex items-center justify-between gap-3">
            <Label htmlFor="edit-connector-catalogue">Read the jlcparts catalogue</Label>
            <Switch
              id="edit-connector-catalogue"
              checked={values.catalogue}
              onCheckedChange={(checked) => update({ catalogue: checked })}
            />
          </div>
        ) : null}
        {connector.limits_storage ? (
          <div className="col-span-2 flex items-center justify-between gap-3">
            <Label htmlFor="edit-connector-keep-unused">Keep prices of parts not in use</Label>
            <Switch
              id="edit-connector-keep-unused"
              checked={values.keepUnused}
              onCheckedChange={(checked) => update({ keepUnused: checked })}
            />
          </div>
        ) : null}
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || unchanged || problem !== null} title={problem ?? undefined}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
