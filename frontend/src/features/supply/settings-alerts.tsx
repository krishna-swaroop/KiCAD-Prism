import { Label } from "@/components/ui/label";
import type { AssessmentSettingsView } from "@/types/supply";
import { DefaultNote, SettingsGroup, WholeInput } from "./settings-group";

const FIELDS = ["alert_price_rise_percent", "alert_likely_out_percent"] as const;

/** When an alert is raised unless a part asks for its own line. */
export function SettingsAlerts({ view, readOnly, onSaved }: { view: AssessmentSettingsView; readOnly: boolean; onSaved: (next: AssessmentSettingsView) => void }) {
  const [lowRise, highRise] = view.ranges.alert_price_rise_percent;
  const [lowChance, highChance] = view.ranges.alert_likely_out_percent;
  const defaults = view.defaults;
  return (
    <SettingsGroup title="Alerts" fields={FIELDS} view={view} readOnly={readOnly} onSaved={onSaved}>
      {(draft, set) => (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="setting-price-rise">Price rise alert (%)</Label>
            <span className="flex items-center">
              <WholeInput id="setting-price-rise" value={draft.alert_price_rise_percent} low={lowRise} high={highRise} onChange={(next) => set({ ...draft, alert_price_rise_percent: next })} />
              <DefaultNote changed={draft.alert_price_rise_percent !== defaults.alert_price_rise_percent} text={`${defaults.alert_price_rise_percent}%`} />
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setting-likely-out">Likely to run out alert (% chance)</Label>
            <span className="flex items-center">
              <WholeInput id="setting-likely-out" value={draft.alert_likely_out_percent} low={lowChance} high={highChance} onChange={(next) => set({ ...draft, alert_likely_out_percent: next })} />
              <DefaultNote changed={draft.alert_likely_out_percent !== defaults.alert_likely_out_percent} text={`${defaults.alert_likely_out_percent}%`} />
            </span>
            <p className="text-xs text-muted-foreground">Chance of being out everywhere within four weeks. A part's own rule comes first.</p>
          </div>
        </>
      )}
    </SettingsGroup>
  );
}
