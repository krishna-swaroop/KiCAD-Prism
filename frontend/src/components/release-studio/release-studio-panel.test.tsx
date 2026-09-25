import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReleaseStudioPanel } from "./ReleaseStudioPanel";
import type { BuildDetail, ReleaseCandidate, ReleaseSource } from "./types";

const source: ReleaseSource = {
    boards: ["board.kicad_pcb"],
    schematics: ["board.kicad_sch"],
    board: "board.kicad_pcb",
    schematic: "board.kicad_sch",
    project: "board.kicad_pro",
    variants: ["default"],
    bom_presets: ["Current project settings", "Grouped By Value"],
    default_bom_preset: "Current project settings",
    variant: "default",
};

vi.mock("./api", () => ({
    listCandidates: vi.fn(),
    getBuild: vi.fn(),
    listDocumentSheets: vi.fn(async () => []),
    publishBuild: vi.fn(async () => ({ release: { url: "https://github.com/org/repo/releases/tag/v1.0.0", tag: "v1.0.0", forge: "github" }, filename: "board-v1.zip" })),
    approveBuild: vi.fn(async () => ({ approvals: {} })),
    withdrawApproval: vi.fn(async () => ({ approvals: {} })),
    startBuild: vi.fn(async () => ({ job: { job_id: "job-1" } })),
    getSource: vi.fn(),
    saveSourceDefaults: vi.fn(async () => ({ defaults: {} })),
    tagExists: vi.fn(async () => false),
    impedanceTemplateUrl: vi.fn((projectId: string) => `/api/projects/${projectId}/release-studio/impedance-template.csv`),
    sheetObjectUrl: vi.fn(async () => "blob:sheet"),
    downloadUrl: vi.fn(() => "/x"),
    dossierDownloadUrl: vi.fn((projectId: string, buildId: string) => `/api/projects/${projectId}/release-studio/builds/${buildId}/dossier`),
    buildEvidenceDownloadUrl: vi.fn((projectId: string, buildId: string) => `/api/projects/${projectId}/release-studio/builds/${buildId}/build-evidence`),
    downloadFile: vi.fn(),
    listVendorProfiles: vi.fn(async () => [
        {
            id: "jlcpcb",
            title: "JLCPCB",
            pack_filename: "jlcpcb-upload.zip",
            description: "Gerbers, drill, and JLCPCB SMT workbooks.",
            required_pack_artifacts: ["gerber", "drill", "bom.csv", "cpl.csv", "bom.xlsx", "cpl.xlsx"],
        },
    ]),
    listProjectCommits: vi.fn(async () => [
        {
            hash: "abcdef1",
            full_hash: "abcdef12abcdef12abcdef12abcdef12abcdef12",
            author: "designer",
            email: "d@example.com",
            date: "2026-08-11T00:00:00Z",
            message: "head commit",
        },
    ]),
    vendorPackUrl: vi.fn(() => "/pack"),
    listBuildLogs: vi.fn(async () => ({ timings: [], steps: [] })),
    fetchBuildLog: vi.fn(async () => ""),
    memberJson: vi.fn(async () => ({})),
}));

vi.mock("@/lib/jobs", () => ({
    cancelPrismJob: vi.fn(),
    watchPrismJob: vi.fn(),
    throwIfJobFailed: vi.fn(),
    jobPipeline: vi.fn((job: { pipeline?: unknown }) => job.pipeline),
}));

import * as api from "./api";

const candidate: ReleaseCandidate = {
    id: "cand-1",
    project_id: "p1",
    config_key: "release",
    commit_sha: "abcdef12abcdef12abcdef12abcdef12abcdef12",
    variant: "default",
    build_key: "bk",
    status: "built",
    hermetic: true,
    non_hermetic_reasons: [],
    technical_config_digest: "tc",
    input_closure_digest: "ic",
    toolchain_digest: "tl",
    created_by: "designer",
    created_at: "2026-08-11T00:00:00Z",
    latest_build: {
        id: "build-1",
        candidate_id: "cand-1",
        status: "succeeded",
        attempt: 1,
        manifest_digest: "m".repeat(64),
        dossier_digest: "d".repeat(64),
        dossier_artifact_id: "a1",
        evidence_artifact_id: "a2",
        error_code: "",
        error_message: "",
        started_at: null,
        completed_at: null,
    },
    builds: [],
};

