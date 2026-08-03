import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "@/lib/api";
import { hydrateDesignComparePayload } from "./comparison-result-loader";
import type {
    DesignCompareBundle,
    DesignCompareResult,
} from "./types";

vi.mock("@/lib/api", () => ({
    fetchApi: vi.fn(),
    readApiError: vi.fn(async () => "request failed"),
}));

const response = (payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });

describe("comparison result sidecars", () => {
    beforeEach(() => {
        vi.mocked(fetchApi).mockReset();
    });

    it("loads all immutable sidecars concurrently and reconstructs the result", async () => {
        const values = {
            core: {
                schema: "prism.semantic_comparison_v3",
                base: "base",
                head: "head",
                compare: "head",
                files: { base: [], head: [] },
            },
            schematic: { pages: [], changes: [], groups: [], summary: {} },
            pcb: { changes: [], groups: [], summary: {}, route_metrics: {} },
            bom: null,
            stackup: { base: [], head: [], changed: false, present: false },
            document_diff: {
                schema: "prism.kicad_project_diff_v1",
                provider: "prism-semantic",
                project: { documents: [] },
                navigation: {},
                diagnostics: [],
            },
        };
        vi.mocked(fetchApi).mockImplementation(async (url) => {
            const name = String(url).split("/").pop() as keyof typeof values;
            return response(values[name]);
        });
        const sidecars = Object.fromEntries(
            Object.keys(values).map((name) => [
                name,
                {
                    digest: name.padEnd(64, "0"),
                    sizeBytes: 1,
                    mediaType: "application/json",
                    url: `/sidecars/${name}`,
                },
            ]),
        ) as DesignCompareBundle["sidecars"];
        const bundle = {
            schema: "prism.design_compare_bundle_v1",
            resultSchema: "prism.semantic_comparison_v3",
            base: "base",
            head: "head",
            domains: {},
            sidecars,
        } as unknown as DesignCompareBundle;

        const result = await hydrateDesignComparePayload(bundle);

        expect(fetchApi).toHaveBeenCalledTimes(6);
        expect(result.schema).toBe("prism.semantic_comparison_v3");
        expect(result.document_diff.navigation).toEqual({});
        expect(result.stackup.present).toBe(false);
    });

    it("loads a bundle that has no fabrication sidecar", async () => {
        // Comparisons cached before the fabrication domain existed are still
        // valid results; requiring the sidecar would strand every one of them.
        vi.mocked(fetchApi).mockImplementation(async () => response({}));
        const names = [
            "core",
            "schematic",
            "pcb",
            "bom",
            "stackup",
            "document_diff",
        ];
        const bundle = {
            schema: "prism.design_compare_bundle_v1",
            base: "base",
            head: "head",
            domains: {},
            sidecars: Object.fromEntries(names.map((name) => [
                name,
                {
                    digest: name.padEnd(64, "0"),
                    sizeBytes: 1,
                    mediaType: "application/json",
                    url: `/sidecars/${name}`,
                },
            ])),
        } as unknown as DesignCompareBundle;

        const result = await hydrateDesignComparePayload(bundle);

        expect(fetchApi).toHaveBeenCalledTimes(6);
        expect(result.fabrication).toBeUndefined();
    });

    it("returns an inlined partial result without additional requests", async () => {
        const partial = {
            schema: "prism.semantic_comparison_v3",
        } as DesignCompareResult;

        await expect(hydrateDesignComparePayload(partial)).resolves.toBe(partial);
        expect(fetchApi).not.toHaveBeenCalled();
    });
});
