import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/lib/api";

import { startBuild } from "./api";

vi.mock("@/lib/api", () => ({
    fetchJson: vi.fn(),
    fetchApi: vi.fn(),
}));

vi.mock("@/lib/jobs", () => ({
    watchPrismJob: vi.fn(),
    throwIfJobFailed: vi.fn(),
}));

describe("Release Studio build requests", () => {
    beforeEach(() => {
        vi.mocked(fetchJson).mockReset();
    });

    it("posts identity and manufacturing with the build request", async () => {
        vi.mocked(fetchJson).mockResolvedValue({ job: { job_id: "job-build" } });
        await startBuild("project", {
            commit_sha: "a".repeat(40),
            board: "board.kicad_pcb",
            schematic: "board.kicad_sch",
            identity: { tag: "v1.0.0", document_name: "USBPD-100", date: "2026-08-14", notes: "" },
            manufacturing: { manufacturing_ipc_class: "IPC-6012 Class 2" },
        });
        expect(fetchJson).toHaveBeenCalledWith(
            "/api/projects/project/release-studio/candidates",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining("USBPD-100"),
            }),
            "Could not start the build",
        );
    });
});
