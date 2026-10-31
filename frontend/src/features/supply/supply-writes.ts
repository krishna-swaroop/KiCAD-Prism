import { invalidateServerState } from "@/lib/server-state";

/** Supply's reads live under this root of the app's server state. */
export const SUPPLY_ROOT = "supply";

/** Read again every supply resource on screen whose key starts with one of `prefixes` ("" for all of them). */
export function invalidateSupply(...prefixes: string[]): Promise<void> {
  return Promise.all(prefixes.map((prefix) => invalidateServerState(prefix ? [SUPPLY_ROOT, ...prefix.split("/")] : [SUPPLY_ROOT]))).then(() => undefined);
}

/**
 * A write to supply data. Once it succeeds, every supply resource on screen is read again: a change to a part can move
 * its list, its project, the Dashboard and the Review page, and the server is the one that knows which.
 */
export function changesSupply<A extends unknown[], R>(write: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const result = await write(...args);
    void invalidateSupply("");
    return result;
  };
}
