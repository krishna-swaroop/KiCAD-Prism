import { Check, KeyRound, MoreHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type BudgetConnector, type SupplyConnector } from "@/types/supply";
import { BudgetDetail } from "./budget-view";
import { CallBudget, LibraryBar, OffersFile, providerNote, ReportedLimits } from "./connector-card-parts";
import { ConnectorSignin } from "./connector-signin";
import { formatDateTime } from "./supply-format";
import { vendorColor } from "./vendor-colors";
import { connectorState, errorCodeLabel, lastCallFailed, resting, slowedText } from "./connector-status";
import { clockTime } from "./supply-format";

export type ConnectorAction =
  | "edit"
  | "test"
  | "credentials"
  | "pause"
  | "resume"
  | "enable"
  | "disable"
  | "apply-reset"
  | "csv-upload"
  | "csv-clear"
  | "push-token"
  | "delete";

interface ConnectorCardProps {
  connector: SupplyConnector;
  budget?: BudgetConnector;
  isAdmin: boolean;
  onAction: (action: ConnectorAction, connector: SupplyConnector) => void;
}

export function ConnectorCard({ connector, budget, isAdmin, onAction }: ConnectorCardProps) {
  const state = connectorState(connector);
  const credentialNames = Object.keys(connector.credentials);
  const where = [connector.provider_label, connector.storefront, connector.currency].filter(Boolean).join(" · ");

  return (
    <article
      className="border bg-card p-4"
      style={vendorColor(connector.provider) ? { borderLeft: `4px solid ${vendorColor(connector.provider)}` } : undefined}
      aria-label={connector.display_name}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{connector.display_name}</h3>
            <Badge variant={state.tone}>{state.label}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{where}</p>
        </div>
        {isAdmin ? <ConnectorMenu connector={connector} onAction={onAction} /> : null}
      </div>

      {connector.metered
        ? <CallBudget connector={connector} budget={budget} detail={budget ? <BudgetDetail item={budget} /> : undefined} />
        : <OffersFile connector={connector} />}
      {budget?.library && budget.library.total > 0 ? <LibraryBar library={budget.library} /> : null}
      {providerNote(connector.provider, connector.catalogue) ? <p className="mt-2 text-[11px] text-muted-foreground">{providerNote(connector.provider, connector.catalogue)}</p> : null}

      <dl className="mt-3 grid gap-1.5 text-xs">
        {credentialNames.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <dt className="flex items-center gap-1 text-muted-foreground"><KeyRound className="h-3 w-3" />Credentials</dt>
            {credentialNames.map((name) => (
              <dd key={name} className="inline-flex items-center gap-1 border px-1.5 py-0.5">
                {connector.credentials[name] ? <Check className="h-3 w-3 text-success" /> : <X className="h-3 w-3 text-destructive" />}
                {name}
              </dd>
            ))}
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Last call</dt>
          <dd>{lastCallText(connector)}</dd>
        </div>
        {slowedText(connector) ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Pacing</dt>
            <dd>{slowedText(connector)}</dd>
          </div>
        ) : null}
        <ReportedLimits connector={connector} isAdmin={isAdmin} onApply={() => onAction("apply-reset", connector)} />
        {connector.paused_reason ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Paused</dt>
            <dd>{connector.paused_reason}</dd>
          </div>
        ) : null}
      </dl>
      {isAdmin && connector.provider === "digikey" ? <ConnectorSignin connectorId={connector.id} status={connector.signin} notices={budget?.notices} /> : null}
    </article>
  );
}

function lastCallText(connector: SupplyConnector): string {
  if (lastCallFailed(connector)) {
    if (resting(connector) && connector.last_error_at) {
      const what = connector.last_error_code === "blocked" ? "Refused" : connector.last_error_code === "rate_limited" ? "Rate limited" : `Failed (${errorCodeLabel(connector.last_error_code)})`;
      return `${what} ${clockTime(connector.last_error_at)}, resting until ${clockTime(connector.cooldown_until as string)}`;
    }
    return `Failed (${errorCodeLabel(connector.last_error_code)}) ${formatDateTime(connector.last_error_at)}`;
  }
  return connector.last_ok_at ? `OK ${formatDateTime(connector.last_ok_at)}` : "None yet";
}

function ConnectorMenu({ connector, onAction }: Pick<ConnectorCardProps, "connector" | "onAction">) {
  const paused = connector.paused_reason !== "";
  const takesCredentials = Object.keys(connector.credentials).length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${connector.display_name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAction("test", connector)}>Test connection</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("edit", connector)}>Edit settings</DropdownMenuItem>
        {takesCredentials ? (
          <DropdownMenuItem onClick={() => onAction("credentials", connector)}>Replace credentials</DropdownMenuItem>
        ) : null}
        {connector.csv_fed ? (
          <>
            <DropdownMenuItem onClick={() => onAction("csv-upload", connector)}>Upload CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("push-token", connector)}>Push token</DropdownMenuItem>
            {connector.csv_import ? (
              <DropdownMenuItem onClick={() => onAction("csv-clear", connector)}>Remove uploaded data</DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {paused ? (
          <DropdownMenuItem onClick={() => onAction("resume", connector)}>Resume</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onAction("pause", connector)}>Pause</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onAction(connector.enabled ? "disable" : "enable", connector)}>
          {connector.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onAction("delete", connector)}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
