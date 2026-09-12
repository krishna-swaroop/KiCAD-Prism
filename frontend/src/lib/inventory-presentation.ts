/** Shared by catalog inventory and remote supply sources. */
interface InventoryState {
  fetch_status?: string;
  mixed_units?: boolean;
  mixed_status?: boolean;
  mixed_fetch?: boolean;
}

export function inventoryWarnings(source: InventoryState | null | undefined): string[] {
  if (!source) return [];
  const warnings: string[] = [];
  const fetchStatus = source.fetch_status?.trim().toLowerCase();
  if (source.mixed_fetch || (fetchStatus && fetchStatus !== "ok")) warnings.push("Sync failed");
  if (source.mixed_units) warnings.push("Mixed units");
  if (source.mixed_status) warnings.push("Mixed status");
  return warnings;
}
