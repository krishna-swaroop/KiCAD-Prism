import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fetchApi } from "@/lib/api";
import { watchPrismJob, type PrismJobStatus } from "@/lib/jobs";
import { useDesignCompareJob } from "./use-design-compare-job";

vi.mock("@/lib/api", () => ({ fetchApi: vi.fn(), readApiError: vi.fn() }));
vi.mock("@/lib/jobs", () => ({ isAbortError: () => false, watchPrismJob: vi.fn() }));

describe("useDesignCompareJob", () => {
    it("does not request a manifest's sidecars until the job completes", async () => {
        vi.mocked(fetchApi).mockReset();
        vi.mocked(watchPrismJob).mockReset();
        const sidecars = Object.fromEntries(
            [
                "files", "schematic", "pcb", "bom", "stackup",
                "routeMetrics", "projectDiff", "fabrication",
            ].map((name) => [name, {
                digest: name.padEnd(64, "0"),
                sizeBytes: 1,
                mediaType: "application/json",
                url: `/sidecars/${name}`,
            }]),
        );
        const calls: string[] = [];
        vi.mocked(fetchApi).mockImplementation(async (url, init) => {
            calls.push(String(url));
            if (init?.method === "POST") {
                return new Response(JSON.stringify({ job_id: "job-1" }), { status: 202 });
            }
            return new Response(JSON.stringify({
                schema: "prism.design_compare_bundle_v2",
                sidecars,
            }), { status: 200 });
        });
        let update:
            | ((job: PrismJobStatus, logs: string[]) => void | Promise<void>)
            | undefined;
        vi.mocked(watchPrismJob).mockImplementation(async (_jobId, options) => {
            update = options?.onUpdate;
            return new Promise<PrismJobStatus>(() => {});
        });

        renderHook(() => useDesignCompareJob("prj_1", "base", "head"));
        await waitFor(() => expect(update).toBeDefined());

        await act(async () => {
            await update?.({
                job_id: "job-1",
                kind: "design_compare",
                status: "running",
                stage: "building",
                message: "Building",
                percent: 50,
                result_metadata: { result_version: 2 },
            }, []);
        });

        expect(calls.some((url) => url.includes("/design-compare/job-1"))).toBe(true);
        expect(calls.filter((url) => url.includes("/sidecars/"))).toEqual([]);
    });

    it("reports why a failed comparison failed, not just that it did", async () => {
        vi.mocked(fetchApi).mockResolvedValue(new Response(JSON.stringify({ job_id: "job-1" }), { status: 202 }));
        vi.mocked(watchPrismJob).mockResolvedValue({
            job_id: "job-1",
            kind: "design_compare",
            status: "failed",
            stage: "failed",
            message: "Failed",
            percent: 100,
            error_message: "The project is not present at f307d1d (mezz_top.kicad_pro is not in the tree)",
        });

        const { result } = renderHook(() => useDesignCompareJob("prj_1", "f307d1d", "2d844c3"));

        await waitFor(() => expect(result.current.error).toBe(
            "The project is not present at f307d1d (mezz_top.kicad_pro is not in the tree)",
        ));
    });
});
