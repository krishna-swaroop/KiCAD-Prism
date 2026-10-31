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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SupplyConnector, SupplyProvider } from "@/types/supply";
import { createProblem, initialState, reducer } from "./connector-form-model";
import { CredentialInputs } from "./credential-inputs";
import { createSupplyConnector } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

interface CreateConnectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: SupplyProvider[];
  onCreated: (connector: SupplyConnector) => void;
}

export function CreateConnectorDialog({ open, onOpenChange, providers, onCreated }: CreateConnectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <CreateForm providers={providers} onClose={() => onOpenChange(false)} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  providers,
  onClose,
  onCreated,
}: {
  providers: SupplyProvider[];
  onClose: () => void;
  onCreated: (connector: SupplyConnector) => void;
}) {
  const [form, dispatch] = useReducer(reducer, providers[0], initialState);
  const { busy, error, run } = useConnectorSubmit();
  const provider = providers.find((item) => item.key === form.provider);
  const problem = createProblem(form, provider);

  const submit = async () => {
    const created = await run(async () => {
      const connector = await createSupplyConnector({
        provider: form.provider,
        storefront: form.storefront,
        display_name: form.displayName.trim(),
        currency: form.currency.trim().toUpperCase(),
        credentials: form.credentials,
        daily_budget: Number(form.budget),
        interactive_reserve_pct: Number(form.reserve),
      });
      onCreated(connector);
    });
    if (created) onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add Connector</DialogTitle>
        <DialogDescription>One connector per provider and storefront. Credentials are stored encrypted.</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="connector-provider">Provider</Label>
        <Select
          value={form.provider}
          onValueChange={(key) => {
            const next = providers.find((item) => item.key === key);
            if (next) dispatch({ type: "provider", provider: next });
          }}
        >
          <SelectTrigger id="connector-provider" className="w-full">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((item) => (
              <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {provider && provider.storefronts.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="connector-storefront">Storefront</Label>
          <Select value={form.storefront} onValueChange={(value) => dispatch({ type: "field", name: "storefront", value })}>
            <SelectTrigger id="connector-storefront" className="w-full">
              <SelectValue placeholder="Choose a storefront" />
            </SelectTrigger>
            <SelectContent>
              {provider.storefronts.map((storefront) => (
                <SelectItem key={storefront} value={storefront}>{storefront}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="connector-name">Name</Label>
          <Input
            id="connector-name"
            placeholder={provider?.label ?? ""}
            value={form.displayName}
            onChange={(event) => dispatch({ type: "field", name: "displayName", value: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="connector-currency">Currency</Label>
          <Input
            id="connector-currency"
            placeholder="EUR"
            maxLength={3}
            value={form.currency}
            onChange={(event) => dispatch({ type: "field", name: "currency", value: event.target.value })}
          />
        </div>
        {provider?.metered !== false ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="connector-budget">Daily call budget</Label>
              <Input
                id="connector-budget"
                inputMode="numeric"
                value={form.budget}
                onChange={(event) => dispatch({ type: "field", name: "budget", value: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="connector-reserve">Held for lookups (%)</Label>
              <Input
                id="connector-reserve"
                inputMode="numeric"
                value={form.reserve}
                onChange={(event) => dispatch({ type: "field", name: "reserve", value: event.target.value })}
              />
            </div>
          </>
        ) : null}
      </div>

      {provider ? (
        <CredentialInputs
          fields={provider.credential_fields}
          values={form.credentials}
          idPrefix="connector-credential"
          onChange={(name, value) => dispatch({ type: "credential", name, value })}
        />
      ) : null}

      {error ? (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || problem !== null} title={problem ?? undefined}>
          {busy ? "Adding…" : "Add connector"}
        </Button>
      </DialogFooter>
    </form>
  );
}
