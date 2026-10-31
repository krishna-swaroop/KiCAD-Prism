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
import type { SupplyConnector, SupplyCredentialField } from "@/types/supply";
import { CredentialInputs } from "./credential-inputs";
import { setSupplyConnectorCredentials } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

interface ConnectorCredentialsDialogProps {
  connector: SupplyConnector | null;
  /** The provider's credential fields; empty when the provider takes none. */
  fields: SupplyCredentialField[];
  onClose: () => void;
  onSaved: (connector: SupplyConnector) => void;
}

function setValue(state: Record<string, string>, change: { name: string; value: string }) {
  return { ...state, [change.name]: change.value };
}

export function ConnectorCredentialsDialog({ connector, fields, onClose, onSaved }: ConnectorCredentialsDialogProps) {
  return (
    <Dialog open={connector !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {connector ? (
          <CredentialsForm key={connector.id} connector={connector} fields={fields} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CredentialsForm({
  connector,
  fields,
  onClose,
  onSaved,
}: { connector: SupplyConnector } & Omit<ConnectorCredentialsDialogProps, "connector">) {
  const [values, update] = useReducer(setValue, {} as Record<string, string>);
  const { busy, error, run } = useConnectorSubmit();
  const complete = fields.every((field) => (values[field.name] ?? "").trim() !== "");

  const submit = async () => {
    const saved = await run(async () => onSaved(await setSupplyConnectorCredentials(connector.id, values)));
    if (saved) onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Replace Credentials</DialogTitle>
        <DialogDescription>
          Saved credentials are never shown. Enter every value to replace them.
        </DialogDescription>
      </DialogHeader>
      <CredentialInputs
        fields={fields}
        values={values}
        idPrefix="replace-credential"
        onChange={(name, value) => update({ name, value })}
      />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !complete}>{busy ? "Saving…" : "Replace"}</Button>
      </DialogFooter>
    </form>
  );
}
