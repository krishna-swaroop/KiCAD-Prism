import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  PartsFilter,
  PartsScope,
  SupplyAlert,
  SupplyManufacturer,
  SupplyPartDetail,
  SupplyPartGroups,
  SupplyPartRow,
  SupplyPartsPage,
} from "@/types/supply";
import {
  findSupplyPart,
  getSupplyPart,
  listSupplyAlerts,
  listSupplyManufacturers,
  listSupplyPartGroups,
  listSupplyParts,
} from "./supply-api";
import { useLoaded } from "./use-loaded";

export function useSupplyPartsList(scope: PartsScope, query: string, only: PartsFilter = "", limit = 0, projectId = "", vendor = "", sort = "") {
  const fetcher = useCallback((signal: AbortSignal) => sort ? listSupplyParts(scope, query, signal, only, 0, limit, projectId, vendor, sort) : listSupplyParts(scope, query, signal, only, 0, limit, projectId, vendor), [scope, query, only, limit, projectId, vendor, sort]);
  return useLoaded<SupplyPartsPage>(`parts/list/${scope}|${query}|${only}|${projectId}|${limit}|${vendor}|${sort}`, fetcher, "Could not load parts");
}

const FEED_PAGE = 50;

interface MorePages {
  /** The list the pages belong to (its scope, search, filter and sort) and the first page they follow. */
  list: string;
  base: SupplyPartsPage | null;
  items: SupplyPartRow[];
  next: number | null;
  /** The last next-page read failed: nothing is read again until `loadMore` is called (Retry). */
  failed: boolean;
}

/**
 * Parts a page at a time: the first page, then more as `loadMore` is called. Another list (scope, search, filter, sort)
 * starts again from the first page; the same list read again (after a write) reads again the pages already loaded, so the
 * rows and the place in them stay.
 */
export function useSupplyPartsFeed(scope: PartsScope, query: string, only: PartsFilter = "", projectId = "", vendor = "", sort = "") {
  const first = useSupplyPartsList(scope, query, only, FEED_PAGE, projectId, vendor, sort);
  const list = `${scope}|${query}|${only}|${projectId}|${vendor}|${sort}`;
  const [more, setMore] = useState<MorePages>({ list, base: null, items: [], next: null, failed: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const reading = useRef<AbortController | null>(null);
  const base = first.data;
  const page = useCallback(
    (offset: number, limit: number, signal: AbortSignal) =>
      sort ? listSupplyParts(scope, query, signal, only, offset, limit, projectId, vendor, sort) : listSupplyParts(scope, query, signal, only, offset, limit, projectId, vendor),
    [scope, query, only, projectId, vendor, sort],
  );
  // Pages of another list belong to something else. Pages of this list after an earlier first page are still shown while
  // they are read again (below).
  const extra = useMemo<MorePages>(
    () => (more.list === list && (more.base === base || more.items.length > 0) ? more : { list, base, items: [], next: base?.next_offset ?? null, failed: false }),
    [more, list, base],
  );
  useEffect(() => () => reading.current?.abort(), [list]);
  // The first page was read again for the same list: read again the rows loaded after it, in pages, and swap them in.
  useEffect(() => {
    if (!base || extra.base === base || extra.items.length === 0) return undefined;
    const controller = new AbortController();
    reading.current?.abort();
    reading.current = controller;
    const wanted = extra.items.length;
    void (async () => {
      const items: SupplyPartRow[] = [];
      let next: number | null = base.next_offset ?? null;
      while (next !== null && items.length < wanted) {
        const answer = await page(next, FEED_PAGE, controller.signal);
        items.push(...answer.items);
        next = answer.next_offset ?? null;
      }
      return { items, next };
    })().then(
      ({ items, next }) => { if (!controller.signal.aborted) setMore({ list, base, items, next, failed: false }); },
      // The rows stay as they were; the next write or Retry reads them again.
      () => { if (!controller.signal.aborted) setMore({ ...extra, base }); },
    );
    return () => controller.abort();
  }, [base, extra, list, page]);
  const loadMore = useCallback(async () => {
    if (!base || extra.next === null || loadingMore) return;
    const controller = new AbortController();
    reading.current = controller;
    setLoadingMore(true);
    try {
      const answer = await page(extra.next, FEED_PAGE, controller.signal);
      if (!controller.signal.aborted) setMore({ list, base, items: [...extra.items, ...answer.items], next: answer.next_offset ?? null, failed: false });
    } catch {
      // The rows already loaded stay; the page is read again only when asked (a Retry), not each time the end is in view.
      if (!controller.signal.aborted) setMore({ ...extra, failed: true });
    } finally {
      if (reading.current === controller) reading.current = null;
      // A read replaced by a newer one (another first page) leaves the flag to that one.
      setLoadingMore(reading.current !== null);
    }
  }, [base, extra, list, loadingMore, page]);
  const items = base ? [...base.items, ...extra.items] : [];
  return {
    ...first, items, forecastState: base?.forecast_state, total: base?.total ?? 0,
    hasMore: extra.next !== null, loadingMore, moreFailed: extra.failed, loadMore,
  };
}

/** The manufacturers Prism knows, for suggestions. A failure just means no suggestions. */
export function useSupplyManufacturers(): SupplyManufacturer[] {
  const fetcher = useCallback(async (signal: AbortSignal) => (await listSupplyManufacturers(signal)).items, []);
  const { data } = useLoaded<SupplyManufacturer[]>("manufacturers", fetcher, "Could not load manufacturers");
  return data ?? [];
}

export function useSupplyPart(partId: string | null) {
  const fetcher = useCallback((signal: AbortSignal) => getSupplyPart(partId ?? "", signal), [partId]);
  return useLoaded<SupplyPartDetail>(partId === null ? null : `parts/${partId}`, fetcher, "Could not load the part");
}

export function useSupplyAlerts(includeResolved: boolean) {
  const fetcher = useCallback(
    async (signal: AbortSignal) => (await listSupplyAlerts(includeResolved, signal)).items,
    [includeResolved],
  );
  return useLoaded<SupplyAlert[]>(includeResolved ? "alerts/resolved" : "alerts/active", fetcher, "Could not load alerts");
}

/** The part Prism tracks for a catalog component's manufacturer and number; null data when none. */
export function useSupplyPartFor(manufacturer: string, mpn: string) {
  const fetcher = useCallback((signal: AbortSignal) => findSupplyPart(manufacturer, mpn, signal), [manufacturer, mpn]);
  return useLoaded<string | null>(`parts/by-number/${manufacturer}|${mpn}`, fetcher, "Could not look the part up");
}

/** The matching parts grouped by the projects that use them. */
export function useSupplyPartGroups(scope: PartsScope, query: string, only: PartsFilter = "", vendor = "") {
  const fetcher = useCallback((signal: AbortSignal) => listSupplyPartGroups(scope, query, signal, only, vendor), [scope, query, only, vendor]);
  return useLoaded<SupplyPartGroups>(`parts/groups/${scope}|${query}|${only}|${vendor}`, fetcher, "Could not load the parts");
}
