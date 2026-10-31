import { useCallback, useState, type ReactNode } from "react";
import { Bell, Calculator, Database, Link2, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@/types/auth";
import type { AssessmentSettingsView } from "@/types/supply";
import { ExchangeRates } from "./exchange-rates";
import { MakerSpellings } from "./maker-spellings";
import { NumberEndings } from "./number-endings";
import { ScheduleSettings } from "./schedule-settings";
import { SettingsAlerts } from "./settings-alerts";
import { SettingsChecks } from "./settings-checks";
import { SettingsCosting } from "./settings-costing";
import { SvhcListUpload } from "./svhc-list-upload";
import { getAssessmentSettings } from "./supply-api";
import { useLoaded } from "./use-loaded";

type GroupId = "costing" | "checks" | "alerts" | "reading" | "matching" | "reference";

const GROUPS: ReadonlyArray<{ id: GroupId; label: string; about: string; icon: LucideIcon }> = [
  { id: "costing", label: "Costing", about: "Currency, price quantity and spares.", icon: Calculator },
  { id: "checks", label: "Health checks", about: "What counts as a problem, and how bad.", icon: ShieldCheck },
  { id: "alerts", label: "Alerts", about: "When to raise an alert.", icon: Bell },
  { id: "reading", label: "Reading", about: "Background reads.", icon: RefreshCw },
  { id: "matching", label: "Matching", about: "Maker names and part number endings.", icon: Link2 },
  { id: "reference", label: "Reference data", about: "Exchange rates and the REACH list.", icon: Database },
];

/**
 * A group of lists that save as they change. Anyone who is not an administrator sees them without their controls; a disabled
 * fieldset would also lock the buttons that open a folded list, so each list leaves its own controls out.
 */
function Lists({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return <div className="space-y-4">{children}{readOnly ? <p className="text-xs text-muted-foreground">Only administrators can change these.</p> : null}</div>;
}

function Group({ id, view, readOnly, onSaved }: { id: GroupId; view: AssessmentSettingsView; readOnly: boolean; onSaved: (next: AssessmentSettingsView) => void }) {
  switch (id) {
    case "costing": return <SettingsCosting view={view} readOnly={readOnly} onSaved={onSaved} />;
    case "checks": return <SettingsChecks view={view} readOnly={readOnly} onSaved={onSaved} />;
    case "alerts": return <SettingsAlerts view={view} readOnly={readOnly} onSaved={onSaved} />;
    case "reading": return <Lists readOnly={readOnly}><ScheduleSettings readOnly={readOnly} /></Lists>;
    case "matching": return <Lists readOnly={readOnly}><MakerSpellings readOnly={readOnly} /><NumberEndings readOnly={readOnly} /></Lists>;
    case "reference": return <Lists readOnly={readOnly}><ExchangeRates readOnly={readOnly} /><SvhcListUpload readOnly={readOnly} /></Lists>;
  }
}

/** The groups as the nav shows them: the figures Prism works out, then the data they come from. */
const NAV: ReadonlyArray<{ title: string; ids: readonly GroupId[] }> = [
  { title: "Figures", ids: ["costing", "checks", "alerts"] },
  { title: "Data", ids: ["reading", "matching", "reference"] },
];

function Body({ user }: { user: User | null }) {
  const fetcher = useCallback((signal: AbortSignal) => getAssessmentSettings(signal), []);
  const loaded = useLoaded<AssessmentSettingsView>("settings/assessment", fetcher, "Could not load the settings");
  const [group, setGroup] = useState<GroupId>("costing");
  const [saved, setSaved] = useState<AssessmentSettingsView | null>(null);
  if (loaded.status === "loading") return <div className="flex-1 p-6"><Skeleton className="h-60 w-full" aria-label="Loading the settings" /></div>;
  if (loaded.status === "error" || !loaded.data) {
    return (
      <div className="flex-1 p-6">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            {loaded.error}
            <Button size="sm" variant="outline" onClick={loaded.retry}>Retry</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  // What was saved last is what the groups start from, so a second group never sends the first one's old figures back.
  const view = saved ?? loaded.data;
  const current = GROUPS.find((item) => item.id === group) ?? GROUPS[0];
  return (
    <>
      <nav className="flex w-60 shrink-0 flex-col gap-4 border-r bg-muted/30 p-4" aria-label="Settings groups">
        <h2 className="px-2 text-lg font-semibold tracking-tight">Supply settings</h2>
        {NAV.map((part) => (
          <div key={part.title} className="flex flex-col gap-1">
            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{part.title}</p>
            {part.ids.map((id) => {
              const item = GROUPS.find((entry) => entry.id === id) ?? GROUPS[0];
              return (
                <Button
                  key={id} variant={id === group ? "secondary" : "ghost"} className="justify-start"
                  aria-current={id === group ? "page" : undefined} onClick={() => setGroup(id)}
                >
                  <item.icon className="mr-2 h-4 w-4" />{item.label}
                </Button>
              );
            })}
          </div>
        ))}
      </nav>
      <section aria-label={current.label} className="themed-scrollbar min-w-0 flex-1 space-y-4 overflow-y-auto p-6">
        <div>
          <h3 className="text-lg font-medium">{current.label}</h3>
          <p className="text-sm text-muted-foreground">{current.about}</p>
        </div>
        <div className="max-w-2xl">
          <Group key={`${group}:${JSON.stringify(view.settings)}`} id={group} view={view} readOnly={user?.role !== "admin"} onSaved={setSaved} />
        </div>
      </section>
    </>
  );
}

/** Supply settings in a window, as the workspace settings are: groups on the left, each saved on its own. Everyone who reads supply sees it; administrators change it. */
export function SettingsDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (open: boolean) => void; user: User | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[720px] w-[90vw] max-w-5xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Supply settings</DialogTitle>
        <DialogDescription className="sr-only">What supply costing, health checks, alerts, reading, matching and reference data use.</DialogDescription>
        {open ? <Body user={user} /> : null}
      </DialogContent>
    </Dialog>
  );
}
