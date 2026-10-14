import { fetchChecked, fetchJson } from "@/lib/api";

import type {
    JsonPatchOperation,
    SetupRecord,
    SetupRecordSummary,
    SetupReport,
    SimCatalog,
    SimRun,
    SimSetup,
} from "./types";

const setups = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/sim/a0/setups`;
const setup = (projectId: string, setupId: string) => `${setups(projectId)}/${encodeURIComponent(setupId)}`;

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
});

export function readCatalog(): Promise<SimCatalog> {
    return fetchJson<SimCatalog>("/api/sim/a0/catalog", undefined, "Could not load the simulation catalog");
}

export function listSetups(projectId: string): Promise<SetupRecordSummary[]> {
    return fetchJson(setups(projectId), undefined, "Could not load setups");
}

export function draftSetup(projectId: string, kind: string, name: string, commit?: string): Promise<SetupRecord> {
    return fetchJson(setups(projectId), json("POST", { kind, name, ...(commit ? { commit } : {}) }), "Could not draft the setup");
}

export function readSetup(projectId: string, setupId: string): Promise<SetupRecord> {
    return fetchJson(setup(projectId, setupId), undefined, "Could not load the setup");
}

export function patchSetup(
    projectId: string, setupId: string, etag: string, operations: JsonPatchOperation[],
): Promise<SetupRecord> {
    return fetchJson(
        setup(projectId, setupId),
        json("PATCH", operations, { "Content-Type": "application/json-patch+json", "If-Match": etag }),
        "Could not change the setup",
    );
}

export function replaceSetup(projectId: string, setupId: string, etag: string, document: SimSetup): Promise<SetupRecord> {
    return fetchJson(setup(projectId, setupId), json("PUT", document, { "If-Match": etag }), "Could not save the setup");
}

export async function deleteSetup(projectId: string, setupId: string, etag: string): Promise<void> {
    await fetchChecked(setup(projectId, setupId), { method: "DELETE", headers: { "If-Match": etag } }, "Could not delete the setup");
}

export function submitSetup(projectId: string, setupId: string, etag: string, analysisId: string): Promise<SimRun> {
    return fetchJson(`${setup(projectId, setupId)}/submit`, json("POST", { analysis_id: analysisId }, { "If-Match": etag }), "Could not start the run");
}

export function listRuns(projectId: string): Promise<SimRun[]> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/sim/a0/runs`, undefined, "Could not load runs");
}

export function checkSetup(projectId: string, setupId: string, stage: "validate" | "preflight"): Promise<SetupReport> {
    return fetchJson(`${setup(projectId, setupId)}/${stage}`, { method: "POST" }, `Could not ${stage} the setup`);
}
