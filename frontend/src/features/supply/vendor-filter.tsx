import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { vendorColor } from "./vendor-colors";
import { useConnectorList } from "./use-supply-connectors";

const ANY = "any";

function Swatch({ provider }: { provider: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: vendorColor(provider) ?? "#6b7280" }} />;
}

/** Narrows a parts list to the parts one distributor lists, each in its colour. */
export function VendorSelect({ vendor, onChange }: { vendor: string; onChange: (vendor: string) => void }) {
  const { data } = useConnectorList();
  const connectors = (data ?? []).filter((item) => item.enabled);
  // A vendor in the address that is gone from the list still shows, so it can be let go.
  const known = connectors.some((item) => item.id === vendor);
  return (
    <Select value={vendor || ANY} onValueChange={(next) => onChange(next === ANY ? "" : next)}>
      <SelectTrigger size="sm" className="w-32" aria-label="Vendor">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any vendor</SelectItem>
        {vendor && !known ? <SelectItem value={vendor}>Unknown vendor</SelectItem> : null}
        {connectors.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            <span className="flex items-center gap-2"><Swatch provider={item.provider} />{item.display_name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
