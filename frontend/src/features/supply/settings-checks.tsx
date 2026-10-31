import { Label } from "@/components/ui/label";
import type { AssessmentSettingsView, AssessmentSeverity } from "@/types/supply";
import { DefaultNote, SettingsGroup, WholeInput } from "./settings-group";

const SEVERITY_LABEL: Record<AssessmentSeverity, string> = { ok: "Note only", warning: "Warning", error: "Error", fatal: "Critical" };
const AREAS = ["Lifecycle", "Sourcing", "Stock", "Compliance", "BOM line"] as const;
const FIELDS = ["lead_time_days", "last_buy_error_days", "late_hours", "severity"] as const;

/** What is a finding and how serious each check is, grouped by area; a check changed from its default is marked. */
export function SettingsChecks({ view, readOnly, onSaved }: { view: AssessmentSettingsView; readOnly: boolean; onSaved: (next: AssessmentSettingsView) => void }) {
  const [lowLead, highLead] = view.ranges.lead_time_days;
  const [lowLastBuy, highLastBuy] = view.ranges.last_buy_error_days;
  const [lowLate, highLate] = view.ranges.late_hours;
  const defaults = view.defaults;
  return (
    <SettingsGroup title="Health checks" fields={FIELDS} view={view} readOnly={readOnly} onSaved={onSaved}>
      {(draft, set) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setting-lead">Longest lead time (days)</Label>
              <span className="flex items-center">
                <WholeInput id="setting-lead" value={draft.lead_time_days} low={lowLead} high={highLead} onChange={(next) => set({ ...draft, lead_time_days: next })} />
                <DefaultNote changed={draft.lead_time_days !== defaults.lead_time_days} text={String(defaults.lead_time_days)} />
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-last-buy">Last buy date is an error within (days)</Label>
              <span className="flex items-center">
                <WholeInput id="setting-last-buy" value={draft.last_buy_error_days} low={lowLastBuy} high={highLastBuy} onChange={(next) => set({ ...draft, last_buy_error_days: next })} />
                <DefaultNote changed={draft.last_buy_error_days !== defaults.last_buy_error_days} text={String(defaults.last_buy_error_days)} />
              </span>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="setting-late">Read is late after (hours)</Label>
              <span className="flex items-center">
                <WholeInput id="setting-late" value={draft.late_hours} low={lowLate} high={highLate} onChange={(next) => set({ ...draft, late_hours: next })} />
                <DefaultNote changed={draft.late_hours !== defaults.late_hours} text={String(defaults.late_hours)} />
              </span>
              <p className="text-xs text-muted-foreground">Counted from when the part was due for a read.</p>
            </div>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Severity of each check</legend>
            {AREAS.map((area) => (
              <div key={area} className="space-y-1">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{area}</h4>
                <ul className="divide-y border">
                  {view.checks.flatMap((check) => (check.area !== area ? [] : [(
                    <li key={check.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                      <Label htmlFor={`severity-${check.id}`} className="font-normal">{check.label}</Label>
                      <span className="flex items-center">
                        <select id={`severity-${check.id}`} className="h-8 border bg-background px-2 text-sm" value={draft.severity[check.id]}
                          onChange={(event) => set({ ...draft, severity: { ...draft.severity, [check.id]: event.target.value as AssessmentSeverity } })}>
                          {(Object.keys(SEVERITY_LABEL) as AssessmentSeverity[]).map((value) => <option key={value} value={value}>{SEVERITY_LABEL[value]}</option>)}
                        </select>
                        <DefaultNote changed={draft.severity[check.id] !== defaults.severity[check.id]} text={SEVERITY_LABEL[defaults.severity[check.id]].toLowerCase()} />
                      </span>
                    </li>
                  )]))}
                </ul>
              </div>
            ))}
          </fieldset>
        </>
      )}
    </SettingsGroup>
  );
}
