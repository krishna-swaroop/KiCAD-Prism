import { useCallback } from "react";

import type { SupplyReviewQueue } from "@/types/supply";
import { getSupplyReviewQueue } from "./supply-api";
import { useLoaded } from "./use-loaded";

/** The sum of the counters on the Review page's sections that need a decision. "Several listings at a distributor" is a choice that
 * saves calls, not a task, so it is not in the total (its section still shows its own count). */
export function reviewCountOf(review: SupplyReviewQueue): number {
  const approve = review.to_approve
    ? review.to_approve.waivers.length + (review.to_approve.alternates?.length ?? 0) + (review.to_approve.dismissals?.length ?? 0)
      + (review.to_approve.mutes?.length ?? 0)
    : 0;
  const pinned = (review.other_numbers ?? []).length;
  const matched = review.matched ? review.matched.aliases.length + review.matched.parts.length : 0;
  return review.counts.unresolved + review.counts.near + review.counts.aliases + (review.choices?.length ?? 0) + approve + pinned + matched;
}

/** How many items wait on the Review page; undefined until known. The same read as the page, so a decision there counts here. */
export function useReviewCount(allowed: boolean): number | undefined {
  const fetcher = useCallback((signal: AbortSignal) => getSupplyReviewQueue(signal), []);
  const { data } = useLoaded<SupplyReviewQueue>(allowed ? "review" : null, fetcher, "Could not load the review queue");
  return data ? reviewCountOf(data) : undefined;
}
