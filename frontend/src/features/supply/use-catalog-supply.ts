import { useCallback } from "react";

import { canOpenSupply } from "@/lib/roles";
import type { UserRole } from "@/types/auth";
import type { SupplyComponentStanding } from "@/types/supply";
import { getComponentsStatus } from "./catalog-supply-api";
import { useLoaded } from "./use-loaded";

interface CatalogRow {
  id: string;
  manufacturer: string;
  mpn: string;
}

const EMPTY: Record<string, SupplyComponentStanding> = {};

/**
 * Where each catalog component on screen stands at the distributors. Components Prism does not track are absent; roles without
 * supply access ask nothing. `refresh` asks again, after a watch.
 */
export function useCatalogSupply(
  rows: readonly CatalogRow[],
  role: UserRole | null | undefined,
): { standing: Record<string, SupplyComponentStanding>; refresh: () => Promise<void> } {
  const wanted = canOpenSupply(role) ? rows.filter((row) => row.mpn && row.manufacturer) : [];
  // Each row's id, maker and number: an edit of the maker or number in place is a new key, so it is asked again.
  const key = wanted.length ? JSON.stringify(wanted.map(({ id, manufacturer, mpn }) => [id, manufacturer, mpn])) : null;
  const fetcher = useCallback(
    (signal: AbortSignal) => getComponentsStatus(wanted.map(({ id, manufacturer, mpn }) => ({ id, manufacturer, mpn })), signal),
    // The key names everything the request sends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const loaded = useLoaded<Record<string, SupplyComponentStanding>>(key === null ? null : `catalog/standing/${key}`, fetcher, "Could not load supply status");
  return { standing: loaded.data ?? EMPTY, refresh: loaded.refresh };
}
