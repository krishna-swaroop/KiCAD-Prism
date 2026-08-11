import {
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  Maximize2,
  PackageCheck,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CatalogComponent, CatalogValidationStatus, WorkflowStage } from "@/types/catalog";
import { LibraryPreviewInspector } from "./library-preview-inspector";

const WORKFLOW_LABELS: Record<WorkflowStage, string> = {
  open: "Open",
  in_progress: "In progress",
  qa_review: "QA review",
  done: "Approved",
  released: "Released",
  archived: "Archived",
};

const VALIDATION_LABELS: Record<CatalogValidationStatus, string> = {
  passed: "Passed",
  warning: "Warnings",
  failed: "Failed",
  skipped: "Skipped",
  not_run: "Not run",
};

function DefinitionRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-b py-2.5 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words text-right font-medium">{value || "—"}</span>
    </div>
  );
}

export function LibraryComponentQuickView({
  component,
  loading,
  error,
  onClose,
  onOpenWorkspace,
  onRetry,
}: {
  component: CatalogComponent | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpenWorkspace: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l bg-card" aria-label="Component quick view">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{component?.name || "Component"}</h3>
          <p className="truncate text-xs text-muted-foreground">{component?.mpn || component?.value || "Loading component details…"}</p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close component quick view" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {loading && !component ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading quick view…</div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <CircleAlert className="h-6 w-6 text-destructive" />
          <div><p className="text-sm font-medium">Could not load component</p><p className="mt-1 text-xs text-muted-foreground">{error}</p></div>
          <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      ) : component ? (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-4">
              <section aria-labelledby="quick-parametrics">
                <h4 id="quick-parametrics" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadata</h4>
                <DefinitionRow label="Value" value={component.value} />
                <DefinitionRow label="Category" value={component.category} />
                <DefinitionRow label="Description" value={component.description} />
                <DefinitionRow label="Manufacturer" value={component.manufacturer} />
                <DefinitionRow label="Manufacturer Part Number" value={component.mpn} />
                <DefinitionRow label="Datasheet" value={component.datasheet_url ? <a className="inline-flex items-center justify-end gap-1 text-primary hover:underline" href={component.datasheet_url} target="_blank" rel="noreferrer">Open datasheet <ExternalLink className="h-3 w-3" /></a> : ""} />
              </section>

              <section aria-label="Component previews" className="space-y-3 border-t pt-5">
                <div><p className="mb-1.5 text-xs font-medium">Symbol</p><LibraryPreviewInspector previews={component.previews} kind="symbol" label={component.name} compact /></div>
                <div><p className="mb-1.5 text-xs font-medium">Footprint</p><LibraryPreviewInspector previews={component.previews} kind="footprint" label={component.name} compact /></div>
              </section>

              <section aria-labelledby="quick-readiness" className="border-t pt-5">
                <h4 id="quick-readiness" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lifecycle & readiness</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={component.workflow_stage === "released" ? "success" : "secondary"}><PackageCheck className="h-3 w-3" /> {WORKFLOW_LABELS[component.workflow_stage]}</Badge>
                  <Badge variant={component.validation.status === "failed" ? "destructive" : component.validation.status === "warning" ? "warning" : component.validation.status === "passed" ? "success" : "outline"}><ShieldCheck className="h-3 w-3" /> {VALIDATION_LABELS[component.validation.status]}</Badge>
                </div>
                <div className="mt-3 border p-3 text-xs">
                  <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Revision</span><span className="font-medium">v{component.revision}</span></div>
                  <div className="mt-2 flex items-center justify-between gap-3"><span className="text-muted-foreground">CAD state</span><span className="font-medium">{component.availability_state === "place_ready" ? "CAD complete" : component.availability_state.replace(/_/g, " ")}</span></div>
                  <div className="mt-2 flex items-center justify-between gap-3"><span className="text-muted-foreground">Validation</span><span className={cn("font-medium", component.validation.error_count > 0 && "text-destructive")}>{component.validation.error_count} errors · {component.validation.warning_count} warnings</span></div>
                </div>
              </section>

            </div>
          </ScrollArea>
          <div className="shrink-0 border-t p-3">
            <Button className="w-full justify-between" onClick={onOpenWorkspace}><span className="inline-flex items-center gap-2"><Maximize2 className="h-4 w-4" /> Open Full Workspace</span><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
