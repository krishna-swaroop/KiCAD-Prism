import { fetchJson } from "@/lib/api";
import type { SupplyComponentStanding, TrackingPreview } from "@/types/supply";
import { changesSupply } from "./supply-writes";

/** Kept out of supply-api so the catalog table pulls in only this call, not the whole supply client. */
export async function getComponentsStatus(
  components: Array<{ id: string; manufacturer: string; mpn: string }>,
  signal?: AbortSignal,
): Promise<Record<string, SupplyComponentStanding>> {
  const body = JSON.stringify({ components: components.map(({ id, manufacturer, mpn }) => ({ key: id, manufacturer, mpn })) });
  const url = "/api/supply/bom/components-status";
  return (await fetchJson<{ items: Record<string, SupplyComponentStanding> }>(url, { method: "POST", body, signal }, "Could not load supply status")).items;
}

const WATCH_BATCH = 200;

/** How often the components' parts are read: tier 1 daily, tier 2 weekly or monthly. */
export interface TrackChoice {
  tier: 1 | 2;
  rate: "weekly" | "monthly";
}

type Component = { id: string; manufacturer: string; mpn: string };

function batches(components: Component[]): Component[][] {
  const result: Component[][] = [];
  for (let start = 0; start < components.length; start += WATCH_BATCH) result.push(components.slice(start, start + WATCH_BATCH));
  return result;
}

const bodyOf = (batch: Component[], choice: TrackChoice) =>
  JSON.stringify({ lines: batch.map(({ id, manufacturer, mpn }) => ({ key: id, manufacturer, mpn, quantity: 1 })), ...choice });

/** What tracking these components would cost each distributor's budget, without doing it. Up to 200 at a time. */
export function previewTrackComponents(components: Component[], choice: TrackChoice, signal?: AbortSignal): Promise<TrackingPreview> {
  return fetchJson("/api/supply/bom/watch/preview", { method: "POST", body: bodyOf(components.slice(0, WATCH_BATCH), choice), signal }, "Could not work out the cost");
}

/** Track these components' parts where there is room. Returns how many were newly tracked and how many were left out. Each part is on one row, so the batches can go together. */
async function watchCatalogComponentsRequest(
  components: Component[], choice: TrackChoice = { tier: 2, rate: "weekly" },
): Promise<{ watched: number; skipped: number }> {
  const results = await Promise.all(batches(components).map((batch) => fetchJson<{ watched: number; skipped?: unknown[] }>(
    "/api/supply/bom/watch", { method: "POST", body: bodyOf(batch, choice) }, "Could not track the parts",
  )));
  return {
    watched: results.reduce((sum, result) => sum + result.watched, 0),
    skipped: results.reduce((sum, result) => sum + (result.skipped?.length ?? 0), 0),
  };
}

export const watchCatalogComponents = changesSupply(watchCatalogComponentsRequest);
