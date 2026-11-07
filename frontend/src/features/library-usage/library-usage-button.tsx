import { useState } from "react";
import { Library, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DesignDataFailed, DesignDataPending } from "@/components/design-data-state";
import { DesignDataFailedError, DesignDataPendingError } from "@/lib/api";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { useServerState } from "@/lib/server-state";
import { cn } from "@/lib/utils";

import {
  getLibraryUsage,
  libraryUsageKey,
  referencesLabel,
  scanLibraryUsage,
  sortPlacements,
  versionLabel,
  type PlacementStatus,
} from "./library-usage-api";

const STATUS_BADGE: Record<PlacementStatus, { label: string; variant: "warning" | "destructive" | "outline" | "secondary" }> = {
  update_available: { label: "update", variant: "warning" },
  retired: { label: "retired", variant: "destructive" },
  unreleased: { label: "unreleased", variant: "secondary" },
  unknown_revision: { label: "revision ?", variant: "secondary" },
  unknown_component: { label: "not in catalog", variant: "secondary" },
  current: { label: "current", variant: "outline" },
};

/**
 * Issue #698: the catalog revisions the checkout's schematics placed, and which have a newer
 * release. Hidden until the checkout's commit has been scanned (after each sync).
 */
export function LibraryUsageButton({ projectId, canScan }: { projectId: string; canScan: boolean }) {
  const [scanning, setScanning] = useState(false);
  const usage = useServerState(libraryUsageKey(projectId, null), (signal) => getLibraryUsage(projectId, null, signal), {
    keepPrevious: true,
  });
  const report = usage.data;
  const designDataPending = usage.error instanceof DesignDataPendingError;
  const designDataFailed = usage.error instanceof DesignDataFailedError;

  if (designDataPending || (usage.loading && !report)) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5" title="Library parts">
        <Library className="h-4 w-4 text-muted-foreground" />
        <DesignDataPending
          label="Preparing design data…"
          className="text-xs"
          onRetry={designDataPending ? () => void usage.refresh() : undefined}
        />
      </div>
    );
  }

  if (designDataFailed) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-2" title="Library parts">
            <Library className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-4">
          <DesignDataFailed detail={usage.error?.message} onRetry={() => void usage.refresh()} />
        </PopoverContent>
      </Popover>
    );
  }

  if (!report?.scan || !report.items.length) return null;
  const updates = report.summary.update_available + report.summary.retired;

  const rescan = async () => {
    setScanning(true);
    try {
      const queued = await scanLibraryUsage(projectId, report.commit);
      throwIfJobFailed(await watchPrismJob(queued.job_id), "Library scan failed");
      await usage.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Library scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2" title="Library parts">
          <Library className="h-4 w-4" />
          {updates > 0 ? <Badge variant="warning">{updates}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[34rem] max-w-[90vw] p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Library parts</span>
          <span className="truncate" title={report.commit}>{report.commit.slice(0, 8)}</span>
          <span className="ml-auto whitespace-nowrap">
            {report.scan.stampedCount} stamped · {report.scan.inferredCount} inferred · {report.scan.untrackedCount} untracked
          </span>
          {canScan ? (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={rescan} disabled={scanning} title="Scan again">
              <RefreshCw className={cn("h-3 w-3", scanning && "animate-spin")} />
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full table-fixed text-xs">
            <tbody>
              {sortPlacements(report.items).map((item) => {
                const badge = STATUS_BADGE[item.status];
                return (
                  <tr key={`${item.componentId}:${item.revisionId}:${item.basis}`} className="border-b last:border-0">
                    <td className="w-[40%] truncate px-3 py-1.5" title={[item.name, item.mpn].filter(Boolean).join(" · ") || item.componentId}>
                      {item.name || item.componentId}
                    </td>
                    <td className="w-[25%] truncate px-2 py-1.5 text-muted-foreground" title={item.references.join(", ")}>
                      {referencesLabel(item.references)}
                    </td>
                    <td className="w-[15%] whitespace-nowrap px-2 py-1.5 tabular-nums" title={item.basis}>
                      {versionLabel(item)}
                      {item.basis === "stamp" ? "" : "*"}
                    </td>
                    <td className="w-[20%] px-3 py-1.5 text-right">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PopoverContent>
    </Popover>
  );
}
