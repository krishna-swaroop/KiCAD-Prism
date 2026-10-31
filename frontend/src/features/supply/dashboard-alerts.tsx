import { useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { canEditSupply } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type { SupplyDashboard } from "@/types/supply";
import { AlertRow } from "./alert-row";
import { ALERT_KIND_LABEL } from "./alert-kinds";
import { acknowledgeSupplyAlert, snoozeSupplyAlert } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useSupplyAlerts } from "./use-supply-parts";

function useAlertList(user: User | null) {
  const [showCleared, setShowCleared] = useState(false);
  const loaded = useSupplyAlerts(showCleared);
  const { busy, error, run } = useConnectorSubmit();
  const act = (action: () => Promise<void>) => void run(async () => { await action(); await loaded.refresh(); });
  return { ...loaded, showCleared, setShowCleared, busy, actionError: error, act, canAct: canEditSupply(user?.role) };
}

/** The alerts, worst first, with a chip a kind to narrow them. */
export function AlertList({ user, dashboard, feedsFailing = false, kind, onKind, onOpenPart }: {
  user: User | null;
  dashboard: SupplyDashboard | null | undefined;
  /** A feed is failing: an empty list then never says "Nothing needs you". */
  feedsFailing?: boolean;
  kind: string;
  onKind: (kind: string) => void;
  onOpenPart: (id: string) => void;
}) {
  const { status, data, error, retry, showCleared, setShowCleared, busy, actionError, act, canAct } = useAlertList(user);
  // The Open alerts tile counts the open ones, so that is the list; Show cleared adds the acknowledged, snoozed and resolved.
  const listed = useMemo(() => (data ?? []).filter((alert) => showCleared || alert.state === "open"), [data, showCleared]);
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of listed) counts.set(alert.kind, (counts.get(alert.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [listed]);
  const shown = listed.filter((alert) => !kind || alert.kind === kind);
  return (
    <details id="dashboard-alerts">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alerts</summary>
      <section aria-label="Alerts" className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Kind of alert" className="flex flex-wrap items-center gap-1">
          {kinds.length > 1 ? (
            <>
              <Button size="sm" variant={kind === "" ? "secondary" : "ghost"} aria-pressed={kind === ""} onClick={() => onKind("")}>All {listed.length}</Button>
              {kinds.map(([name, count]) => (
                <Button key={name} size="sm" variant={kind === name ? "secondary" : "ghost"} aria-pressed={kind === name} onClick={() => onKind(name)}>
                  {ALERT_KIND_LABEL[name as keyof typeof ALERT_KIND_LABEL] ?? name} {count}
                </Button>
              ))}
            </>
          ) : null}
        </div>
        <span className="flex items-center gap-2">
          <Checkbox id="inbox-cleared" checked={showCleared} onCheckedChange={(checked) => setShowCleared(checked === true)} />
          <Label htmlFor="inbox-cleared" className="font-normal">Show cleared</Label>
        </span>
      </div>
      {status === "loading" ? <Skeleton className="h-32 w-full" aria-label="Loading alerts" /> : null}
      {status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {actionError ? <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert> : null}
      {status === "ready" && data ? (
        shown.length === 0 ? (
          <div className="border border-dashed p-6 text-sm text-muted-foreground">{emptyText(dashboard, showCleared, feedsFailing)}</div>
        ) : (
          <ul className={cn("border")}>
            {shown.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                canAct={canAct}
                busy={busy}
                onOpenPart={onOpenPart}
                onAcknowledge={(id) => act(() => acknowledgeSupplyAlert(id))}
                onSnooze={(id, hours) => act(() => snoozeSupplyAlert(id, hours))}
              />
            ))}
          </ul>
        )
      ) : null}
      </section>
    </details>
  );
}

function emptyText(dashboard: SupplyDashboard | null | undefined, showCleared: boolean, feedsFailing: boolean): string {
  if (showCleared) return "Nothing here yet.";
  if (feedsFailing) return "No open alerts.";
  if (!dashboard) return "Nothing needs you.";
  if (dashboard.connectors === 0) return "No distributor is connected. Add one under Connectors, and Prism can start reading stock.";
  if (dashboard.figures.watched === 0) return "No parts are tracked yet. Track a part in Parts and it is read regularly.";
  if (dashboard.no_data === dashboard.figures.watched) return "Tracked parts are waiting for their first read.";
  return "Nothing needs you. Alerts appear here after a part has been read twice.";
}
