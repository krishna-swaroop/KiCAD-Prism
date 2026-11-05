import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogComponent } from "@/types/catalog";
import { createComponent } from "./catalog-client";

export type CreateComponentForm = {
  value: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  description: string;
  datasheet: string;
  category: string;
  packageName: string;
  changeSummary: string;
};

const EMPTY_CREATE_FORM: CreateComponentForm = {
  value: "",
  manufacturer: "",
  manufacturerPartNumber: "",
  description: "",
  datasheet: "",
  category: "",
  packageName: "",
  changeSummary: "Create component metadata record",
};

/** The first metadata revision of a new catalog component. `initial` fills fields in, as when a BOM line is added to the library. */
export function CreateComponentDialog({
  open,
  onOpenChange,
  onCreated,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (component: CatalogComponent) => void;
  initial?: Partial<CreateComponentForm>;
}) {
  const [form, setForm] = useState<CreateComponentForm>(() => ({ ...EMPTY_CREATE_FORM, ...initial }));
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: keyof CreateComponentForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const canSubmit = Boolean(form.value.trim() && form.manufacturer.trim() && form.manufacturerPartNumber.trim() && form.description.trim() && form.datasheet.trim() && form.changeSummary.trim());

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Required fields missing");
      return;
    }
    setSubmitting(true);
    try {
      const component = await createComponent({
        value: form.value.trim(),
        manufacturer: form.manufacturer.trim(),
        manufacturer_part_number: form.manufacturerPartNumber.trim(),
        description: form.description.trim(),
        datasheet: form.datasheet.trim(),
        category: form.category.trim(),
        package_name: form.packageName.trim(),
        change_summary: form.changeSummary.trim(),
      });
      toast.success(`${component.name} v${component.revision} created`);
      setForm(EMPTY_CREATE_FORM);
      onOpenChange(false);
      onCreated(component);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New component</DialogTitle>
          <DialogDescription className="sr-only">First metadata revision of a new component</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="catalog-create-value">Value *</Label><Input id="catalog-create-value" autoFocus required value={form.value} onChange={(event) => setField("value", event.target.value)} placeholder="10 kΩ, TPS55289, USB-C…" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-manufacturer">Manufacturer *</Label><Input id="catalog-create-manufacturer" required value={form.manufacturer} onChange={(event) => setField("manufacturer", event.target.value)} placeholder="Texas Instruments" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-mpn">Manufacturer part number *</Label><Input id="catalog-create-mpn" required value={form.manufacturerPartNumber} onChange={(event) => setField("manufacturerPartNumber", event.target.value)} placeholder="TPS55289RGER" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-datasheet">Datasheet URL *</Label><Input id="catalog-create-datasheet" type="url" required value={form.datasheet} onChange={(event) => setField("datasheet", event.target.value)} placeholder="https://…" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-category">Category</Label><Input id="catalog-create-category" value={form.category} onChange={(event) => setField("category", event.target.value)} placeholder="Power management" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-package">Package</Label><Input id="catalog-create-package" value={form.packageName} onChange={(event) => setField("packageName", event.target.value)} placeholder="VQFN-24" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="catalog-create-description">Description *</Label><Textarea id="catalog-create-description" required value={form.description} onChange={(event) => setField("description", event.target.value)} rows={3} /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="catalog-create-summary">Change summary *</Label><Input id="catalog-create-summary" required value={form.changeSummary} onChange={(event) => setField("changeSummary", event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting || !canSubmit} onClick={() => void handleSubmit()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
