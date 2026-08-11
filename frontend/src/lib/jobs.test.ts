import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "@/lib/api";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";

vi.mock("@/lib/api", () => ({
    fetchApi: vi.fn(),
    readApiError: vi.fn(async () => "request failed"),
}));

const response = (payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });

describe("unified job polling", () => {
    beforeEach(() => {
        vi.mocked(fetchApi).mockReset();
    });

    it("polls status and logs until the fenced job completes", async () => {
        vi.mocked(fetchApi)
            .mockResolvedValueOnce(response({
                job_id: "job-1",
                kind: "kicad_workflow",
                status: "running",
                stage: "run-jobset",
                message: "Generating",
                percent: 50,
            }))
            .mockResolvedValueOnce(response({ lines: ["first"] }))
            .mockResolvedValueOnce(response({
                job_id: "job-1",
                kind: "kicad_workflow",
                status: "completed",
                stage: "completed",
                message: "Ready",
                percent: 100,
            }))
            .mockResolvedValueOnce(response({ lines: ["first", "done"] }));
        const updates: Array<{ status: string; logs: string[] }> = [];

        const job = await watchPrismJob("job-1", {
            intervalMs: 0,
            includeLogs: true,
            onUpdate: (nextJob, logs) => {
                updates.push({ status: nextJob.status, logs });
            },
        });

        expect(job.status).toBe("completed");
        expect(updates).toEqual([
            { status: "running", logs: ["first"] },
            { status: "completed", logs: ["first", "done"] },
        ]);
    });

    it("surfaces failed job details", () => {
        expect(() => throwIfJobFailed({
            job_id: "job-1",
            kind: "project_sync",
            status: "failed",
            stage: "failed",
            message: "Failed",
            percent: 20,
            error_message: "Remote rejected the fetch",
        }, "Sync failed")).toThrow("Remote rejected the fetch");
    });
});
