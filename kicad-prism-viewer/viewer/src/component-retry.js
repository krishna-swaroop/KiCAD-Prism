// Component-tier retry policy (IS-14): a components GLB that fails to load is
// retried a bounded number of times with exponential backoff, then stays failed
// for this board/session. Without the cap the tier check refetched it every
// 250 ms.
export const COMPONENT_MAX_FAILURES = 3;
export const COMPONENT_RETRY_BASE_MS = 2000;
export const COMPONENT_RETRY_FACTOR = 4;

export function componentRetryDelayMs(failures) {
  const count = Math.max(1, Math.floor(Number(failures) || 0));
  return COMPONENT_RETRY_BASE_MS * COMPONENT_RETRY_FACTOR ** (count - 1);
}

/** Record one load failure and the earliest time its retry is allowed. */
export function noteComponentFailure(failures, now) {
  const next = Math.max(0, Math.floor(Number(failures) || 0)) + 1;
  return {
    failures: next,
    retryAt: Number(now) + componentRetryDelayMs(next),
  };
}

/** A failed tier becomes eligible again only below the cap, once its backoff elapsed. */
export function componentRetryDue(now, failures, retryAt) {
  const count = Math.max(0, Math.floor(Number(failures) || 0));
  return count < COMPONENT_MAX_FAILURES && Number(now) >= Number(retryAt);
}
