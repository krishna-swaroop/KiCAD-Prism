import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CatalogMetadataField } from "@/types/catalog";

function fieldControlId(field: CatalogMetadataField): string {
  return `component-edit-${field.key}`;
}

function fieldLabel(field: CatalogMetadataField, required: boolean): string {
  const unit = field.unit ? ` (${field.unit})` : "";
  return `${field.label}${unit}${required ? " *" : ""}`;
}

function isChecked(value: string): boolean {
  return ["true", "1", "yes"].includes(value.toLocaleLowerCase());
}

export function MetadataFieldControl({
  field,
  value,
  required,
  error,
  onChange,
}: {
  field: CatalogMetadataField;
  value: string;
  required: boolean;
  error: string;
  onChange: (value: string) => void;
}) {
  const id = fieldControlId(field);
  const label = fieldLabel(field, required);
  const wide = field.key === "description";

  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {field.type === "boolean" ? (
        <div className="flex h-9 items-center">
          <Checkbox
            id={id}
            checked={isChecked(value)}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
            aria-invalid={Boolean(error)}
          />
        </div>
      ) : field.type === "enum" ? (
        <select
          id={id}
          aria-label={label}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-none border bg-transparent px-3 text-xs outline-none focus-visible:ring-1"
          value={value}
          required={required}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">—</option>
          {field.enum_values.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : field.key === "description" ? (
        <Textarea
          id={id}
          required={required}
          value={value}
          rows={3}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={field.type === "url" ? "url" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          required={required}
          value={value}
          placeholder={field.description || undefined}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <p className="text-destructive text-xs" role="alert">{error}</p> : null}
    </div>
  );
}
