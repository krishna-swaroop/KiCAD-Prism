import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRun = vi.fn();
const updateRun = vi.fn();
const updateRunStatus = vi.fn();
const deleteRun = vi.fn();
const logDefect = vi.fn();
const updateDefect = vi.fn();
const deleteDefect = vi.fn();
const uploadEvidence = vi.fn();
const deleteEvidence = vi.fn();
const previewSpecConfig = vi.fn();
const downloadRunReport = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getRun: (...a: unknown[]) => getRun(...a),
    updateRun: (...a: unknown[]) => updateRun(...a),
    updateRunStatus: (...a: unknown[]) => updateRunStatus(...a),
    deleteRun: (...a: unknown[]) => deleteRun(...a),
    logDefect: (...a: unknown[]) => logDefect(...a),
    updateDefect: (...a: unknown[]) => updateDefect(...a),
    deleteDefect: (...a: unknown[]) => deleteDefect(...a),
    uploadEvidence: (...a: unknown[]) => uploadEvidence(...a),
    deleteEvidence: (...a: unknown[]) => deleteEvidence(...a),
    previewSpecConfig: (...a: unknown[]) => previewSpecConfig(...a),
    downloadRunReport: (...a: unknown[]) => downloadRunReport(...a),
    evidenceUrl: (runId: string, digest: string) => `/api/x/${runId}/${digest}`,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const listCandidates = vi.fn();
import { resetReleaseLinkCache } from "./run-release-link";
vi.mock("@/components/release-studio/api", () => ({
    listCandidates: (...a: unknown[]) => listCandidates(...a),
}));

// Radix dialogs and menus need these in jsdom.
vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

import type { ManufacturingRun } from "@/types/manufacturing";
import { RunView } from "./run-view";
import { makeDefect, makeRun } from "./test-fixtures";

type Props = Partial<React.ComponentProps<typeof RunView>>;

function renderView(run: ManufacturingRun, props: Props = {}) {
    getRun.mockResolvedValue(run);
    const handlers = { onDeleted: vi.fn(), onChanged: vi.fn() };
    render(
        <MemoryRouter>
            <RunView
                runId={run.id}
                canEdit
                canLogDefects
                canChangeStatus
                {...handlers}
                {...props}
            />
        </MemoryRouter>,
    );
    return handlers;
}

const heading = (name: string) => screen.findByRole("heading", { name });
const openMenu = (name: string) => fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });

