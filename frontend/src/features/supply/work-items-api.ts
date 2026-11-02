/** Typed client for `/api/supply/work-items`: engineering decisions about a component or a part. */

import { fetchJson } from "@/lib/api";
import type { Items, NewWorkItem, SupplyWorkItem, WorkItemChange, WorkItemEvent } from "@/types/supply.generated";
import { changesSupply } from "./supply-writes";

export type { NewWorkItem, SupplyWorkItem, WorkItemEvent };
export type WorkItemAction = SupplyWorkItem["action"];
export type WorkItemState = SupplyWorkItem["state"];

const BASE = "/api/supply/work-items";

export type WorkItemList = "live" | "mine" | "due" | WorkItemState;

export function listWorkItems(list: WorkItemList, signal?: AbortSignal, subject?: { kind: "component" | "part"; id: string }): Promise<SupplyWorkItem[]> {
  const query = new URLSearchParams({ state: list });
  if (subject) {
    query.set("subject_kind", subject.kind);
    query.set("subject_id", subject.id);
  }
  return fetchJson<Items<SupplyWorkItem>>(`${BASE}?${query}`, { signal }, "Could not load the work items").then((list) => list.items);
}

function createWorkItemRequest(item: NewWorkItem): Promise<SupplyWorkItem> {
  return fetchJson<SupplyWorkItem>(BASE, { method: "POST", body: JSON.stringify(item) }, "Could not open the work item");
}

function updateWorkItemRequest(id: string, change: WorkItemChange): Promise<SupplyWorkItem> {
  return fetchJson<SupplyWorkItem>(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(change) }, "Could not change the work item");
}

function decideWorkItemRequest(id: string, state: WorkItemState, note = ""): Promise<SupplyWorkItem> {
  return fetchJson<SupplyWorkItem>(`${BASE}/${encodeURIComponent(id)}/state`, { method: "POST", body: JSON.stringify({ state, note }) }, "Could not change the work item");
}

export function workItemHistory(id: string, signal?: AbortSignal): Promise<WorkItemEvent[]> {
  return fetchJson<Items<WorkItemEvent>>(`${BASE}/${encodeURIComponent(id)}/history`, { signal }, "Could not load the history").then((list) => list.items);
}

export const createWorkItem = changesSupply(createWorkItemRequest);
export const updateWorkItem = changesSupply(updateWorkItemRequest);
export const decideWorkItem = changesSupply(decideWorkItemRequest);
