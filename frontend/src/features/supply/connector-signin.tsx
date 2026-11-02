import { Button } from "@/components/ui/button";
import type { BudgetNotices, SupplySignin } from "@/types/supply";
import { NoticeBar } from "./connector-card-parts";
import { forgetSupplySignin, startSupplySignin } from "./supply-api";
import { formatDateTime } from "./supply-format";
import { useConnectorSubmit } from "./use-connector-submit";

const STATE_TEXT: Record<SupplySignin["state"], string> = {
  none: "Not signed in",
  ok: "",
  expired: "Sign-in expired",
  refused: "Sign-in refused",
};

/** DigiKey change notices need a person's sign-in at DigiKey. Administrators start it and see who did it and until when. */
export function ConnectorSignin({ connectorId, status, notices }: { connectorId: string; status: SupplySignin | undefined; notices?: BudgetNotices | null }) {
  const { busy, error, run } = useConnectorSubmit();
  if (!status) return null;

  return (
    <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
      <p className="font-medium">Change notices</p>
      {notices ? <NoticeBar notices={notices} /> : null}
      <p className="text-muted-foreground">
        {status.signed_in
          ? `Signed in by ${status.granted_by}${status.expires_at ? ` until ${formatDateTime(status.expires_at)}` : ""}.`
          : STATE_TEXT[status.state]}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => void run(async () => { window.location.assign(await startSupplySignin(connectorId)); })}>
          {status.signed_in ? "Sign in again" : "Sign in at DigiKey"}
        </Button>
        {status.state !== "none" ? (
          <Button size="sm" variant="ghost" disabled={busy}
            onClick={() => void run(async () => { await forgetSupplySignin(connectorId); })}>
            Sign out
          </Button>
        ) : null}
      </div>
      {!status.signed_in ? (
        <p className="break-all text-muted-foreground">Callback {status.redirect_uri}</p>
      ) : null}
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    </div>
  );
}
