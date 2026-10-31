import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plug, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@/types/auth";
import { useBudget } from "./budget-view";
import { TrackingRoomSection } from "./tracking-room";
import { ConnectorCard, type ConnectorAction } from "./connector-card";
import { ConnectorCredentialsDialog } from "./connector-credentials-dialog";
import { CreateConnectorDialog } from "./create-connector-dialog";
import { CsvUploadDialog } from "./csv-upload-dialog";
import { EditConnectorDialog } from "./edit-connector-dialog";
import { PauseConnectorDialog } from "./pause-connector-dialog";
import { PushTokenDialog } from "./push-token-dialog";
import { clearSupplyCsv, deleteSupplyConnector, testSupplyConnector } from "./supply-api";
import { isQuickAction, useQuickConnectorActions } from "./use-connector-actions";
import { useConnectorSubmit } from "./use-connector-submit";
import { useSupplyConnectors } from "./use-supply-connectors";

const SettingsDialog = lazy(() => import("./settings-view").then((module) => ({ default: module.SettingsDialog })));

type Dialog = { kind: "create" } | { kind: Exclude<ConnectorAction, "resume" | "enable" | "disable" | "apply-reset" | "test">; id: string };


/** Distributor accounts, budgets and state, in Supply > Sources. Admins change them. `after` follows the distributors. */
export function SupplyConnectorsView({ user, headerSlot, after }: { user: User | null; headerSlot?: HTMLElement | null; after?: ReactNode }) {
  const isAdmin = user?.role === "admin";
  const { status, providers, connectors, error, apply, remove, reload, refresh } = useSupplyConnectors();
  const budgets = useBudget();
  const testing = useRef(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const quick = useQuickConnectorActions(apply);
  const deletion = useConnectorSubmit();
  const clearing = useConnectorSubmit();

  const target = dialog && dialog.kind !== "create" ? connectors.find((item) => item.id === dialog.id) ?? null : null;
  const fieldsFor = target ? providers.find((item) => item.key === target.provider)?.credential_fields ?? [] : [];
  const closeDialog = () => setDialog(null);

  // One real call to the provider. A second click while it runs would spend another.
  const runTest = async (connector: (typeof connectors)[number]) => {
    if (testing.current) return;
    testing.current = true;
    const pending = toast.loading(`Testing ${connector.display_name}`);
    try {
      const result = await testSupplyConnector(connector.id);
      const took = `${result.took_ms.toLocaleString()} ms`;
      if (result.ok) toast.success(`${connector.display_name} answered`, { id: pending, description: `${result.message} (${took})` });
      else toast.error(`${connector.display_name} failed`, { id: pending, description: result.message });
      await refresh();
    } catch (caught) {
      toast.error("The test could not run", { id: pending, description: caught instanceof Error ? caught.message : undefined });
    } finally {
      testing.current = false;
    }
  };

  const handleAction = (action: ConnectorAction, connector: (typeof connectors)[number]) => {
    if (action === "test") {
      void runTest(connector);
      return;
    }
    if (isQuickAction(action)) {
      void quick(action, connector);
      return;
    }
    setDialog({ kind: action, id: connector.id });
  };

  const confirmDelete = async () => {
    if (!target) return;
    const deleted = await deletion.run(async () => {
      await deleteSupplyConnector(target.id);
      remove(target.id);
      toast.success("Connector deleted");
    });
    if (deleted) closeDialog();
  };

  const confirmClear = async () => {
    if (!target) return;
    const cleared = await clearing.run(async () => {
      await clearSupplyCsv(target.id);
      apply({ ...target, csv_import: null });
      toast.success("Uploaded data removed");
    });
    if (cleared) closeDialog();
  };

  const canAdd = isAdmin && providers.length > 0;
  const actions = (
    <>
      <PermissionHint blocked={!isAdmin} action="add connectors" allowedRoles={["admin"]}>
        <Button disabled={!canAdd} onClick={() => setDialog({ kind: "create" })}>
          <Plus className="h-4 w-4" />Add connector
        </Button>
      </PermissionHint>
      <Button
        variant="outline" size="icon" aria-label="Supply settings" title="Supply settings"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </>
  );

  return (
    <div className="themed-scrollbar relative h-full overflow-y-auto p-6">
      <div className="space-y-5">
        {headerSlot === undefined ? <div className="flex justify-end gap-2">{actions}</div> : headerSlot ? createPortal(actions, headerSlot) : null}

        <TrackingRoomSection />
        {status === "loading" ? <ConnectorsSkeleton /> : null}
        {status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              {error}
              <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {status === "ready" && connectors.length === 0 ? <EmptyState noProviders={providers.length === 0} isAdmin={isAdmin} /> : null}
        {status === "ready" && connectors.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] gap-3">
            {connectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                budget={budgets.find((item) => item.connector_id === connector.id)}
                isAdmin={isAdmin}
                onAction={handleAction}
              />
            ))}
          </div>
        ) : null}
        {after}
      </div>

      <CreateConnectorDialog
        open={dialog?.kind === "create"}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        providers={providers}
        onCreated={(connector) => { apply(connector); toast.success("Connector added"); }}
      />
      <EditConnectorDialog
        connector={dialog?.kind === "edit" ? target : null}
        storefronts={target ? providers.find((item) => item.key === target.provider)?.storefronts ?? [] : []}
        onClose={closeDialog}
        onSaved={(connector) => { apply(connector); toast.success("Connector saved"); }}
      />
      <ConnectorCredentialsDialog
        connector={dialog?.kind === "credentials" ? target : null}
        fields={fieldsFor}
        onClose={closeDialog}
        onSaved={(connector) => { apply(connector); toast.success("Credentials replaced"); }}
      />
      <PauseConnectorDialog
        connector={dialog?.kind === "pause" ? target : null}
        onClose={closeDialog}
        onPaused={(connector) => { apply(connector); toast.success("Connector paused"); }}
      />
      <CsvUploadDialog
        connector={dialog?.kind === "csv-upload" ? target : null}
        onClose={closeDialog}
        onUploaded={(connector, result) => {
          const { ignored_columns: ignored, ...csvImport } = result;
          apply({ ...connector, csv_import: csvImport, last_ok_at: result.imported_at, last_error_code: "" });
          toast.success(`Imported ${result.row_count.toLocaleString()} rows`, {
            description: ignored.length > 0 ? `Ignored columns: ${ignored.join(", ")}` : undefined,
          });
        }}
      />
      <PushTokenDialog
        key={dialog?.kind === "push-token" ? dialog.id : "none"}
        target="connector"
        id={dialog?.kind === "push-token" && target ? target.id : null}
        name={target?.display_name ?? ""}
        onClose={closeDialog}
      />
      <ConfirmDialog
        open={dialog?.kind === "csv-clear" && target !== null}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title={`Remove data from ${target?.display_name ?? "connector"}`}
        description="The uploaded offers are deleted. Stock history already collected stays."
        confirmLabel="Remove"
        busy={clearing.busy}
        onConfirm={() => void confirmClear()}
      />
      {settingsOpen ? <Suspense fallback={null}><SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} user={user} /></Suspense> : null}
      <ConfirmDialog
        open={dialog?.kind === "delete" && target !== null}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title={`Delete ${target?.display_name ?? "connector"}`}
        description="Its credentials and call history are removed. Parts and stock history already collected stay."
        confirmLabel="Delete"
        busy={deletion.busy}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function ConnectorsSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] gap-3" aria-label="Loading connectors">
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

function EmptyState({ noProviders, isAdmin }: { noProviders: boolean; isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed p-10 text-center">
      <Plug className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">No connectors yet</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {noProviders
          ? "No distributor providers are installed on this server."
          : isAdmin
            ? "Add a distributor to start collecting stock and price data."
            : "An administrator can add a distributor connector."}
      </p>
    </div>
  );
}
