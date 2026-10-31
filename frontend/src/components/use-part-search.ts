import { useEffect, useState } from "react";

import { fetchJson } from "@/lib/api";

/** One row for a part, found in the library, in supply, or both. */
export interface PartSearchRow {
  key: string;
  label: string;
  manufacturer: string;
  library: { component_id: string; name: string; stage: string } | null;
  supply: { part_id: string; status?: string; stock?: number | null; lifecycle?: string; tracked?: boolean } | null;
}

/** Shortest query worth sending. "R" would match everything. */
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 180;
const LIMIT = 8;

/**
 * Parts matching the query, library components and supply parts merged on the server so a part is found once.
 * Requests are debounced and superseded, so typing a part number issues one search. A failure, like an aborted
 * request, leaves the palette working without part results.
 */
export function usePartSearch(open: boolean, enabled: boolean, query: string): { rows: PartSearchRow[]; searching: boolean } {
  const [rows, setRows] = useState<PartSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const trimmed = query.trim();
  const active = open && enabled && trimmed.length >= MIN_LENGTH;

  useEffect(() => {
    if (!active) {
      setRows([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed, limit: String(LIMIT) });
      void fetchJson<{ items: PartSearchRow[] }>(`/api/search/parts?${params.toString()}`, { signal: controller.signal })
        .then((response) => {
          setRows(response.items ?? []);
          setSearching(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setRows([]);
            setSearching(false);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed]);

  return { rows, searching };
}
