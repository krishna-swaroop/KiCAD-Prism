import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "@/lib/api";
import { hydrateDesignComparePayload } from "./comparison-result-loader";
import type { DesignCompareResultA1 } from "./design-compare-result";
import type { DesignCompareBundleV2, DesignCompareReadiness } from "./types";

vi.mock("@/lib/api", () => ({
    fetchApi: vi.fn(),
    readApiError: vi.fn(async () => "request failed"),
}));

const response = (payload: unknown, status = 200): Response =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
    });

const KEY = "a".repeat(64);

const result: DesignCompareResultA1 = {
    schema: "prism.design_compare.result.a1",
    base: { revisionKey: KEY, bundleKey: KEY, projectFile: "p.kicad_pro" },
    head: { revisionKey: KEY, projectFile: "p.kicad_pro" },
    files: { base: [], head: [{ path: "p.kicad_sch", filename: "p.kicad_sch" }] },
    schematic: { changes: [] },
    pcb: { changes: [] },
    bom: { fields: [], changes: [], summary: { added: 0, removed: 0, changed: 0 } },
    stackup: {
        present: false, changed: false, base: [], head: [], baseSettings: {}, headSettings: {},
    },
    routeMetrics: { base: {}, head: {} },
    projectDiff: {
        schema: "prism.kicad_project_diff_v1",
        provider: "prism-semantic",
        project: { documents: [] },
        navigation: {},
        diagnostics: [],
    },
    counts: {
        schematic: { added: 0, removed: 0, changed: 0 },
        pcb: { added: 0, removed: 0, changed: 1 },
        bom: { added: 0, removed: 0, changed: 0 },
    },
};

const readiness = (fabrication: "building" | "ready"): DesignCompareReadiness => ({
    stage: fabrication === "ready" ? "complete" : "background-fabrication",
    domains: { schematic: "ready", bom: "ready", pcb: "ready", stackup: "ready", fabrication },
});

const TABS = ["files", "schematic", "pcb", "bom", "stackup", "routeMetrics", "projectDiff"] as const;

function manifest(names: readonly string[]): DesignCompareBundleV2 {
    return {
        schema: "prism.design_compare_bundle_v2",
        resultSchema: "prism.design_compare.result.a1",
        base: "base-commit",
        head: "head-commit",
        revisions: { base: result.base, head: result.head },
        readiness: readiness("ready"),
        counts: result.counts,
        modes: { base: "bundle", head: "source-tree" },
        sidecars: Object.fromEntries(names.map((name) => [name, {
            digest: name.padEnd(64, "0"),
            sizeBytes: 1,
            mediaType: "application/json",
            url: `/sidecars/${name}`,
        }])),
    };
}

describe("loading compare's result", () => {
    beforeEach(() => {
        vi.mocked(fetchApi).mockReset();
    });

    it("takes the inline result as it is while fabrication builds", async () => {
        const partial = { ...result, readiness: readiness("building") };
        await expect(hydrateDesignComparePayload(partial)).resolves.toBe(partial);
        expect(fetchApi).not.toHaveBeenCalled();
    });

    it("does not request a manifest's sidecars before the job completes", async () => {
        // Sidecars are registered in the transaction that completes the job,
        // so a manifest seen while it is still running answers 404 for every
        // sidecar. The inline partial result is what renders until then.
        const loaded = await hydrateDesignComparePayload(
            manifest([...TABS, "fabrication"]),
            { completed: false },
        );

        expect(loaded).toBeNull();
        expect(fetchApi).not.toHaveBeenCalled();
    });

    it("still takes the inline partial result while the job runs", async () => {
        const partial = { ...result, readiness: readiness("building") };
        await expect(hydrateDesignComparePayload(partial, { completed: false }))
            .resolves.toBe(partial);
        expect(fetchApi).not.toHaveBeenCalled();
    });

    it("assembles the v2 manifest's tabs, fabrication and sidecar urls", async () => {
        const fabrication = { present: true, layers: [], warnings: [] };
        const payloads: Record<string, unknown> = {
            ...Object.fromEntries(TABS.map((tab) => [tab, result[tab]])),
            fabrication,
            "fab:F.Cu:base": "<svg/>",
        };
        vi.mocked(fetchApi).mockImplementation(async (url) =>
            response(payloads[String(url).split("/").pop()!]));

        const loaded = (await hydrateDesignComparePayload(
            manifest([...TABS, "core", "fabrication", "fab:F.Cu:base"]),
        ))!;

        expect(loaded).toEqual({
            ...result,
            readiness: readiness("ready"),
            fabrication,
            sidecarUrls: Object.fromEntries(
                [...TABS, "core", "fabrication", "fab:F.Cu:base"]
                    .map((name) => [name, `/sidecars/${name}`]),
            ),
        });
        // Tabs and fabrication only; layer artwork loads when a layer is shown.
        expect(vi.mocked(fetchApi).mock.calls.map(([url]) => url).sort()).toEqual(
            [...TABS, "fabrication"].map((name) => `/sidecars/${name}`).sort(),
        );
    });

    it("keeps the other tabs when fabrication failed", async () => {
        vi.mocked(fetchApi).mockImplementation(async (url) => {
            const name = String(url).split("/").pop()!;
            return name === "fabrication"
                ? response({ detail: "gone" }, 404)
                : response(result[name as (typeof TABS)[number]]);
        });
        const loaded = (await hydrateDesignComparePayload(manifest([...TABS, "fabrication"])))!;
        expect(loaded.fabrication).toBeUndefined();
        expect(loaded.files).toEqual(result.files);
    });

    it("refuses a manifest without one of its tabs", async () => {
        vi.mocked(fetchApi).mockImplementation(async (url) =>
            response(result[String(url).split("/").pop() as (typeof TABS)[number]]));
        await expect(hydrateDesignComparePayload(manifest(TABS.filter((tab) => tab !== "bom"))))
            .rejects.toThrow("missing its bom sidecar");
    });

    it("refuses a schema it does not know", async () => {
        await expect(hydrateDesignComparePayload(
            { ...result, schema: "prism.design_compare.result.a0" } as never,
        )).rejects.toThrow("Unknown comparison result schema");
    });
});
