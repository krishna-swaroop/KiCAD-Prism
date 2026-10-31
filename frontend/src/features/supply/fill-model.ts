import type { FillCandidate, FillDetails } from "@/types/supply";

/** Catalog field keys a distributor can fill. */
export const FILL_FIELDS = [
  { key: "manufacturer", label: "Manufacturer" },
  { key: "mpn", label: "Part number" },
  { key: "description", label: "Description" },
  { key: "datasheet_url", label: "Datasheet" },
  { key: "vendor", label: "Vendor" },
  { key: "vendor_part_number", label: "Vendor part number" },
] as const;

export interface FillChange {
  key: string;
  label: string;
  current: string;
  suggested: string;
  /** Whether the field has no value yet; those are filled by default, the rest only when chosen. */
  empty: boolean;
}

/** What the picked candidate would change in the form. Fields that already match, or that the distributor left blank, are left out. */
export function fillChanges(
  candidate: FillCandidate,
  details: FillDetails,
  current: Record<string, string>,
): FillChange[] {
  const suggestions: Record<string, string> = {
    manufacturer: candidate.manufacturer,
    mpn: candidate.mpn,
    description: details.description || candidate.description,
    datasheet_url: details.datasheet_url,
    vendor: candidate.connector,
    vendor_part_number: candidate.sku,
  };
  const changes: FillChange[] = [];
  for (const { key, label } of FILL_FIELDS) {
    if (!(key in current)) continue;
    const suggested = (suggestions[key] ?? "").trim();
    const now = (current[key] ?? "").trim();
    if (!suggested || suggested === now) continue;
    changes.push({ key, label, current: now, suggested, empty: now === "" });
  }
  return changes;
}

/** The changes chosen by default: only fields that are empty. */
export function defaultChosen(changes: FillChange[]): Set<string> {
  const keys = new Set<string>();
  for (const change of changes) if (change.empty) keys.add(change.key);
  return keys;
}

export function searchSummary(skipped: Array<{ connector: string; reason: string }>): string {
  if (skipped.length === 0) return "";
  return `Not asked or no match: ${skipped.map((item) => `${item.connector} (${item.reason})`).join(", ")}.`;
}
