import { useEffect, useRef, useState } from "react";
import { Edit3, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import type { CatalogComponent, CatalogMetadataField } from "@/types/catalog";

import { MetadataFieldControl } from "./library-component-metadata-fields";
import {
  activeMetadataFields,
  buildMetadataPatch,
  isFieldRequired,
  isMetadataFormComplete,
  metadataFormErrors,
  parseUnknownExtraJson,
  unknownExtraFields,
  valuesFromComponent,
} from "./library-component-metadata-form";

export type MetadataEditSession = {
  openedAt: string;
  componentId: string;
  expectedRevisionId: string;
  identityKind: CatalogComponent["identity_kind"];
  component: CatalogComponent;
};

let nextMetadataSession = 0;

export function metadataEditSessionFrom(component: CatalogComponent): MetadataEditSession {
  nextMetadataSession += 1;
  return {
    openedAt: `metadata-${nextMetadataSession}`,
    componentId: component.id,
    expectedRevisionId: component.revision_id,
    identityKind: component.identity_kind,
    component,
  };
}

export function MetadataEditDialog({
  session,
  onClose,
  onSuccess,
}: {
  session: MetadataEditSession;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fields, setFields] = useState<CatalogMetadataField[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [unknownExtrasJson, setUnknownExtrasJson] = useState("{}");
  const [changeSummary, setChangeSummary] = useState("Update component metadata");
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFields = async () => {
      try {
        const payload = await fetchJson<{ items: CatalogMetadataField[] }>("/api/catalog/metadata/fields");
        if (!aliveRef.current || cancelled) return;
        const nextFields = activeMetadataFields(payload.items ?? []);
        setFields(nextFields);
        setValues(valuesFromComponent(session.component, nextFields));
        setUnknownExtrasJson(JSON.stringify(unknownExtraFields(session.component, nextFields), null, 2));
        setLoadError("");
      } catch (reason) {
        if (!aliveRef.current || cancelled) return;
        setLoadError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void loadFields();
    return () => {
      cancelled = true;
    };
  }, [session.component]);

  const errors = fields
    ? metadataFormErrors(fields, values, session.identityKind, changeSummary, unknownExtrasJson)
    : null;
  const canSave = Boolean(fields && errors && isMetadataFormComplete(errors) && !loadError);

  const handleSubmit = async () => {
    if (!fields || !errors || !isMetadataFormComplete(errors)) return;
    const parsed = parseUnknownExtraJson(unknownExtrasJson);
    if (!parsed.ok) return;
    setSubmitting(true);
    try {
      await fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(session.componentId)}`, {
        method: "PATCH",
        body: JSON.stringify(buildMetadataPatch({
          values,
          fields,
          unknownExtras: parsed.extras,
          changeSummary,
          expectedRevisionId: session.expectedRevisionId,
        })),
      });
      if (!aliveRef.current) return;
      toast.success("Metadata saved as a new revision.");
      onSuccess();
    } catch (reason) {
      if (!aliveRef.current) return;
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !submitting) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit component metadata</DialogTitle>
          <DialogDescription>Saving creates a new immutable revision. The current revision ID is checked to prevent overwriting concurrent work.</DialogDescription>
        </DialogHeader>
        {session.identityKind === "provisional_ipn" ? (
          <p className="border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <strong className="text-foreground">Provisional component.</strong> Manufacturer part number is optional until a real MPN replaces this identity.
          </p>
        ) : null}
        {!fields && !loadError ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading field definitions…
          </div>
        ) : null}
        {loadError ? <p className="text-destructive text-sm" role="alert">{loadError}</p> : null}
        {fields ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <MetadataFieldControl
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                required={isFieldRequired(field, session.identityKind)}
                error={errors?.fieldErrors[field.key] ?? ""}
                onChange={(next) => setValues({ ...values, [field.key]: next })}
              />
            ))}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="component-edit-unknown-extras">Additional extra fields (JSON object)</Label>
              <Textarea
                id="component-edit-unknown-extras"
                className="font-mono text-xs"
                value={unknownExtrasJson}
                rows={6}
                spellCheck={false}
                aria-invalid={Boolean(errors?.unknownExtrasError)}
                onChange={(event) => setUnknownExtrasJson(event.target.value)}
              />
              {errors?.unknownExtrasError ? (
                <p className="text-destructive text-xs" role="alert">{errors.unknownExtrasError}</p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="component-edit-summary">Change summary *</Label>
              <Input
                id="component-edit-summary"
                required
                value={changeSummary}
                placeholder="Describe why this revision is needed"
                aria-invalid={Boolean(errors?.changeSummaryError)}
                onChange={(event) => setChangeSummary(event.target.value)}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button disabled={submitting || !canSave} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
            Save new revision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
