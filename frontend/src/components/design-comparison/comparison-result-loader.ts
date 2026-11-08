import { fetchApi, readApiError } from "@/lib/api";
import {
    DESIGN_COMPARE_RESULT_SCHEMA,
    type DesignCompareResultA1,
} from "./design-compare-result";
import {
    isLegacyResult,
    readLegacyResult,
    type LegacyResult,
} from "./legacy-v3-result";
import type {
    DesignCompareBundle,
    DesignCompareBundleV2,
    DesignCompareReadiness,
    DesignCompareResult,
    FabricationDiff,
    SidecarDescriptor,
} from "./types";

/**
 * What the design-compare job route returns:
 * - `prism-kicad compare`'s result, inline while fabrication builds, then a v2
 *   manifest of one sidecar per tab;
 * - the legacy path's v3 result, inline while late domains build, then a v1
 *   manifest.
 */
export type DesignComparePayload =
    | (DesignCompareResultA1 & { readiness?: DesignCompareReadiness })
    | DesignCompareBundleV2
    | LegacyResult
    | DesignCompareBundle;

/** The review document's tabs, each a v2 sidecar under its own key. */
const RESULT_TABS = [
    "files",
    "schematic",
    "pcb",
    "bom",
    "stackup",
    "routeMetrics",
    "projectDiff",
] as const;

const LEGACY_SIDECARS = [
    "core",
    "schematic",
    "pcb",
    "bom",
    "stackup",
    "document_diff",
] as const;

async function fetchSidecar(
    sidecars: Record<string, SidecarDescriptor>,
    name: string,
    signal: AbortSignal | undefined,
): Promise<unknown> {
    const descriptor = sidecars[name];
    if (!descriptor?.url) {
        throw new Error(`Comparison result is missing its ${name} sidecar`);
    }
    const response = await fetchApi(descriptor.url, { signal });
    if (!response.ok) {
        throw new Error(
            await readApiError(response, `Failed to load comparison ${name} data`),
        );
    }
    return response.json();
}

/**
 * Fabrication is optional: a failed or absent fabrication domain leaves the
 * other tabs usable.
 */
async function fetchFabrication(
    sidecars: Record<string, SidecarDescriptor>,
    signal: AbortSignal | undefined,
): Promise<FabricationDiff | undefined> {
    const descriptor = sidecars.fabrication;
    if (!descriptor?.url) return undefined;
    const response = await fetchApi(descriptor.url, { signal });
    if (!response.ok) return undefined;
    return (await response.json()) as FabricationDiff;
}

/**
 * Layer artwork is referenced by sidecar name inside the fabrication payload,
 * and only the manifest knows what each name resolves to.
 */
function sidecarUrls(sidecars: Record<string, SidecarDescriptor>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(sidecars).map(([name, descriptor]) => [name, descriptor.url]),
    );
}

async function hydrateManifest(
    manifest: DesignCompareBundleV2,
    signal: AbortSignal | undefined,
): Promise<DesignCompareResult> {
    const [tabs, fabrication] = await Promise.all([
        Promise.all(RESULT_TABS.map(async (name) =>
            [name, await fetchSidecar(manifest.sidecars, name, signal)] as const)),
        fetchFabrication(manifest.sidecars, signal),
    ]);
    const result = Object.fromEntries(tabs) as Pick<
        DesignCompareResultA1,
        (typeof RESULT_TABS)[number]
    >;
    return {
        ...result,
        schema: DESIGN_COMPARE_RESULT_SCHEMA,
        base: manifest.revisions.base,
        head: manifest.revisions.head,
        counts: manifest.counts,
        readiness: manifest.readiness,
        fabrication,
        sidecarUrls: sidecarUrls(manifest.sidecars),
    };
}

async function hydrateLegacyManifest(
    manifest: DesignCompareBundle,
    signal: AbortSignal | undefined,
): Promise<DesignCompareResult> {
    const [sidecars, fabrication] = await Promise.all([
        Promise.all(LEGACY_SIDECARS.map(async (name) =>
            [name, await fetchSidecar(manifest.sidecars, name, signal)] as const)),
        fetchFabrication(manifest.sidecars, signal),
    ]);
    const parts = Object.fromEntries(sidecars) as Record<
        (typeof LEGACY_SIDECARS)[number],
        unknown
    >;
    const legacy = {
        ...(parts.core as Pick<LegacyResult, "files" | "readiness">),
        schematic: parts.schematic,
        pcb: parts.pcb,
        bom: parts.bom,
        stackup: parts.stackup,
        document_diff: parts.document_diff,
        fabrication,
    } as LegacyResult;
    return readLegacyResult(legacy, { sidecarUrls: sidecarUrls(manifest.sidecars) });
}

export type HydrateOptions = {
    signal?: AbortSignal;
    /**
     * Whether the job has completed. A manifest's sidecars are registered in
     * the transaction that completes the job, so before then they do not exist
     * and must not be requested. The running job's result is the inline
     * partial document, which hydrates without sidecars.
     */
    completed?: boolean;
};

export async function hydrateDesignComparePayload(
    payload: DesignComparePayload,
    { signal, completed = true }: HydrateOptions = {},
): Promise<DesignCompareResult | null> {
    switch (payload.schema) {
        case DESIGN_COMPARE_RESULT_SCHEMA:
            return payload as DesignCompareResult;
        case "prism.design_compare_bundle_v2":
            return completed ? hydrateManifest(payload as DesignCompareBundleV2, signal) : null;
        case "prism.design_compare_bundle_v1":
            return completed ? hydrateLegacyManifest(payload as DesignCompareBundle, signal) : null;
        default:
            if (isLegacyResult(payload)) return readLegacyResult(payload as LegacyResult);
            throw new Error(`Unknown comparison result schema: ${String(payload.schema)}`);
    }
}
