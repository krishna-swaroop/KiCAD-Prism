/** Typed client for `/api/supply/inventory-sources`: local inventory servers. */

import { ApiHttpError, fetchApi, fetchJson, readApiError } from "@/lib/api";
import type { InventoryServerCheck, InventorySource, InventorySourceInput, InventorySyncResult, InventoryUnmatchedPart } from "@/types/supply";
import { changesSupply } from "./supply-writes";

const BASE = "/api/supply/inventory-sources";

const path = (id: string, ...rest: string[]) => [BASE, encodeURIComponent(id), ...rest].join("/");

export function listInventorySources(signal?: AbortSignal): Promise<InventorySource[]> {
  return fetchJson<InventorySource[]>(BASE, { signal }, "Could not load inventory sources");
}

function createInventorySourceRequest(input: InventorySourceInput): Promise<InventorySource> {
  return fetchJson<InventorySource>(BASE, { method: "POST", body: JSON.stringify(input) }, "Could not add the source");
}

function updateInventorySourceRequest(id: string, input: InventorySourceInput): Promise<InventorySource> {
  return fetchJson<InventorySource>(path(id), { method: "PATCH", body: JSON.stringify(input) }, "Could not save the source");
}

async function deleteInventorySourceRequest(id: string): Promise<void> {
  const response = await fetchApi(path(id), { method: "DELETE" });
  if (!response.ok) throw new ApiHttpError(response.status, await readApiError(response, "Could not delete the source"));
}

export function checkInventorySource(id: string): Promise<InventoryServerCheck> {
  return fetchJson<InventoryServerCheck>(path(id, "check"), { method: "POST" }, "Could not reach the server");
}

function syncInventorySourceRequest(id: string): Promise<InventorySyncResult> {
  return fetchJson<InventorySyncResult>(path(id, "sync"), { method: "POST" }, "Could not read the server");
}

/** The groups unmatched stock is sorted into: waiting (in all, or for one reason), linked, or set aside. */
export type UnmatchedGroup = "waiting" | "no_component" | "sap_code_shared" | "mpn_shared" | "linked" | "ignored";

export function listUnmatchedParts(
  id: string, signal?: AbortSignal, page: { q?: string; limit?: number; offset?: number; group?: UnmatchedGroup | "" } = {},
): Promise<InventoryUnmatchedPart[]> {
  const query = new URLSearchParams();
  if (page.q) query.set("q", page.q);
  if (page.group) query.set("group", page.group);
  if (page.limit !== undefined) query.set("limit", String(page.limit));
  if (page.offset) query.set("offset", String(page.offset));
  const suffix = query.toString() ? `?${query}` : "";
  return fetchJson<InventoryUnmatchedPart[]>(`${path(id, "unmatched")}${suffix}`, { signal }, "Could not load the unmatched stock");
}

export function countUnmatchedParts(id: string, signal?: AbortSignal): Promise<Record<UnmatchedGroup, number>> {
  return fetchJson<Record<UnmatchedGroup, number>>(path(id, "unmatched", "counts"), { signal }, "Could not count the unmatched stock");
}

/** Sets unmatched parts aside, or brings them back. Returns how many changed. */
function setUnmatchedIgnoredRequest(id: string, remoteParts: string[], ignore: boolean): Promise<{ changed: number }> {
  return fetchJson<{ changed: number }>(path(id, "unmatched", "ignore"), { method: "POST", body: JSON.stringify({ remote_parts: remoteParts, ignore }) }, ignore ? "Could not ignore the parts" : "Could not restore the parts");
}

/** Says which component a server part is; the source is read again, so its stock lands at once. */
function linkUnmatchedPartRequest(id: string, remotePart: string, componentId: string): Promise<InventorySyncResult> {
  return fetchJson<InventorySyncResult>(path(id, "unmatched", encodeURIComponent(remotePart), "link"), { method: "POST", body: JSON.stringify({ component_id: componentId }) }, "Could not link the part");
}

export const createInventorySource = changesSupply(createInventorySourceRequest);
export const updateInventorySource = changesSupply(updateInventorySourceRequest);
export const deleteInventorySource = changesSupply(deleteInventorySourceRequest);
export const syncInventorySource = changesSupply(syncInventorySourceRequest);
export const setUnmatchedIgnored = changesSupply(setUnmatchedIgnoredRequest);
export const linkUnmatchedPart = changesSupply(linkUnmatchedPartRequest);
