import { fetchJson } from "@/lib/api";

/** How a placement was found: the placed symbol's stamp, or inferred for parts placed before it. */
export type PlacementBasis = "stamp" | "inferred_metadata" | "identity";

export type PlacementStatus =
  | "current"
  | "update_available"
  | "retired"
  | "unreleased"
  | "unknown_revision"
  | "unknown_component";

export interface LibraryPlacement {
  componentId: string;
  revisionId: string;
  basis: PlacementBasis;
  status: PlacementStatus;
  references: string[];
  recordedVersion: number | null;
  latestRevisionId: string;
  latestVersion: number | null;
  mixedRevisions: boolean;
  name: string;
  manufacturer: string;
  mpn: string;
}

export interface LibraryUsageScan {
  status: string;
  scannedAt: string;
  symbolCount: number;
  stampedCount: number;
  inferredCount: number;
  untrackedCount: number;
  error: string;
}

/** `GET /api/projects/{id}/catalog-usage`: what a commit placed, against the catalog now. */
export interface LibraryUsageReport {
  commit: string;
  scan: LibraryUsageScan | null;
  summary: Record<PlacementStatus, number>;
  items: LibraryPlacement[];
  latestScannedCommit: string;
}

export const libraryUsageKey = (projectId: string, commit: string | null) =>
  ["project", projectId, "library-usage", commit] as const;

export function getLibraryUsage(projectId: string, commit: string | null, signal?: AbortSignal) {
  const query = commit ? `?commit=${encodeURIComponent(commit)}` : "";
  return fetchJson<LibraryUsageReport>(
    `/api/projects/${encodeURIComponent(projectId)}/catalog-usage${query}`,
    { signal },
    "Could not load library usage",
  );
}

export function scanLibraryUsage(projectId: string, commit: string | null) {
  return fetchJson<{ job_id: string; status: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/catalog-usage/scan`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commit, force: true }),
    },
    "Could not scan library usage",
  );
}

const STATUS_ORDER: PlacementStatus[] = [
  "update_available",
  "retired",
  "unreleased",
  "unknown_revision",
  "unknown_component",
  "current",
];

/** Rows that need attention first, then by name. */
export function sortPlacements(items: LibraryPlacement[]): LibraryPlacement[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      (a.name || a.componentId).localeCompare(b.name || b.componentId),
  );
}

/** `v2 → v3`, `v2`, or `?` when the placed revision is unknown. */
export function versionLabel(item: LibraryPlacement): string {
  const placed = item.recordedVersion == null ? "?" : `v${item.recordedVersion}`;
  if (item.status === "update_available" && item.latestVersion != null) return `${placed} → v${item.latestVersion}`;
  return placed;
}

/** `R1, R2, R3 +4`. */
export function referencesLabel(references: string[], shown = 3): string {
  const head = references.slice(0, shown).join(", ");
  return references.length > shown ? `${head} +${references.length - shown}` : head;
}
