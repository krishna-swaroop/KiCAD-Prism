import type { SupplyReviewQueue } from "@/types/supply";
import { getSupplyReviewQueue } from "./supply-api";
import { useLoaded } from "./use-loaded";

const fetcher = (signal: AbortSignal) => getSupplyReviewQueue(signal);

/**
 * The review queue. `refresh` reloads without the loading state, so a decision
 * does not blank the list; the server is the source of truth for what remains.
 */
export function useSupplyReview() {
  const { data, ...rest } = useLoaded<SupplyReviewQueue>("review", fetcher, "Could not load the review queue");
  return { ...rest, queue: data };
}
