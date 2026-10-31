import { useCallback, useState } from "react";

import { useServerState } from "@/lib/server-state";
import type { JobProgress } from "@/types/supply";
import { SUPPLY_ROOT } from "./supply-writes";

export { invalidateSupply } from "./supply-writes";

/**
 * Supply's reads, on the app's server state (`@/lib/server-state`): a key names one resource (`connectors`,
 * `parts/<id>/notices`), so every screen showing it shares one answer and one request in flight, and a return to a
 * page starts from what it showed while it reads again. A write goes through `changesSupply` (`supply-writes.ts`),
 * which reads again every supply resource on screen.
 */

export interface Loaded<T> {
  status: "loading" | "ready" | "error";
  data: T | null;
  error: string;
}

/**
 * The resource named `key` (segments split on "/"), read with `fetcher`; null reads nothing. `refresh` reads again
 * keeping what is on screen; `retry` is the same, for after an error. `refreshEvery` (ms) reads again while mounted,
 * and with `refreshWhile` only while it holds for the data on screen; null or 0 stops it. `onData` and `onError` hear
 * each answer, for a screen that acts when a job ends.
 */
export function useLoaded<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  fallback: string,
  { refreshEvery = null, refreshWhile, onData, onError }: {
    refreshEvery?: number | null;
    refreshWhile?: (data: T) => boolean;
    onData?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {},
) {
  // Whether the data on screen asks for another read; kept in state because the read's options depend on its own data.
  const [wanted, setWanted] = useState(!refreshWhile);
  const read = useServerState<T>(key === null ? null : [SUPPLY_ROOT, ...key.split("/")], fetcher, {
    pollMs: refreshEvery && wanted ? refreshEvery : undefined, onData, onError,
  });
  const stillWanted = !refreshWhile || (read.data !== undefined && refreshWhile(read.data));
  if (stillWanted !== wanted) setWanted(stillWanted);
  const { refresh } = read;
  const retry = useCallback(() => void refresh(), [refresh]);
  const status: Loaded<T>["status"] = read.data !== undefined ? "ready" : read.error && !read.fetching ? "error" : "loading";
  const error = read.error ? read.error.message || fallback : "";
  return { status, data: read.data ?? null, error, retry, refresh };
}

/** For `refreshWhile`: a job still running. */
export const isRunning = (progress: JobProgress) => progress.state === "running";
