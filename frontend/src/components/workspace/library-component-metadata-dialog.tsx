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
import type { CatalogComponent } from "@/types/catalog";

type MetadataForm = {
  value: string;
  description: string;
  datasheetUrl: string;
  manufacturer: string;
  mpn: string;
  category: string;
  packageName: string;
  vendor: string;
  vendorPartNumber: string;
  massG: string;
  rqjcCW: string;
  rqjcTopCW: string;
  tempMaxC: string;
  tempMinC: string;
  powerDissipationW: string;
  rate: string;
  sapCode: string;
  extraFieldsJson: string;
  changeSummary: string;
};

export type MetadataEditSession = {
  openedAt: string;
  componentId: string;
  expectedRevisionId: string;
  form: MetadataForm;
};

let nextMetadataSession = 0;

const metadataFormFromComponent = (component: CatalogComponent): MetadataForm => ({
  value: component.value || "",
  description: component.description || "",
  datasheetUrl: component.datasheet_url || "",
  manufacturer: component.manufacturer || "",
  mpn: component.mpn || "",
  category: component.category || "",
  packageName: component.package_name || "",
  vendor: component.vendor || "",
  vendorPartNumber: component.vendor_part_number || "",
  massG: component.mass_g || "",
  rqjcCW: component.rqjc_c_w || "",
  rqjcTopCW: component.rqjc_top_c_w || "",
  tempMaxC: component.temp_max_c || "",
  tempMinC: component.temp_min_c || "",
  powerDissipationW: component.power_dissipation_w || "",
  rate: component.rate || "",
  sapCode: component.sap_code || "",
  extraFieldsJson: JSON.stringify(component.extra_fields ?? {}, null, 2),
  changeSummary: "Update component metadata",
});

export function metadataEditSessionFrom(component: CatalogComponent): MetadataEditSession {
  nextMetadataSession += 1;
  return {
    openedAt: `metadata-${nextMetadataSession}`,
    componentId: component.id,
    expectedRevisionId: component.revision_id,
    form: metadataFormFromComponent(component),
  };
}

const METADATA_FIELDS: Array<{ field: keyof MetadataForm; label: string; type?: string; placeholder?: string }> = [
  { field: "value", label: "Value", placeholder: "10 kΩ, TPS55289…" },
  { field: "manufacturer", label: "Manufacturer" },
  { field: "mpn", label: "Manufacturer part number" },
  { field: "datasheetUrl", label: "Datasheet URL", type: "url" },
  { field: "category", label: "Category" },
  { field: "packageName", label: "Package" },
  { field: "vendor", label: "Vendor" },
  { field: "vendorPartNumber", label: "Vendor part number" },
  { field: "massG", label: "Mass (g)" },
  { field: "rqjcCW", label: "RθJC (°C/W)" },
  { field: "rqjcTopCW", label: "RθJC top (°C/W)" },
  { field: "tempMaxC", label: "Maximum temperature (°C)" },
  { field: "tempMinC", label: "Minimum temperature (°C)" },
  { field: "powerDissipationW", label: "Power dissipation (W)" },
  { field: "rate", label: "Rate" },
  { field: "sapCode", label: "SAP code" },
];

export function MetadataEditDialog({
  session,
  onClose,
  onSuccess,
}: {
  session: MetadataEditSession;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<MetadataForm>(session.form);
  const [submitting, setSubmitting] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const setField = (field: keyof MetadataForm, value: string) => setForm({ ...form, [field]: value });
  const requiredComplete = Boolean(
    form.value.trim()
    && form.manufacturer.trim()
    && form.mpn.trim()
    && form.description.trim()
    && form.datasheetUrl.trim()
    && form.changeSummary.trim(),
  );

  const handleSubmit = async () => {
    let extraFields: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(form.extraFieldsJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Extended fields must be a JSON object.");
      extraFields = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Extended fields contain invalid JSON.");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(session.componentId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          value: form.value.trim(),
          description: form.description.trim(),
          datasheet_url: form.datasheetUrl.trim(),
          manufacturer: form.manufacturer.trim(),
          mpn: form.mpn.trim(),
          category: form.category.trim(),
          package_name: form.packageName.trim(),
          vendor: form.vendor.trim(),
          vendor_part_number: form.vendorPartNumber.trim(),
          mass_g: form.massG.trim(),
          rqjc_c_w: form.rqjcCW.trim(),
          rqjc_top_c_w: form.rqjcTopCW.trim(),
          temp_max_c: form.tempMaxC.trim(),
          temp_min_c: form.tempMinC.trim(),
          power_dissipation_w: form.powerDissipationW.trim(),
          rate: form.rate.trim(),
          sap_code: form.sapCode.trim(),
          extra_fields: extraFields,
          change_summary: form.changeSummary.trim(),
          expected_revision_id: session.expectedRevisionId,
        }),
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
        <div className="grid gap-4 sm:grid-cols-2">
          {METADATA_FIELDS.map(({ field, label, type, placeholder }) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`component-edit-${field}`}>{label}{["value", "manufacturer", "mpn", "datasheetUrl"].includes(field) ? " *" : ""}</Label>
              <Input id={`component-edit-${field}`} type={type} required={["value", "manufacturer", "mpn", "datasheetUrl"].includes(field)} value={form[field]} placeholder={placeholder} onChange={(event) => setField(field, event.target.value)} />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="component-edit-description">Description *</Label>
            <Textarea id="component-edit-description" required value={form.description} rows={3} onChange={(event) => setField("description", event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="component-edit-extra-fields">Extended symbol fields (JSON object)</Label>
            <Textarea id="component-edit-extra-fields" className="font-mono text-xs" value={form.extraFieldsJson} rows={6} spellCheck={false} onChange={(event) => setField("extraFieldsJson", event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="component-edit-summary">Change summary *</Label>
            <Input id="component-edit-summary" required value={form.changeSummary} placeholder="Describe why this revision is needed" onChange={(event) => setField("changeSummary", event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button disabled={submitting || !requiredComplete} onClick={() => void handleSubmit()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />} Save new revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
