import { BellOff, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SupplyAlert } from "@/types/supply";
import { ALERT_STATE_LABEL, alertTitle, SNOOZE_CHOICES } from "./alert-text";
import { StatusDot } from "./status-dot";
import { formatAgo, formatDateTime } from "./supply-format";

interface AlertRowProps {
  alert: SupplyAlert;
  /** Writers acknowledge and snooze. */
  canAct: boolean;
  busy: boolean;
  onOpenPart: (partId: string) => void;
  onAcknowledge: (alertId: number) => void;
  onSnooze: (alertId: number, hours: number) => void;
}

export function AlertRow({ alert, canAct, busy, onOpenPart, onAcknowledge, onSnooze }: AlertRowProps) {
  const live = alert.state === "open" || alert.state === "acknowledged" || alert.state === "snoozed";
  return (
    <li className="flex flex-wrap items-center gap-3 border-b px-3 py-3 last:border-0">
      <StatusDot status={alert.severity} />
      <div className="min-w-0 flex-1">
        <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpenPart(alert.part_id)}>
          {alert.mpn}
        </button>
        <span className="ml-2 text-xs text-muted-foreground">{alert.manufacturer}</span>
        <p className="text-sm">{alertTitle(alert)}</p>
        <p className="text-xs text-muted-foreground">
          {alert.state === "resolved"
            ? `Cleared ${formatAgo(alert.resolved_at)}`
            : alert.state === "snoozed"
              ? `Snoozed until ${alert.snoozed_until ? formatDateTime(alert.snoozed_until) : "later"}`
              : alert.state === "acknowledged"
                ? `Acknowledged by ${alert.acknowledged_by}`
                : `Since ${formatAgo(alert.opened_at)}`}
        </p>
      </div>
      {alert.state !== "open" ? <Badge variant="outline">{ALERT_STATE_LABEL[alert.state]}</Badge> : null}
      {canAct && live ? (
        <div className="flex gap-1">
          {alert.state === "open" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAcknowledge(alert.id)}>
              <Check className="h-4 w-4" />Acknowledge
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={busy}><BellOff className="h-4 w-4" />Snooze</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SNOOZE_CHOICES.map((choice) => (
                <DropdownMenuItem key={choice.hours} onSelect={() => onSnooze(alert.id, choice.hours)}>
                  {choice.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </li>
  );
}
