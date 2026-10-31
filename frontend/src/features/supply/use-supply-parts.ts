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
  base: SupplyPartsPage | null;
  items: SupplyPartRow[];
  next: number | null;
  /** The last next-page read failed: nothing is read again until `loadMore` is called (Retry). */
  failed: boolean;
}

/** Parts a page at a time: the first page, then more as `loadMore` is called. A refresh starts again from the first page. */
export function useSupplyPartsFeed(scope: PartsScope, query: string, only: PartsFilter = "", projectId = "", vendor = "", sort = "") {
  const first = useSupplyPartsList(scope, query, only, FEED_PAGE, projectId, vendor, sort);
  const [more, setMore] = useState<MorePages>({ base: null, items: [], next: null, failed: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const reading = useRef<AbortController | null>(null);
  const base = first.data;
  // Pages loaded after a first page that has since been replaced belong to something else, and so does a read in flight.
  const extra = useMemo<MorePages>(() => (more.base === base ? more : { base, items: [], next: base?.next_offset ?? null, failed: false }), [more, base]);
  useEffect(() => () => reading.current?.abort(), [base]);
  const loadMore = useCallback(async () => {
    if (!base || extra.next === null || loadingMore) return;
    const controller = new AbortController();
    reading.current = controller;
    setLoadingMore(true);
    try {
      const page = await (sort ? listSupplyParts(scope, query, controller.signal, only, extra.next, FEED_PAGE, projectId, vendor, sort) : listSupplyParts(scope, query, controller.signal, only, extra.next, FEED_PAGE, projectId, vendor));
      if (!controller.signal.aborted) setMore({ base, items: [...extra.items, ...page.items], next: page.next_offset ?? null, failed: false });
    } catch {
      // The rows already loaded stay; the page is read again only when asked (a Retry), not each time the end is in view.
      if (!controller.signal.aborted) setMore({ ...extra, failed: true });
    } finally {
      if (reading.current === controller) reading.current = null;
      // A read replaced by a newer one (another first page) leaves the flag to that one.
      setLoadingMore(reading.current !== null);
    }
  }, [base, extra, loadingMore, scope, query, only, projectId, vendor, sort]);
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
