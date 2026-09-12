import type { PanelComponent } from "@/panel/lib/panel-api";

/** Client page size. Must stay at or below the remote-provider maximum of 200. */
export const PANEL_PAGE_SIZE = 50;
export const REMOTE_MAX_PAGE_SIZE = 200;

export function normalizePanelPageSize(pageSize = PANEL_PAGE_SIZE): number {
  return Math.min(Math.max(1, pageSize), REMOTE_MAX_PAGE_SIZE);
}

export function formatPanelLoadedCount(
  loaded: number,
  total: number | null,
  hasMore: boolean,
  noun = "part",
): string {
  const pluralNoun = (count: number) => (count === 1 ? noun : `${noun}s`);
  if (total != null) {
    return `${loaded} of ${total} ${pluralNoun(total)}`;
  }
  if (hasMore) {
    return `${loaded} ${pluralNoun(loaded)} loaded`;
  }
  return `${loaded} ${pluralNoun(loaded)}`;
}

export function appendUniquePageItems(
  existing: PanelComponent[],
  incoming: PanelComponent[],
): PanelComponent[] {
  if (incoming.length === 0) {
    return existing;
  }
  const seen = new Set(existing.map((item) => item.id));
  const appended: PanelComponent[] = [];
  for (const item of incoming) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    appended.push(item);
  }
  return appended.length === 0 ? existing : existing.concat(appended);
}
