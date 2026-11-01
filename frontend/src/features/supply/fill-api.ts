import { fetchJson } from "@/lib/api";
import type { FillCandidate, FillDetails, FillSearchResult } from "@/types/supply";

// Kept apart from supply-api so the catalog edit dialog does not pull in the whole supply client.

function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  return fetchJson<T>(url, { method: "POST", body: JSON.stringify(body) }, fallback);
}

/** Ask the connected distributors for a part number. Spends the interactive reserve. */
export function searchFillCandidates(mpn: string, manufacturer: string): Promise<FillSearchResult> {
  return post("/api/supply/fill/search", { mpn, manufacturer }, "Could not look the part up");
}

export function getFillDetails(candidate: FillCandidate): Promise<FillDetails> {
  const { connector_id, sku, mpn, manufacturer } = candidate;
  return post("/api/supply/fill/details", { connector_id, sku, mpn, manufacturer }, "Could not read the part data");
}
