import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyCredentialField } from "@/types/supply";

interface CredentialInputsProps {
  fields: SupplyCredentialField[];
  values: Record<string, string>;
  idPrefix: string;
  onChange: (name: string, value: string) => void;
}

/** One input per credential the provider needs. Values are never prefilled. */
export function CredentialInputs({ fields, values, idPrefix, onChange }: CredentialInputsProps) {
  return (
    <>
      {fields.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-${field.name}`}>{field.label}</Label>
          <Input
            id={`${idPrefix}-${field.name}`}
            type={field.secret ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={values[field.name] ?? ""}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
        </div>
      ))}
    </>
  );
}
