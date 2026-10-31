import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

/** Asks for the next page when it scrolls into view. After a failed page it asks only when Retry is pressed. Renders
 * nothing once there is no more. */
export function LoadMore({ hasMore, loading, failed = false, onLoad }: { hasMore: boolean; loading: boolean; failed?: boolean; onLoad: () => void }) {
  const spot = useRef<HTMLDivElement | null>(null);
  const ask = useRef(onLoad);
  useEffect(() => { ask.current = onLoad; });
  useEffect(() => {
    const node = spot.current;
    if (!node || !hasMore || loading || failed || typeof IntersectionObserver === "undefined") return undefined;
    const watcher = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) ask.current(); }, { rootMargin: "200px" });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [hasMore, loading, failed]);
  if (!hasMore) return null;
  return (
    <div ref={spot} className="flex h-10 items-center justify-center gap-2 text-xs text-muted-foreground" role="status" aria-label="Loading more parts">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : failed ? (
        <>
          <span className="text-destructive">Could not load more parts</span>
          <Button size="sm" variant="outline" onClick={onLoad}><RotateCcw className="h-3.5 w-3.5" />Retry</Button>
        </>
      ) : null}
    </div>
  );
}
