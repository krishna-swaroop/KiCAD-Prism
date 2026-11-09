import { fetchJson } from "@/lib/api";
import type { DecisionState, EndingParts, RestrictionLevel } from "@/types/supply";
import { changesSupply } from "./supply-writes";

const BASE = "/api/supply/ending";

/** Library components whose part is ending, with the reason and what a person needs to decide. */
export function getEndingParts(signal?: AbortSignal): Promise<EndingParts> {
  return fetchJson<EndingParts>(BASE, { signal }, "Could not load the ending parts");
}

/** Mark a component "not for new designs", or record that it was retired. */
async function setRestrictionRequest(componentId: string, level: RestrictionLevel, reason: string): Promise<void> {
  await fetchJson(`${BASE}/${encodeURIComponent(componentId)}/restriction`, { method: "PUT", body: JSON.stringify({ level, reason }) }, "Could not save the decision");
}

async function clearRestrictionRequest(componentId: string): Promise<void> {
  await fetchJson(`${BASE}/${encodeURIComponent(componentId)}/restriction`, { method: "DELETE" }, "Could not clear the decision");
}

/** Retire a component through the catalog's own workflow (the archive step), then record it here. */
async function retireComponentRequest(componentId: string, reason: string): Promise<void> {
  await fetchJson(
    `/api/catalog/components/${encodeURIComponent(componentId)}/release`,
    { method: "POST", body: JSON.stringify({ workflow_stage: "archived", review_note: reason }) },
    "Could not archive the component",
  );
  await setRestriction(componentId, "retired", reason);
}

/** Nothing to do about this component for these reasons; a new reason brings it back. */
async function dismissEndingRequest(componentId: string, reasons: string[]): Promise<DecisionState> {
  return fetchJson(`${BASE}/${encodeURIComponent(componentId)}/dismissal`, { method: "PUT", body: JSON.stringify({ reasons }) }, "Could not dismiss it");
}

/** QA accepts or rejects a dismissal someone asked for. */
async function decideDismissalRequest(id: string, approve: boolean): Promise<void> {
  await fetchJson(`${BASE}/dismissals/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, { method: "POST" }, "Could not save the decision");
}

export const setRestriction = changesSupply(setRestrictionRequest);
export const clearRestriction = changesSupply(clearRestrictionRequest);
export const retireComponent = changesSupply(retireComponentRequest);
export const dismissEnding = changesSupply(dismissEndingRequest);
export const decideDismissal = changesSupply(decideDismissalRequest);
