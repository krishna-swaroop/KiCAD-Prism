import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface WorkspaceRefreshNoticeProps {
  /** Why the latest refresh failed; the notice renders nothing when null. */
  refreshError: string | null;
  refresh: () => Promise<void>;
}

/**
 * Tells the reviewer that what they see is the last good load, not the
 * current state, and offers to try again. The data stays on screen: a
 * failed background refresh must not take a working project list away.
 */
export function WorkspaceRefreshNotice({ refreshError, refresh }: WorkspaceRefreshNoticeProps) {
  const [retrying, setRetrying] = useState(false);
  if (!refreshError) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Could not refresh the workspace: {refreshError}. Showing the last loaded data.
      </span>
      <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => void retry()} disabled={retrying}>
        <RefreshCw className={retrying ? "mr-1 h-3 w-3 animate-spin" : "mr-1 h-3 w-3"} aria-hidden />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