const detail: BuildDetail = {
    build: candidate.latest_build!,
    candidate,
    configuration: {
        config_key: "release",
        title: "USBPD-100",
        board_rel: "board.kicad_pcb",
        schematic_rel: "board.kicad_sch",
        default_variant: "default",
        document_number: "USBPD-100",
        revision: "v1.0.0",
        vendors: ["jlcpcb"],
        fields: {
            manufacturing_ipc_class: "IPC-6012 Class 2",
            assembly_ipc_class: "IPC-A-610 Class 2",
            solder_mask_colour: "Green",
            silkscreen_colour: "White",
            via_treatment: "Tented",
        },
    },
    members: [],
    evidence: [],
    fingerprints: {},
    vendor_readiness: [{ vendor_id: "jlcpcb", ready: false, missing_requirements: ["Gerber", "drill"] }],
    approvals: {
        designer: null,
        qa: null,
        both_approved: false,
        published: null,
        electrical_errors: [],
        can_approve_designer: true,
        can_approve_qa: false,
        can_withdraw: false,
        can_publish: false,
        blocked_reason: "Designer and QA must both approve this dossier.",
    },
    forge: {
        kind: "github",
        name: "GitHub",
        host: "github.com",
        owner_repo: "org/repo",
        token_configured: true,
        token_hint: "",
    },
};

