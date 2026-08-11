import { fetchApi, readApiError } from "@/lib/api";
import type {
    DesignCompareBundle,
    DesignCompareResult,
} from "./types";

const SIDECARS = [
    "core",
    "schematic",
    "pcb",
    "bom",
    "stackup",
    "document_diff",
] as const;

/**
 * Sidecars a bundle may not carry. A comparison completed before this domain
 * existed is still a valid result, and refusing to load it would strand every
 * cached job on the previous schema.
 */
const OPTIONAL_SIDECARS = ["fabrication"] as const;

function isBundle(
    payload: DesignCompareResult | DesignCompareBundle,
): payload is DesignCompareBundle {
    return payload.schema === "prism.design_compare_bundle_v1";
}

export async function hydrateDesignComparePayload(
    payload: DesignCompareResult | DesignCompareBundle,
    signal?: AbortSignal,
): Promise<DesignCompareResult> {
    if (!isBundle(payload)) return payload;
    const responses = await Promise.all(
        SIDECARS.map(async (name) => {
            const descriptor = payload.sidecars[name];
            if (!descriptor?.url) {
                throw new Error(`Comparison result is missing its ${name} sidecar`);
            }
            const response = await fetchApi(descriptor.url, { signal });
            if (!response.ok) {
                throw new Error(
                    await readApiError(
                        response,
                        `Failed to load comparison ${name} data`,
                    ),
                );
            }
            return [name, await response.json()] as const;
        }),
    );
    const optional = await Promise.all(
        OPTIONAL_SIDECARS.map(async (name) => {
            const descriptor = payload.sidecars[name];
            if (!descriptor?.url) return [name, undefined] as const;
            const response = await fetchApi(descriptor.url, { signal });
            if (!response.ok) return [name, undefined] as const;
            return [name, await response.json()] as const;
        }),
    );
    const sidecars = Object.fromEntries([...responses, ...optional]) as Record<
        (typeof SIDECARS)[number] | (typeof OPTIONAL_SIDECARS)[number],
        unknown
    >;
    const core = sidecars.core as Pick<
        DesignCompareResult,
        | "schema"
        | "base"
        | "head"
        | "compare"
        | "diagnostics"
        | "readiness"
        | "files"
    >;
    return {
        ...core,
        schematic: sidecars.schematic as DesignCompareResult["schematic"],
        pcb: sidecars.pcb as DesignCompareResult["pcb"],
        bom: sidecars.bom as DesignCompareResult["bom"],
        stackup: sidecars.stackup as DesignCompareResult["stackup"],
        document_diff:
            sidecars.document_diff as DesignCompareResult["document_diff"],
        fabrication:
            sidecars.fabrication as DesignCompareResult["fabrication"],
        // Layer artwork is referenced by sidecar name inside the fabrication
        // payload, and only the manifest knows what each name resolves to.
        sidecarUrls: Object.fromEntries(
            Object.entries(payload.sidecars).map(
                ([name, descriptor]) => [name, descriptor.url],
            ),
        ),
    };
}