describe("RunView", () => {
    beforeEach(() => {
        resetReleaseLinkCache();
        listCandidates.mockResolvedValue([]);
        updateRun.mockResolvedValue(undefined);
        updateRunStatus.mockResolvedValue(undefined);
        updateDefect.mockResolvedValue(undefined);
        previewSpecConfig.mockResolvedValue({ sections: [], errors: [] });
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    describe("header and status", () => {
        it("titles the run by job number with the project, manufacturer and process beneath", async () => {
            renderView(makeRun());
            expect(await heading("JOB-2026-0001")).toBeTruthy();
            expect(screen.getByText(/Board One · Acme Fab · Standard/)).toBeTruthy();
        });

        it("shows the five-stage stepper and advances to the next status", async () => {
            renderView(makeRun({ status: "ordered" }));
            await heading("JOB-2026-0001");
            expect(screen.getByRole("list", { name: "Production status" })).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Mark as in production" }));
            await waitFor(() => expect(updateRunStatus).toHaveBeenCalledWith("run_1", "in_production"));
        });

        it("has no advance button once closed, only the status menu", async () => {
            renderView(makeRun({ status: "closed" }));
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("button", { name: /Mark as/ })).toBeNull();
            const setStatus = screen.getByRole("button", { name: "Set status" });
            expect(setStatus.textContent).toContain("Set status");
        });

        it("puts the advance button and the status arrow in one control", async () => {
            renderView(makeRun({ status: "ordered" }));
            await heading("JOB-2026-0001");
            const advance = screen.getByRole("button", { name: "Mark as in production" });
            const arrow = screen.getByRole("button", { name: "Set status" });
            expect(advance.parentElement).toBe(arrow.parentElement);
            // The status choices are not duplicated in the actions menu.
            openMenu("Production actions");
            expect(await screen.findByRole("menuitem", { name: /Delete production/ })).toBeTruthy();
            expect(screen.queryByRole("menuitemradio")).toBeNull();
        });

        it("lets QA correct the status from the arrow beside the advance button", async () => {
            renderView(makeRun({ status: "received" }));
            await heading("JOB-2026-0001");
            openMenu("Set status");
            expect(await screen.findAllByRole("menuitemradio")).toHaveLength(6);
            expect(screen.getByRole("menuitemradio", { name: "Received" }).getAttribute("aria-checked")).toBe("true");
            fireEvent.click(screen.getByRole("menuitemradio", { name: "Ordered" }));
            await waitFor(() => expect(updateRunStatus).toHaveBeenCalledWith("run_1", "ordered"));
        });

        it("offers Cancelled in the status menu, apart from the lifecycle", async () => {
            renderView(makeRun({ status: "ordered" }));
            await heading("JOB-2026-0001");
            openMenu("Set status");
            const items = await screen.findAllByRole("menuitemradio");
            expect(items.map((i) => i.textContent)).toEqual([
                "Draft", "Ordered", "In production", "Received", "Closed", "Cancelled",
            ]);
            fireEvent.click(screen.getByRole("menuitemradio", { name: "Cancelled" }));
            await waitFor(() => expect(updateRunStatus).toHaveBeenCalledWith("run_1", "cancelled"));
        });

        it("keeps cancelled off the progress bar", async () => {
            renderView(makeRun({ status: "ordered" }));
            await heading("JOB-2026-0001");
            const stages = screen.getByRole("list", { name: "Production status" });
            expect(within(stages).getAllByRole("listitem")).toHaveLength(5);
            expect(within(stages).queryByText(/Cancelled/)).toBeNull();
        });

        it("replaces the progress bar with a note on a cancelled production", async () => {
            renderView(makeRun({ status: "cancelled" }));
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("list", { name: "Production status" })).toBeNull();
            expect(screen.getByText(/This production was cancelled/)).toBeTruthy();
            // No next stage to advance to, but QA can still set the status, to reinstate it.
            expect(screen.queryByRole("button", { name: /Mark as/ })).toBeNull();
            openMenu("Set status");
            fireEvent.click(await screen.findByRole("menuitemradio", { name: "Draft" }));
            await waitFor(() => expect(updateRunStatus).toHaveBeenCalledWith("run_1", "draft"));
        });

        it("shows status read-only without QA rights", async () => {
            renderView(makeRun(), { canChangeStatus: false });
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("button", { name: /Mark as/ })).toBeNull();
            expect(screen.queryByRole("button", { name: "Set status" })).toBeNull();
            expect(screen.getAllByText("Received").length).toBeGreaterThan(0);
        });

        it("tells the host about each change", async () => {
            const { onChanged } = renderView(makeRun({ status: "draft" }));
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: "Mark as ordered" }));
            await waitFor(() => expect(onChanged).toHaveBeenCalled());
        });

        it("deletes a production after a held confirmation", async () => {
            deleteRun.mockResolvedValue(undefined);
            renderView(makeRun());
            await heading("JOB-2026-0001");
            openMenu("Production actions");
            fireEvent.click(await screen.findByRole("menuitem", { name: /Delete production/ }));
            expect(await screen.findByText("Delete production?")).toBeTruthy();
            expect(deleteRun).not.toHaveBeenCalled();
        });

        it("hides the delete menu without edit rights, but QA keeps the status control", async () => {
            renderView(makeRun(), { canEdit: false, canChangeStatus: true });
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("button", { name: "Production actions" })).toBeNull();
            expect(screen.getByRole("button", { name: "Set status" })).toBeTruthy();
        });

        it("links to the project's Manufacturing page from the header", async () => {
            renderView(makeRun());
            await heading("JOB-2026-0001");
            const link = screen.getByRole("link", { name: "Open Board One manufacturing page" });
            expect(link.getAttribute("href")).toBe("/project/p1?section=manufacturing");
        });

        it("leaves that link out when asked, as inside that page itself", async () => {
            renderView(makeRun(), { projectLink: false });
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("link", { name: /manufacturing page/ })).toBeNull();
        });

        it("has no full-page button", async () => {
            renderView(makeRun());
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("button", { name: /full page/i })).toBeNull();
        });
    });

    it("lists the spec before the defects", async () => {
        renderView(makeRun({ defects: [makeDefect()] }));
        await heading("JOB-2026-0001");
        const spec = screen.getByRole("button", { name: /Spec at the time of order/ });
        const defects = screen.getByRole("region", { name: "Defects" });
        expect(spec.compareDocumentPosition(defects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    describe("quantities and details", () => {
        it("shows ordered, good, affected units and yield", async () => {
            renderView(makeRun({ quantity_ordered: 100, quantity_good: 90, defects: [makeDefect({ quantity_affected: 4 })] }));
            await heading("JOB-2026-0001");
            expect(screen.getByText("100")).toBeTruthy();
            expect(screen.getByText("90")).toBeTruthy();
            expect(screen.getByText("90%")).toBeTruthy();
            expect(screen.getByText("Affected units").parentElement?.textContent).toContain("4");
        });

        it("edits the good count through the pencil", async () => {
            renderView(makeRun());
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: "Edit Good" }));
            const input = screen.getByLabelText("Good") as HTMLInputElement;
            fireEvent.change(input, { target: { value: "88" } });
            fireEvent.keyDown(input, { key: "Enter" });
            await waitFor(() => expect(updateRun).toHaveBeenCalledWith("run_1", { quantity_good: 88 }));
        });

        it("lists the facts, linking the release to its package in Release Studio", async () => {
            const build = (id: string, status: string, completed_at: string) => ({ id, status, completed_at });
            listCandidates.mockResolvedValue([
                { commit_sha: "ffff000", builds: [build("b_other", "succeeded", "2026-10-09T12:00:00Z")] },
                {
                    commit_sha: "abcdef1234567",
                    builds: [
                        build("b_failed", "failed", "2026-10-09T11:00:00Z"),
                        build("b_new", "succeeded", "2026-10-09T10:00:00Z"),
                        build("b_old", "succeeded", "2026-10-08T10:00:00Z"),
                    ],
                },
            ]);
            renderView(makeRun({ release_tag: "v1.2", commit_sha: "abcdef1234567" }));
            await heading("JOB-2026-0001");
            const details = screen.getByRole("region", { name: "Details" });
            expect(within(details).getByText("Acme Fab")).toBeTruthy();
            expect(within(details).getByText("abcdef1")).toBeTruthy();
            const link = within(details).getByRole("link", { name: /v1.2/ });
            // The newest successful build of the run's commit.
            await waitFor(() => expect(link.getAttribute("href")).toBe("/project/p1?section=release-studio&build=b_new&stage=outputs"));
        });

        it("links to Release Studio itself when the commit was never built", async () => {
            listCandidates.mockResolvedValue([]);
            renderView(makeRun({ release_tag: "v1.2", commit_sha: "abcdef1234567" }));
            await heading("JOB-2026-0001");
            const link = within(screen.getByRole("region", { name: "Details" })).getByRole("link", { name: /v1.2/ });
            await waitFor(() => expect(listCandidates).toHaveBeenCalledWith("p1"));
            expect(link.getAttribute("href")).toBe("/project/p1?section=release-studio");
        });

        it("shows the run's notes and saves an edit on blur", async () => {
            renderView(makeRun({ notes: "Rush order" }));
            const notes = (await screen.findByLabelText("Notes")) as HTMLTextAreaElement;
            expect(notes.value).toBe("Rush order");
            fireEvent.change(notes, { target: { value: "Rush order, ship DHL" } });
            fireEvent.blur(notes);
            await waitFor(() => expect(updateRun).toHaveBeenCalledWith("run_1", { notes: "Rush order, ship DHL" }));
        });

        it("shows notes as text without edit rights", async () => {
            renderView(makeRun({ notes: "Rush order" }), { canEdit: false, canLogDefects: false, canChangeStatus: false });
            expect(await screen.findByText("Rush order")).toBeTruthy();
            expect(screen.queryByLabelText("Notes")).toBeNull();
        });

        it("shows no notes panel to a reader when there are none", async () => {
            renderView(makeRun({ notes: "" }), { canEdit: false });
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("heading", { name: "Notes" })).toBeNull();
        });
    });

    describe("defects", () => {
        const open = makeDefect({ id: "d_open", description: "cold joints" });
        const resolved = makeDefect({
            id: "d_res", description: "bridged pins", status: "resolved",
            resolution_note: "reflowed", resolved_by: "qa@x", resolved_at: "2026-01-04T00:00:00Z",
        });
        const accepted = makeDefect({
            id: "d_acc", description: "scuffed silkscreen", severity: "aesthetic", status: "accepted",
            resolution_note: "cosmetic only", resolved_by: "designer@x", resolved_at: "2026-01-05T00:00:00Z",
        });

        it("explains an empty list and offers to log one", async () => {
            renderView(makeRun());
            await heading("JOB-2026-0001");
            expect(screen.getByText("No defects logged.")).toBeTruthy();
            expect(screen.getAllByRole("button", { name: /Log defect/ }).length).toBeGreaterThan(0);
        });

        it("logs a defect through the dialog", async () => {
            logDefect.mockResolvedValue({ id: "def_new" });
            renderView(makeRun());
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getAllByRole("button", { name: /Log defect/ })[0]);
            fireEvent.change(await screen.findByLabelText("Units affected"), { target: { value: "3" } });
            fireEvent.change(screen.getByLabelText("Description"), { target: { value: "bad solder" } });
            fireEvent.click(screen.getAllByRole("button", { name: "Log defect" }).at(-1)!);
            await waitFor(() =>
                expect(logDefect).toHaveBeenCalledWith("run_1", expect.objectContaining({ quantity_affected: 3, description: "bad solder" })),
            );
        });

        it("filters defects by open, resolved and all, with counts", async () => {
            renderView(makeRun({ defects: [open, resolved, accepted] }));
            await heading("JOB-2026-0001");
            const filter = screen.getByRole("radiogroup", { name: "Filter defects" });
            expect(within(filter).getByRole("radio", { name: "Open 1" })).toBeTruthy();
            expect(within(filter).getByRole("radio", { name: "Resolved 2" })).toBeTruthy();
            expect(screen.getByText("cold joints")).toBeTruthy();
            expect(screen.getByText("bridged pins")).toBeTruthy();

            fireEvent.click(within(filter).getByRole("radio", { name: "Open 1" }));
            expect(screen.getByText("cold joints")).toBeTruthy();
            expect(screen.queryByText("bridged pins")).toBeNull();

            fireEvent.click(within(filter).getByRole("radio", { name: "Resolved 2" }));
            expect(screen.queryByText("cold joints")).toBeNull();
            expect(screen.getByText("scuffed silkscreen")).toBeTruthy();
        });

        it("shows the resolution note and who closed a defect", async () => {
            renderView(makeRun({ defects: [resolved, accepted] }));
            await heading("JOB-2026-0001");
            expect(screen.getByText("reflowed")).toBeTruthy();
            expect(screen.getByText("cosmetic only")).toBeTruthy();
            expect(screen.getByText("cosmetic only").closest("p")?.textContent).toContain("designer@x");
            expect(screen.getByText("reflowed").closest("p")?.textContent).toContain("qa@x");
            expect(screen.getByText("Accepted as is")).toBeTruthy();
        });

        it("resolves a defect with an optional note", async () => {
            renderView(makeRun({ defects: [open] }));
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
            const resolve = await screen.findByRole("button", { name: "Resolve", hidden: false });
            expect(resolve).toBeTruthy();
            fireEvent.change(await screen.findByLabelText("Note (optional)"), { target: { value: "reflowed" } });
            fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Resolve" }));
            await waitFor(() =>
                expect(updateDefect).toHaveBeenCalledWith("d_open", { status: "resolved", resolution_note: "reflowed" }),
            );
        });

        it("resolves without a note when none is given", async () => {
            renderView(makeRun({ defects: [open] }));
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
            fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Resolve" }));
            await waitFor(() => expect(updateDefect).toHaveBeenCalledWith("d_open", { status: "resolved" }));
        });

        it("will not accept a defect as is without a reason", async () => {
            renderView(makeRun({ defects: [open] }));
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: "Accept as is" }));
            const dialog = await screen.findByRole("dialog");
            const accept = within(dialog).getByRole("button", { name: "Accept as is" });
            expect(accept).toHaveProperty("disabled", true);

            fireEvent.change(within(dialog).getByLabelText("Why is this acceptable?"), { target: { value: "  " } });
            expect(accept).toHaveProperty("disabled", true);
            fireEvent.change(within(dialog).getByLabelText("Why is this acceptable?"), { target: { value: "cosmetic only" } });
            expect(accept).toHaveProperty("disabled", false);
            fireEvent.click(accept);
            await waitFor(() =>
                expect(updateDefect).toHaveBeenCalledWith("d_open", { status: "accepted", resolution_note: "cosmetic only" }),
            );
        });

        it("reopens a closed defect", async () => {
            renderView(makeRun({ defects: [resolved] }));
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
            await waitFor(() => expect(updateDefect).toHaveBeenCalledWith("d_res", { status: "open" }));
        });

        it("deletes a defect from its menu, after confirming", async () => {
            deleteDefect.mockResolvedValue(undefined);
            renderView(makeRun({ defects: [open] }));
            await heading("JOB-2026-0001");
            openMenu("Defect actions");
            fireEvent.click(await screen.findByRole("menuitem", { name: /Delete defect/ }));
            expect(deleteDefect).not.toHaveBeenCalled();
            fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
            await waitFor(() => expect(deleteDefect).toHaveBeenCalledWith("d_open"));
        });

        it("confirms before removing evidence", async () => {
            const evidence = [{ kind: "photo" as const, filename: "joint.jpg", digest: "abc", media_type: "image/jpeg", size: 10 }];
            deleteEvidence.mockResolvedValue(undefined);
            renderView(makeRun({ defects: [makeDefect({ evidence })] }));
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: "Remove joint.jpg" }));
            expect(deleteEvidence).not.toHaveBeenCalled();
            fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
            await waitFor(() => expect(deleteEvidence).toHaveBeenCalledWith("def_1", "abc"));
        });

        it("hides defect actions from viewers", async () => {
            renderView(makeRun({ defects: [open] }), { canLogDefects: false });
            await heading("JOB-2026-0001");
            expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
            expect(screen.queryByRole("button", { name: /Log defect/ })).toBeNull();
            expect(screen.queryByRole("button", { name: "Defect actions" })).toBeNull();
        });
    });

    describe("spec at the time of order", () => {
        const snapshot = {
            spec_config: "x",
            specs: { layer_count: 4, thickness: 1.6 },
            active_sections: [],
        };
        const parsed = {
            sections: [
                {
                    title: "Board", optional: false, when: null,
                    fields: [
                        { key: "layer_count", label: "Layer count", type: "int", unit: "", options: [], default: null, when: null },
                        { key: "thickness", label: "Thickness", type: "number", unit: "mm", options: [], default: null, when: null },
                    ],
                },
            ],
            errors: [],
        };

        it("is folded away until opened, then shows values with their units", async () => {
            previewSpecConfig.mockResolvedValue(parsed);
            renderView(makeRun({ spec_snapshot: snapshot }));
            await heading("JOB-2026-0001");
            expect(screen.queryByText("Layer count")).toBeNull();

            fireEvent.click(screen.getByRole("button", { name: /Spec at the time of order/ }));
            expect(await screen.findByText("Layer count")).toBeTruthy();
            expect(screen.getByText("1.6 mm")).toBeTruthy();
        });

        it("says so when no spec was recorded", async () => {
            renderView(makeRun({ spec_snapshot: {} }));
            await heading("JOB-2026-0001");
            fireEvent.click(screen.getByRole("button", { name: /Spec at the time of order/ }));
            expect(await screen.findByText("No spec was recorded for this run.")).toBeTruthy();
        });
    });

    it("says when the production cannot be found", async () => {
        getRun.mockResolvedValue(null);
        render(
            <MemoryRouter>
                <RunView runId="gone" canEdit canLogDefects canChangeStatus onDeleted={vi.fn()} />
            </MemoryRouter>,
        );
        expect(await screen.findByText("Production not found.")).toBeTruthy();
    });
});
