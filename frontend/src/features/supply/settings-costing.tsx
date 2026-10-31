import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { AssessmentSettingsView } from "@/types/supply";
import { PreferredDistributors } from "./preferred-distributors";
import { currencyLabel } from "./supply-format";
import { DefaultNote, SettingsGroup, WholeInput } from "./settings-group";

const FIELDS = [
  "base_currency", "price_quantity", "spares_mode", "spares_percent", "spares_small_passives", "spares_others", "prefer_distributors", "distributor_order",
] as const;

function Percent({ id, label, value, onChange, changed, fallback }: {
  id: string; label: string; value: number; onChange: (next: number) => void; changed: boolean; fallback: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <span className="flex items-center gap-1.5">
        <Input id={id} type="number" min={0} max={100} step={0.5} className="w-24" value={value}
          onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next >= 0 && next <= 100) onChange(next); }} />
        %<DefaultNote changed={changed} text={`${fallback}%`} />
      </span>
    </div>
  );
}

/** Currency, price quantity, spares and preferred distributors: what a costing is worked out with. */
export function SettingsCosting({ view, readOnly, onSaved }: { view: AssessmentSettingsView; readOnly: boolean; onSaved: (next: AssessmentSettingsView) => void }) {
  const [lowQuantity, highQuantity] = view.ranges.price_quantity;
  const defaults = view.defaults;
  return (
    <SettingsGroup title="Costing" fields={FIELDS} view={view} readOnly={readOnly} onSaved={onSaved}>
      {(draft, set) => (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="setting-currency">Currency</Label>
            <span className="flex items-center">
              <Select value={draft.base_currency} onValueChange={(next) => set({ ...draft, base_currency: next })}>
                <SelectTrigger id="setting-currency" className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(view.currencies ?? [draft.base_currency]).map((code) => <SelectItem key={code} value={code}>{currencyLabel(code)}</SelectItem>)}
                </SelectContent>
              </Select>
              <DefaultNote changed={draft.base_currency !== defaults.base_currency} text={defaults.base_currency} />
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setting-quantity">Price quantity</Label>
            <span className="flex items-center">
              <WholeInput id="setting-quantity" className="w-32" value={draft.price_quantity} low={lowQuantity} high={highQuantity} onChange={(next) => set({ ...draft, price_quantity: next })} />
              <DefaultNote changed={draft.price_quantity !== defaults.price_quantity} text={String(defaults.price_quantity)} />
            </span>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Spares</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="spares-mode" checked={draft.spares_mode === "flat"} onChange={() => set({ ...draft, spares_mode: "flat" })} />Same for every part</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="spares-mode" checked={draft.spares_mode === "package"} onChange={() => set({ ...draft, spares_mode: "package" })} />By part type</label>
            </div>
            {draft.spares_mode === "flat" ? (
              <Percent id="setting-spares" label="Spares" value={draft.spares_percent} onChange={(next) => set({ ...draft, spares_percent: next })}
                changed={draft.spares_percent !== defaults.spares_percent} fallback={defaults.spares_percent} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Percent id="setting-spares-small" label="Small passives (01005 to 0603)" value={draft.spares_small_passives} onChange={(next) => set({ ...draft, spares_small_passives: next })}
                  changed={draft.spares_small_passives !== defaults.spares_small_passives} fallback={defaults.spares_small_passives} />
                <Percent id="setting-spares-others" label="Other parts" value={draft.spares_others} onChange={(next) => set({ ...draft, spares_others: next })}
                  changed={draft.spares_others !== defaults.spares_others} fallback={defaults.spares_others} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">A tracked project can set its own.</p>
          </fieldset>
          <PreferredDistributors draft={draft} onChange={set} />
        </>
      )}
    </SettingsGroup>
  );
}