async function continueToIdentity() {
    const button = await screen.findByRole("button", { name: /^Continue$/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await screen.findByRole("heading", { name: /Release identity/i });
}

async function continueToManufacturing() {
    await continueToIdentity();
    fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "v1.0.0" } });
    fireEvent.change(screen.getByLabelText("Document Name"), { target: { value: "USBPD-100" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Continue$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    await screen.findByRole("heading", { name: /Manufacturing and assembly/i });
}

async function startRun() {
    await continueToManufacturing();
    fireEvent.click(await screen.findByRole("button", { name: /^Continue$/i }));
}

async function selectHistoryRun() {
    fireEvent.click(await screen.findByRole("button", { name: /^history$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /abcdef12/i }));
}

async function openOutputs() {
    await selectHistoryRun();
    const outputs = await screen.findByRole("button", { name: /Outputs/i });
    await waitFor(() => expect(outputs).not.toBeDisabled());
    fireEvent.click(outputs);
}

describe("ReleaseStudioPanel", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        window.history.replaceState({}, "", "/");
        vi.mocked(api.getSource).mockResolvedValue({
            source,
            ipc: {
                manufacturing: [{ value: "IPC-6012 Class 2", label: "IPC-6012 Class 2" }, { value: "other", label: "Other" }],
                assembly: [{ value: "IPC-A-610 Class 2", label: "IPC-A-610 Class 2" }, { value: "other", label: "Other" }],
            },
            forge: { kind: "github", name: "GitHub", host: "github.com", owner_repo: "org/repo", token_configured: true, token_hint: "" },
        });
        vi.mocked(api.listCandidates).mockResolvedValue([candidate]);
        vi.mocked(api.getBuild).mockResolvedValue(detail);
        vi.mocked(api.listDocumentSheets).mockResolvedValue([]);
        vi.mocked(api.tagExists).mockResolvedValue(false);
    });

    it("opens a new release on Source and keeps the build action behind identity", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        expect(await screen.findByRole("heading", { name: /^Source$/i })).toBeTruthy();
        expect(screen.getByRole("navigation", { name: /run stages/i }).textContent).toContain("Identity");
        expect(screen.getByRole("navigation", { name: /run stages/i }).textContent).toContain("Manufacturing");
        expect(screen.queryByRole("heading", { name: /Manufacturing and assembly/i })).toBeNull();
        expect(vi.mocked(api.startBuild).mock.calls.length).toBe(0);
    });

    it("disables Continue when the revision has no board", async () => {
        vi.mocked(api.getSource).mockResolvedValue({
            source: { ...source, board: "", schematic: "", boards: [], schematics: [] },
            ipc: { manufacturing: [], assembly: [] },
            forge: { kind: "github", name: "GitHub", host: "github.com", owner_repo: "org/repo", token_configured: true, token_hint: "" },
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        expect(await screen.findByRole("button", { name: /^Continue$/i })).toBeDisabled();
    });

    it("discovers KiCad files at the selected revision", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await waitFor(() => expect(api.getSource).toHaveBeenCalledWith("p1", "abcdef12abcdef12abcdef12abcdef12abcdef12"));
        expect(await screen.findByDisplayValue("board.kicad_pcb")).toBeTruthy();
        expect(screen.getByDisplayValue("board.kicad_sch")).toBeTruthy();
    });

    it("remembers source picks when continuing to identity", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await continueToIdentity();
        expect(api.saveSourceDefaults).toHaveBeenCalledWith("p1", {
            board: "board.kicad_pcb",
            schematic: "board.kicad_sch",
            variant: "default",
            bom_preset: "Current project settings",
        });
    });

    it("still continues when remembering source picks fails", async () => {
        vi.mocked(api.saveSourceDefaults).mockRejectedValue(new Error("defaults unavailable"));
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await continueToIdentity();
        expect(screen.getByText("defaults unavailable")).toBeTruthy();
    });

    it("keeps historical revisions buildable", async () => {
        const tip = candidate.commit_sha;
        const historical = "1".repeat(40);
        vi.mocked(api.listProjectCommits).mockResolvedValue([
            { hash: tip.slice(0, 7), full_hash: tip, author: "designer", email: "d@example.com", date: "2026-08-11T00:00:00Z", message: "tip" },
            { hash: historical.slice(0, 7), full_hash: historical, author: "designer", email: "d@example.com", date: "2026-08-10T00:00:00Z", message: "historical" },
        ]);
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        const revision = await screen.findByLabelText("Revision");
        fireEvent.change(revision, { target: { value: historical } });
        await waitFor(() => expect(api.getSource).toHaveBeenCalledWith("p1", historical));
        expect(await screen.findByRole("button", { name: /^Continue$/i })).not.toBeDisabled();
    });

    it("blocks Identity when the tag already exists", async () => {
        vi.mocked(api.tagExists).mockResolvedValue(true);
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await continueToIdentity();
        fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "v1.0.0" } });
        fireEvent.change(screen.getByLabelText("Document Name"), { target: { value: "USBPD-100" } });
        expect(await screen.findByText(/already exists/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: /^Continue$/i })).toBeDisabled();
    });

    it("disables Identity Continue while the tag check is in flight", async () => {
        vi.mocked(api.tagExists).mockImplementation(() => new Promise(() => {}));
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await continueToIdentity();
        fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "v1.0.0" } });
        fireEvent.change(screen.getByLabelText("Document Name"), { target: { value: "USBPD-100" } });
        expect(await screen.findByText(/Checking whether this tag exists/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: /^Continue$/i })).toBeDisabled();
    });

    it("accepts a pasted full SHA that is not in the recent-commit list", async () => {
        const historical = "1".repeat(40);
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await screen.findByLabelText("Revision");
        fireEvent.change(screen.getByLabelText("Or paste a full SHA"), { target: { value: historical } });
        await waitFor(() => expect(api.getSource).toHaveBeenCalledWith("p1", historical));
    });

    it("replays Identity from the configuration snapshot after enqueue", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await selectHistoryRun();
        fireEvent.click(await screen.findByRole("button", { name: /Identity/i }));
        expect(screen.getByRole("heading", { name: /Release identity/i })).toBeTruthy();
        expect(screen.queryByLabelText("Tag")).toBeNull();
        expect(screen.getAllByText("v1.0.0").length).toBeGreaterThan(0);
        expect(screen.getAllByText("USBPD-100").length).toBeGreaterThan(0);
    });

    it("keeps completed ticks when inspecting a finished run", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        const rail = screen.getByRole("navigation", { name: /run stages/i });
        const states = () => Array.from(rail.querySelectorAll("[data-state]")).map((node) => node.getAttribute("data-state"));
        expect(states()).toEqual(["done", "done", "done", "done", "done", "pending"]);
        fireEvent.click(within(rail).getByRole("button", { name: /Publish/i }));
        expect(states()).toEqual(["done", "done", "done", "done", "done", "pending"]);
        fireEvent.click(within(rail).getByRole("button", { name: /Outputs/i }));
        expect(states()).toEqual(["done", "done", "done", "done", "done", "pending"]);
    });

    it("ticks Publish when a finished run was published", async () => {
        vi.mocked(api.getBuild).mockResolvedValue({
            ...detail,
            build: { ...detail.build, published: true, published_tag: "v1.0.0" },
            approvals: { ...detail.approvals!, published: {
                id: "pub-1",
                build_id: "build-1",
                tag: "v1.0.0",
                commit_sha: "a".repeat(40),
                dossier_digest: "d".repeat(64),
                published_by: "designer@example.com",
                forge_url: "https://github.com/org/repo/releases/tag/v1.0.0",
                asset_names: [],
                created_at: "2026-08-14T00:00:00Z",
            } },
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        const rail = screen.getByRole("navigation", { name: /run stages/i });
        expect(Array.from(rail.querySelectorAll("[data-state]")).map((node) => node.getAttribute("data-state")))
            .toEqual(["done", "done", "done", "done", "done", "done"]);
    });

    it("replays Manufacturing from the nested configuration fields snapshot", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await selectHistoryRun();
        fireEvent.click(await screen.findByRole("button", { name: /Manufacturing/i }));
        expect(screen.getByRole("heading", { name: /Manufacturing and assembly/i })).toBeTruthy();
        expect(screen.queryByLabelText("Solder mask colour")).toBeNull();
        expect(screen.getByText("IPC-6012 Class 2")).toBeTruthy();
        expect(screen.getByText("IPC-A-610 Class 2")).toBeTruthy();
        expect(screen.getByText("Green")).toBeTruthy();
        expect(screen.getByText("White")).toBeTruthy();
        expect(screen.getByText("Tented")).toBeTruthy();
        expect(screen.getByText("jlcpcb")).toBeTruthy();
    });

    it("starts a build with identity and manufacturing fields", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await startRun();
        await waitFor(() => expect(api.startBuild).toHaveBeenCalledWith("p1", expect.objectContaining({
            commit_sha: "abcdef12abcdef12abcdef12abcdef12abcdef12",
            board: "board.kicad_pcb",
            schematic: "board.kicad_sch",
            identity: expect.objectContaining({ tag: "v1.0.0", document_name: "USBPD-100" }),
            manufacturing: expect.objectContaining({
                manufacturing_ipc_class: "IPC-6012 Class 2",
                assembly_ipc_class: "IPC-A-610 Class 2",
            }),
        })));
    });

    it("offers solder mask, silkscreen, and via treatment dropdowns", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await continueToManufacturing();
        expect(screen.getByLabelText("Solder mask colour")).toBeTruthy();
        expect(screen.getByLabelText("Silkscreen colour")).toBeTruthy();
        expect(screen.getByLabelText("Via treatment")).toBeTruthy();
        expect(screen.queryByRole("textbox", { name: /solder mask colour/i })).toBeNull();
    });

    it("lists composed documentation sheets as a dedicated preview surface", async () => {
        vi.mocked(api.listDocumentSheets).mockResolvedValue([
            {
                key: "fabrication",
                pdf: { path: "documentation/fabrication.pdf", released_digest: "b".repeat(64), media_type: "application/pdf" },
            },
        ]);
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        await waitFor(() =>
            expect(screen.getByRole("tab", { name: /Documents \(1\)/ })).toBeTruthy(),
        );
        expect(screen.getByRole("tab", { name: "Fabrication" })).toBeTruthy();
        expect(screen.getByRole("button", { name: /^PDF$/i })).toBeTruthy();
    });

    it("renders the GitHub Actions-style jobs rail from pipeline metadata", async () => {
        const { watchPrismJob } = await import("@/lib/jobs");
        vi.mocked(watchPrismJob).mockImplementation(async (_id, options) => {
            const job = {
                job_id: "job-1",
                kind: "release_studio_build",
                status: "running" as const,
                stage: "checks",
                message: "Running DRC",
                percent: 20,
                pipeline: {
                    jobs: [
                        {
                            id: "checks",
                            name: "Checks",
                            status: "in_progress" as const,
                            steps: [{ id: "drc", name: "DRC", status: "in_progress" as const }],
                        },
                    ],
                },
            };
            options?.onUpdate?.(job, []);
            await new Promise((resolve) => window.setTimeout(resolve, 80));
            const done = { ...job, status: "completed" as const, percent: 100 };
            options?.onUpdate?.(done, []);
            return done;
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await startRun();
        await waitFor(() => expect(screen.getByText("Checks")).toBeTruthy());
        expect(screen.getByText("DRC")).toBeTruthy();
    });

    it("starts a new run with no stage already ticked", async () => {
        const { watchPrismJob } = await import("@/lib/jobs");
        vi.mocked(watchPrismJob).mockImplementation(async (_id, options) => {
            const job = {
                job_id: "job-2",
                kind: "release_studio_build",
                status: "running" as const,
                stage: "documents",
                message: "Composing documentation",
                percent: 70,
                pipeline: { jobs: [] },
            };
            options?.onUpdate?.(job, []);
            await new Promise((resolve) => window.setTimeout(resolve, 60));
            return { ...job, status: "completed" as const, percent: 100 };
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await startRun();

        const rail = await screen.findByRole("navigation", { name: /run stages/i });
        await waitFor(() => expect(rail.textContent).toContain("running"));
        expect(rail.textContent).not.toContain("members");
        const states = Array.from(rail.querySelectorAll("[data-state]")).map((node) =>
            node.getAttribute("data-state"),
        );
        expect(states).toEqual(["done", "done", "done", "active", "locked", "locked"]);
    });

    it("offers a manufacturer pack picker driven by the registry", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        fireEvent.click(await screen.findByRole("tab", { name: /Members/i }));
        await waitFor(() => expect(screen.getByLabelText("Manufacturer")).toBeTruthy());
        expect(screen.getByRole("button", { name: /Download jlcpcb-upload.zip/i })).toBeDisabled();
    });

    it("shows missing vendor workbooks even when canonical outputs exist", async () => {
        vi.mocked(api.getBuild).mockResolvedValue({
            ...detail,
            members: [
                { id: "g", path: "fabrication/gerbers/top.gbr", member_kind: "gerber", media_type: "text/plain", size_bytes: 1, released_digest: "g", source_raw_digest: "g", canonicalizer: "text", domains: ["bare_board"] },
                { id: "d", path: "fabrication/drill/board.drl", member_kind: "drill", media_type: "text/plain", size_bytes: 1, released_digest: "d", source_raw_digest: "d", canonicalizer: "text", domains: ["bare_board"] },
                { id: "b", path: "manufacturing/vendors/jlcpcb/bom.csv", member_kind: "vendor_csv", media_type: "text/csv", size_bytes: 1, released_digest: "b", source_raw_digest: "b", canonicalizer: "csv", domains: ["assembly"] },
                { id: "c", path: "manufacturing/vendors/jlcpcb/cpl.csv", member_kind: "vendor_csv", media_type: "text/csv", size_bytes: 1, released_digest: "c", source_raw_digest: "c", canonicalizer: "csv", domains: ["assembly"] },
            ],
            vendor_readiness: [{ vendor_id: "jlcpcb", ready: false, missing_requirements: ["bom.xlsx", "cpl.xlsx"] }],
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        expect(screen.getByText("bom.csv").parentElement?.textContent).toContain("ready");
        expect(screen.getByText("bom.xlsx").parentElement?.textContent).toContain("missing");
        expect(screen.getByRole("button", { name: /Download jlcpcb-upload.zip/i })).toBeDisabled();
    });

    it("downloads build evidence from the authoritative build-evidence route", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        fireEvent.click(screen.getByRole("button", { name: /Build evidence/i }));
        await waitFor(() => expect(vi.mocked(api.downloadFile)).toHaveBeenCalledWith(
            "/api/projects/p1/release-studio/builds/build-1/build-evidence",
            "build-build-1-evidence.tar.gz",
        ));
    });

    it("surfaces build download failures through the workflow error state", async () => {
        vi.mocked(api.downloadFile).mockRejectedValueOnce(new Error("evidence download denied"));
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        fireEvent.click(screen.getByRole("button", { name: /Build evidence/i }));
        expect(await screen.findByText("evidence download denied")).toBeTruthy();
    });

    it("clears old detail immediately when switching to a failed attempt", async () => {
        const failed = {
            ...candidate.latest_build!,
            id: "build-failed",
            status: "failed" as const,
            attempt: 2,
            completed_at: "2026-08-12T00:00:00Z",
            error_message: "KiCad exited 1",
        };
        vi.mocked(api.listCandidates).mockResolvedValue([{ ...candidate, builds: [failed, candidate.latest_build!] }]);
        vi.mocked(api.getBuild).mockImplementation((_, buildId) =>
            buildId === "build-1" ? Promise.resolve(detail) : new Promise<BuildDetail>(() => {}),
        );
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        fireEvent.click(await screen.findByRole("button", { name: /^history$/i }));
        fireEvent.click(await screen.findByRole("button", { name: /succeeded.*attempt 1/i }));
        await waitFor(() => expect(screen.getByText("succeeded")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /failed.*attempt 2/i }));

        const rail = screen.getByRole("navigation", { name: /run stages/i });
        expect(within(rail).getByRole("button", { name: /Outputs/i })).toBeDisabled();
        expect(within(rail).getByRole("button", { name: /Publish/i })).toBeDisabled();
        expect(screen.queryByRole("button", { name: /^Continue$/i })).toBeNull();
        expect(screen.getByText("loading")).toBeTruthy();
    });

    it("fails closed when the selected revision cannot be read", async () => {
        vi.mocked(api.getSource).mockRejectedValue(new Error("immutable source lookup failed"));
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await waitFor(() => expect(screen.getByText(/immutable source lookup failed/i)).toBeTruthy());
        expect(screen.getByRole("button", { name: /^Continue$/i })).toBeDisabled();
    });

    it("treats a missing vendor readiness response as unavailable rather than ready", async () => {
        vi.mocked(api.getBuild).mockResolvedValue({ ...detail, vendor_readiness: undefined });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        expect(screen.getByText("gerber").parentElement?.textContent).toContain("unavailable");
        expect(screen.getByText("bom.csv").parentElement?.textContent).toContain("unavailable");
        expect(screen.getByRole("button", { name: /Download jlcpcb-upload.zip/i })).toBeDisabled();
    });

    it("refreshes history after a queued build fails and routes the selected attempt to logs", async () => {
        const failed = { ...candidate.latest_build!, id: "build-failed", job_id: "job-failed", status: "failed" as const, attempt: 2, completed_at: "2026-08-12T00:00:00Z", error_message: "KiCad failed" };
        const failedCandidate = { ...candidate, latest_build: failed, builds: [failed] };
        const { watchPrismJob, throwIfJobFailed } = await import("@/lib/jobs");
        vi.mocked(api.listCandidates).mockResolvedValueOnce([candidate]).mockResolvedValue([failedCandidate]);
        vi.mocked(api.getBuild).mockResolvedValue({ ...detail, build: failed, candidate: failedCandidate });
        vi.mocked(watchPrismJob).mockResolvedValue({ job_id: "job-failed", kind: "release_studio_build", status: "completed", stage: "build", message: "failed", percent: 100 });
        vi.mocked(api.startBuild).mockResolvedValueOnce({ job: { job_id: "job-failed" } });
        vi.mocked(throwIfJobFailed).mockImplementation(() => { throw new Error("The build failed."); });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await startRun();
        const rail = await screen.findByRole("navigation", { name: /run stages/i });
        await waitFor(() => expect(within(rail).getByRole("button", { name: /Build/i })).toHaveAttribute("data-state", "failed"));
        expect(within(rail).getByRole("button", { name: /Outputs/i })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: /^history$/i }));
        expect(await screen.findByRole("button", { name: /failed.*attempt 2/i })).toBeTruthy();
    });

    it("treats a cancelled build as terminal", async () => {
        const cancelled = { ...candidate.latest_build!, id: "build-cancelled", status: "cancelled" as const, attempt: 2, completed_at: "2026-08-12T00:00:00Z", error_message: "Cancelled by operator" };
        const cancelledCandidate = { ...candidate, latest_build: cancelled, builds: [cancelled] };
        vi.mocked(api.listCandidates).mockResolvedValue([cancelledCandidate]);
        vi.mocked(api.getBuild).mockResolvedValue({ ...detail, build: cancelled, candidate: cancelledCandidate });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);

        await selectHistoryRun();
        const rail = await screen.findByRole("navigation", { name: /run stages/i });
        await waitFor(() => expect(within(rail).getByRole("button", { name: /Build/i })).toHaveAttribute("data-state", "cancelled"));
        expect(within(rail).getByRole("button", { name: /Outputs/i })).toBeDisabled();
        expect(within(rail).getByRole("button", { name: /Publish/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /cancelled.*attempt 2/i })).toHaveAttribute("aria-current", "true");
        expect(await screen.findByText("Cancelled by operator")).toBeTruthy();
    });

    it("keeps a live log stream open and cancels the active job", async () => {
        const { watchPrismJob, cancelPrismJob } = await import("@/lib/jobs");
        vi.mocked(watchPrismJob).mockImplementation(async (_id, options) => {
            options?.onUpdate?.({
                job_id: "job-live", kind: "release_studio_build", status: "running",
                stage: "checks", message: "Running DRC", percent: 25,
                pipeline: { jobs: [{ id: "checks", name: "Checks", status: "in_progress", steps: [{ id: "drc", name: "DRC", status: "in_progress" }] }] },
            }, ["Starting release build", "Running DRC"]);
            return new Promise(() => {});
        });
        vi.mocked(api.startBuild).mockResolvedValueOnce({ job: { job_id: "job-live" } });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await startRun();
        expect(await screen.findByLabelText("Live build log")).toHaveTextContent("Running DRC");
        expect(screen.getByRole("progressbar", { name: /Release build progress/i })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Cancel build/i }));
        await waitFor(() => expect(cancelPrismJob).toHaveBeenCalledWith("job-live"));
    });

    it("selects outputs by the completed job identity instead of the previous run", async () => {
        const nextBuild = { ...candidate.latest_build!, id: "build-2", job_id: "job-2", completed_at: "2026-08-13T00:00:00Z" };
        const nextCandidate = { ...candidate, id: "cand-2", latest_build: nextBuild, builds: [nextBuild], created_at: "2026-08-13T00:00:00Z" };
        vi.mocked(api.listCandidates)
            .mockResolvedValueOnce([candidate])
            .mockResolvedValue([nextCandidate, candidate]);
        vi.mocked(api.startBuild).mockResolvedValueOnce({ job: { job_id: "job-2" } });
        const { watchPrismJob } = await import("@/lib/jobs");
        vi.mocked(watchPrismJob).mockResolvedValue({ job_id: "job-2", kind: "release_studio_build", status: "completed", stage: "package", message: "Done", percent: 100 });
        vi.mocked(api.getBuild).mockImplementation(async (_project, buildId) => ({
            ...detail,
            build: buildId === "build-2" ? nextBuild : candidate.latest_build!,
            candidate: buildId === "build-2" ? nextCandidate : candidate,
        }));
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await startRun();
        await waitFor(() => expect(api.getBuild).toHaveBeenCalledWith("p1", "build-2"));
        expect(window.location.search).toContain("build=build-2");
    });

    it("publishes a successful build as a GitHub Release without editing identity", async () => {
        vi.mocked(api.getBuild).mockResolvedValue({
            ...detail,
            vendor_readiness: [{ vendor_id: "jlcpcb", ready: true, missing_requirements: [] }],
            approvals: {
                ...detail.approvals!,
                both_approved: true,
                can_publish: true,
                blocked_reason: "",
                designer: {
                    id: "rev-1",
                    build_id: "build-1",
                    slot: "designer",
                    actor: "designer@example.com",
                    decision: "approved",
                    note: "",
                    dossier_digest: "d".repeat(64),
                    created_at: "2026-08-14T00:00:00Z",
                },
                qa: {
                    id: "rev-2",
                    build_id: "build-1",
                    slot: "qa",
                    actor: "qa@example.com",
                    decision: "approved",
                    note: "",
                    dossier_digest: "d".repeat(64),
                    created_at: "2026-08-14T00:00:01Z",
                },
            },
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
        expect(screen.queryByLabelText("Tag")).toBeNull();
        const publish = screen.getByRole("button", { name: /Hold to publish to GitHub/i });
        let now = 0;
        let frames: FrameRequestCallback[] = [];
        vi.spyOn(performance, "now").mockImplementation(() => now);
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frames.push(callback);
            return frames.length;
        });
        vi.stubGlobal("cancelAnimationFrame", () => {
            frames = [];
        });
        act(() => {
            publish.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
        });
        now = 1000;
        act(() => {
            const pending = frames;
            frames = [];
            pending.forEach((callback) => callback(now));
        });
        await waitFor(() => expect(vi.mocked(api.publishBuild)).toHaveBeenCalledWith(
            "p1",
            "build-1",
            { tag: "v1.0.0", title: "v1.0.0", notes: "" },
        ));
        expect(await screen.findByRole("link", { name: /github.com\/org\/repo\/releases\/tag\/v1/i })).toBeTruthy();
    });

    it("lists DRC, ERC, and closure warnings as stacked expandable lists", async () => {
        vi.mocked(api.memberJson).mockResolvedValue({
            violations: [
                { type: "clearance", severity: "error", description: "Pad to track clearance" },
                { type: "clearance", severity: "error", description: "Via to track clearance" },
                { type: "silk_overlap", severity: "warning", description: "Silkscreen overlap" },
            ],
        });
        vi.mocked(api.getBuild).mockResolvedValue({
            ...detail,
            build: {
                ...detail.build,
                warnings: [
                    "closure: USB-PD-Trigger-Board.kicad_pcb: C_0805_2012Metric.step resolves outside the release closure",
                    "DRC: 42 error-severity violations in this release",
                    "ERC: 4 error-severity violations in this release",
                ],
            },
            members: [{
                id: "drc",
                path: "evidence/drc.json",
                member_kind: "drc_report",
                media_type: "application/json",
                size_bytes: 1,
                released_digest: "d",
                source_raw_digest: "d",
                canonicalizer: "drc_erc_json",
                domains: ["evidence"],
            }],
            evidence: [
                { kind: "drc", report_digest: "d", counts: { error: 42, warning: 1, total: 84 } },
                { kind: "erc", report_digest: "e", counts: { error: 4 } },
            ],
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        fireEvent.mouseDown(screen.getByRole("tab", { name: /Evidence \(2\)/i }));
        expect(screen.queryByRole("combobox", { name: /Warning group/i })).toBeNull();
        expect(await screen.findByRole("button", { name: "DRC details" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "ERC details" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Closure details" })).toBeTruthy();
        expect(screen.getByText("Error: 42")).toBeTruthy();
        expect(await screen.findByText("Pad to track clearance")).toBeTruthy();
        expect(screen.getByText(/C_0805_2012Metric\.step is outside the closure/)).toBeTruthy();
    });

    it("marks published builds in history separately from succeeded builds", async () => {
        const publishedBuild = {
            ...candidate.latest_build!,
            published: true,
            published_tag: "v1.0.0",
        };
        vi.mocked(api.listCandidates).mockResolvedValue([{
            ...candidate,
            latest_build: publishedBuild,
            builds: [publishedBuild],
        }]);
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        fireEvent.click(await screen.findByRole("button", { name: /^history$/i }));
        const run = await screen.findByRole("button", { name: /succeeded.*attempt 1/i });
        expect(within(run).getByText("succeeded")).toBeTruthy();
        expect(within(run).getByText("published")).toBeTruthy();
    });

    it("renders designer and QA sign-off as separate pending cards", async () => {
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        expect(screen.getByText("Designer")).toBeTruthy();
        expect(screen.getByText("QA")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Approve Designer" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Approve QA" })).toBeNull();
        expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
    });

    it("shows an approved sign-off card after a designer decision", async () => {
        vi.mocked(api.getBuild).mockResolvedValue({
            ...detail,
            approvals: {
                ...detail.approvals!,
                designer: {
                    id: "rev-1",
                    build_id: "build-1",
                    slot: "designer",
                    actor: "designer@example.com",
                    decision: "approved",
                    note: "Looks good",
                    dossier_digest: "d".repeat(64),
                    created_at: "2026-08-14T00:00:00Z",
                },
                can_approve_designer: false,
                can_withdraw: true,
            },
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        expect(screen.getByText("Approved")).toBeTruthy();
        expect(screen.getByText("designer@example.com")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Withdraw Designer" })).toBeTruthy();
    });

    it("lets admin approve a slot when unwaived DRC errors remain", async () => {
        vi.mocked(api.getBuild).mockResolvedValue({
            ...detail,
            evidence: [{ kind: "drc", report_digest: "d", counts: { error: 42 } }],
            approvals: {
                ...detail.approvals!,
                electrical_errors: ["drc"],
                can_approve_designer: true,
                can_approve_qa: true,
            },
        });
        render(<ReleaseStudioPanel projectId="p1" canMutate />);
        await openOutputs();
        const approve = screen.getByRole("button", { name: "Approve Designer" });
        expect(approve).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Designer note"), { target: { value: "Waive DRC for proto" } });
        expect(approve).not.toBeDisabled();
        fireEvent.click(approve);
        await waitFor(() => expect(vi.mocked(api.approveBuild)).toHaveBeenCalledWith(
            "p1",
            "build-1",
            { slot: "designer", note: "Waive DRC for proto" },
        ));
    });
});
