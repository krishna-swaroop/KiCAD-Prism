/** Typed client for the push tokens of a file-fed connector or a push inventory source. */

import { ApiHttpError, fetchApi, fetchJson, readApiError } from "@/lib/api";
import type { IssuedPushToken, PushTarget, PushToken } from "@/types/supply";
import { changesSupply } from "./supply-writes";

const path = (target: PushTarget, id: string) =>
  `/api/supply/${target === "connector" ? "connectors" : "inventory-sources"}/${encodeURIComponent(id)}/push-token`;

export function getPushToken(target: PushTarget, id: string, signal?: AbortSignal): Promise<PushToken | null> {
  return fetchJson<PushToken | null>(path(target, id), { signal }, "Could not load the push token");
}

/** A new token, replacing the one the target had. Shown once. */
function issuePushTokenRequest(target: PushTarget, id: string): Promise<IssuedPushToken> {
  return fetchJson<IssuedPushToken>(path(target, id), { method: "POST" }, "Could not create a push token");
}

async function revokePushTokenRequest(target: PushTarget, id: string): Promise<void> {
  const response = await fetchApi(path(target, id), { method: "DELETE" });
  if (!response.ok) throw new ApiHttpError(response.status, await readApiError(response, "Could not revoke the push token"));
}

export const issuePushToken = changesSupply(issuePushTokenRequest);
export const revokePushToken = changesSupply(revokePushTokenRequest);
