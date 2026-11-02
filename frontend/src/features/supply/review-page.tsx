import { useCallback } from "react";

import { canFollowSupply, canReviewSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import { listInventorySources } from "./inventory-api";
import { listWorkItems } from "./work-items-api";
import { useReviewCount } from "./review-count";
import { ReviewView } from "./review-view";
import { UnmatchedStockSection } from "./unmatched-stock";
import { useWorkItems, WorkItemsSection } from "./work-items-section";
import { useLoaded } from "./use-loaded";

/** Unmatched parts across every local inventory source; undefined until known. */
function useUnmatchedCount(allowed: boolean): number | undefined {
  const fetcher = useCallback((signal: AbortSignal) => listInventorySources(signal), []);
  const { data } = useLoaded(allowed ? "inventory/sources" : null, fetcher, "Could not load inventory sources");
  return data?.reduce((sum, source) => sum + source.unmatched, 0);
}

/** What waits on Supply > Review: the supply queue, the open work items and the unmatched local stock. */
export function useReviewWaiting(allowed: boolean): number | undefined {
  const queue = useReviewCount(allowed);
  const unmatched = useUnmatchedCount(allowed);
  const fetcher = useCallback((signal: AbortSignal) => listWorkItems("live", signal), []);
  const work = useLoaded(allowed ? "work-items/list/live" : null, fetcher, "Could not load the work items").data?.length;
  return queue === undefined && unmatched === undefined && work === undefined ? undefined : (queue ?? 0) + (unmatched ?? 0) + (work ?? 0);
}

/** Supply > Review: matching questions, then work items and the unmatched local stock. */
export function ReviewPage({ user }: { user: User | null }) {
  const unmatched = useUnmatchedCount(true);
  const live = useWorkItems("live");
  return (
    <ReviewView
      user={user}
      // Only a read that worked and found none lets the page say nothing waits.
      othersWaiting={unmatched === undefined || unmatched > 0 || live.status !== "ready" || (live.data?.length ?? 0) > 0}
      after={(
        <>
          <WorkItemsSection email={user?.email ?? ""} canFollow={canFollowSupply(user?.role)} canDecide={canReviewSupply(user?.role)} />
          <UnmatchedStockSection canDecide={canReviewSupply(user?.role)} />
        </>
      )}
    />
  );
}
