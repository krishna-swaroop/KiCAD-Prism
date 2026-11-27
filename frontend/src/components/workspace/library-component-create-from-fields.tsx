import { Badge } from "@/components/ui/badge";
import type { CatalogComponent } from "@/types/catalog";
import type { CreateComponentForm } from "./create-component-dialog";
import { ASSET_LABELS } from "./library-component-asset-dialog";

/**
 * Fields a part series shares but the create form does not show. "Create from" sends them as the
 * source's released revision has them, so the new part keeps them. The part-specific fields the
 * form does not show (vendor part number, SAP code) are not sent, so they start empty.
 */
const KEPT_FIELDS = {
  vendor: "Vendor",
  mass_g: "Mass",
  rqjc_c_w: "RθJC",
  rqjc_top_c_w: "RθJC top",
  temp_min_c: "Min temperature",
  temp_max_c: "Max temperature",
  power_dissipation_w: "Power dissipation",
  rate: "Rate",
} as const satisfies Partial<Record<keyof CatalogComponent, string>>;

/** The create form filled from a released revision: part-specific fields (MPN, datasheet) cleared. */
export function createFromForm(source: CatalogComponent): Partial<CreateComponentForm> {
  return {
    value: source.value,
    manufacturer: source.manufacturer,
    manufacturerPartNumber: "",
    description: source.description,
    datasheet: "",
    category: source.category,
    packageName: source.package_name,
    changeSummary: `Create from ${source.name} v${source.revision}`,
  };
}

/** The request fields "Create from" adds to the form's: the kept fields and the source reference. */
export function createFromRequest(source: CatalogComponent): Record<string, unknown> {
  const kept = Object.fromEntries(Object.keys(KEPT_FIELDS).map((key) => [key, source[key as keyof typeof KEPT_FIELDS] ?? ""]));
  return {
    ...kept,
    extra_fields: { ...source.extra_fields },
    source: { component_id: source.id, expected_revision_id: source.revision_id },
  };
}

/** What the new component gets from the source besides the form: linked files and kept fields. */
export function CreateFromSummary({ source }: { source: CatalogComponent }) {
  const kept = [
    ...Object.entries(KEPT_FIELDS).filter(([key]) => String(source[key as keyof typeof KEPT_FIELDS] ?? "").trim()).map(([, label]) => label),
    ...Object.keys(source.extra_fields ?? {}).filter((key) => String(source.extra_fields[key] ?? "").trim()),
  ];
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs" aria-label="Copied from the source">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Links v{source.revision}</span>
        {source.assets.map((asset) => (
          <Badge key={asset.id} variant="secondary" title={`${asset.target_library}:${asset.target_name}`}>{ASSET_LABELS[asset.asset_type]} · {asset.target_name || asset.name}</Badge>
        ))}
        {source.representations.length > 1 ? <Badge variant="outline">{source.representations.length} representations</Badge> : null}
      </div>
      {kept.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Keeps</span>
          {kept.map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
        </div>
      ) : null}
    </div>
  );
}
