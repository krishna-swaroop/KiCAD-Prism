import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manufacturer } from "@/types/manufacturing";
import { makeRun } from "./test-fixtures";

const createManufacturer = vi.fn();
const updateManufacturer = vi.fn();
const deleteManufacturer = vi.fn();
const listTemplates = vi.fn();
const updateTemplate = vi.fn();
const deleteTemplate = vi.fn();
const getPcbRuleFields = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    createManufacturer: (...a: unknown[]) => createManufacturer(...a),
    updateManufacturer: (...a: unknown[]) => updateManufacturer(...a),
    deleteManufacturer: (...a: unknown[]) => deleteManufacturer(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    updateTemplate: (...a: unknown[]) => updateTemplate(...a),
    getPcbRuleFields: (...a: unknown[]) => getPcbRuleFields(...a),
    getTemplate: vi.fn(async () => ({ id: "tpl_1", spec_config: "", capability_config: "" })),
    createTemplate: vi.fn(),
    deleteTemplate: (...a: unknown[]) => deleteTemplate(...a),
    previewSpecConfig: vi.fn(async () => ({ sections: [], errors: [] })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// Capture the tabs the panel passes to the unified dialog so a test can drive a
// tab's save directly and assert what it persists.
let lastTabs: Array<{ id: string; label: string; save: (t: string) => Promise<unknown>; disabledNote?: string }> = [];
vi.mock("./spec-config-editor", () => ({
    SchemaCapabilitiesDialog: (props: { tabs: typeof lastTabs; title: string }) => {
        lastTabs = props.tabs;
        return <div>editor:{props.title}</div>;
    },
}));

// Radix Dialog and menus need these in jsdom.
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

import { ManufacturersPanel } from "./manufacturers-panel";

const RULE_FIELDS = [
    { key: "min_track_width", label: "Min track width", type: "number", unit: "mm" },
    { key: "min_via_diameter", label: "Min via diameter", type: "number", unit: "mm" },
];

const acme: Manufacturer = {
    id: "m1", name: "Acme Fab", contact: "sales@acme.test", website: "acme.test", notes: "Net 30.",
    created_at: "", updated_at: "", process_count: 2, project_count: 1,
    projects: [{ id: "p1", name: "Board One" }],
};
const beta: Manufacturer = {
    id: "m2", name: "Beta Fab", contact: "", website: "https://beta.test", notes: "",
    created_at: "", updated_at: "", process_count: 0, project_count: 0, projects: [],
};

const standard = {
    id: "tpl_1", manufacturer_id: "m1", manufacturer_name: "Acme Fab", name: "Standard",
    spec_config: "", capabilities: { min_track_width: 0.1, min_via_diameter: 0.25 },
    project_count: 1, created_at: "", updated_at: "",
};
const advanced = {
    id: "tpl_2", manufacturer_id: "m1", manufacturer_name: "Acme Fab", name: "Advanced",
    spec_config: "", capabilities: {}, project_count: 0, created_at: "", updated_at: "",
};

function renderPanel(props: Partial<React.ComponentProps<typeof ManufacturersPanel>> = {}) {
    const handlers = { onChanged: vi.fn(), onOpenRun: vi.fn(), onAddOpenChange: vi.fn() };
    render(
        <MemoryRouter>
            <ManufacturersPanel manufacturers={[acme, beta]} canEdit {...handlers} {...props} />
        </MemoryRouter>,
    );
    return handlers;
}

describe("ManufacturersPanel", () => {
    beforeEach(() => {
        listTemplates.mockImplementation(async (id: string) => (id === "m1" ? [standard, advanced] : []));
        getPcbRuleFields.mockResolvedValue({ fields: RULE_FIELDS });
        updateManufacturer.mockResolvedValue(undefined);
        updateTemplate.mockResolvedValue(undefined);
        deleteTemplate.mockResolvedValue(undefined);
        deleteManufacturer.mockResolvedValue(undefined);
        createManufacturer.mockResolvedValue({ id: "m_new" });
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    describe("the list", () => {
        it("lists the manufacturers with their process and project counts", () => {
            renderPanel();
            const nav = screen.getByRole("navigation", { name: "Manufacturers" });
            expect(within(nav).getByText("2 processes · 1 project")).toBeTruthy();
            expect(within(nav).getByText("0 processes · 0 projects")).toBeTruthy();
        });

        it("selects the first manufacturer and switches on click", async () => {
            renderPanel();
            expect(await screen.findByRole("heading", { name: "Acme Fab", level: 2 })).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: /Beta Fab/ }));
            expect(await screen.findByRole("heading", { name: "Beta Fab", level: 2 })).toBeTruthy();
            expect(listTemplates).toHaveBeenCalledWith("m2");
        });

        it("filters by name", () => {
            renderPanel();
            fireEvent.change(screen.getByLabelText("Search manufacturers"), { target: { value: "bet" } });
            const nav = screen.getByRole("navigation", { name: "Manufacturers" });
            expect(within(nav).queryByText("Acme Fab")).toBeNull();
            expect(within(nav).getByText("Beta Fab")).toBeTruthy();
            fireEvent.change(screen.getByLabelText("Search manufacturers"), { target: { value: "zzz" } });
            expect(within(nav).getByText("No match.")).toBeTruthy();
        });

        it("explains an empty directory and offers to add", () => {
            const { onAddOpenChange } = renderPanel({ manufacturers: [] });
            expect(screen.getByText(/No manufacturers yet/)).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: /Add manufacturer/ }));
            expect(screen.getByRole("dialog", { name: "Add manufacturer" })).toBeTruthy();
            expect(onAddOpenChange).not.toHaveBeenCalled();
        });
    });

    it("scrolls the list and the detail in the themed scrollbar", async () => {
        renderPanel();
        await screen.findByRole("heading", { name: "Acme Fab", level: 2 });
        const nav = screen.getByRole("navigation", { name: "Manufacturers" });
        expect(nav.querySelector("ul")!.className).toContain("themed-scrollbar");
        expect(screen.getByRole("heading", { name: "Acme Fab", level: 2 }).closest("header")!.parentElement!.className).toContain(
            "themed-scrollbar",
        );
    });

    describe("the detail", () => {
        it("shows the contact, a clickable website and the notes", async () => {
            renderPanel();
            const link = await screen.findByRole("link", { name: /acme.test/ });
            expect(link.getAttribute("href")).toBe("https://acme.test");
            expect(screen.getByText("sales@acme.test")).toBeTruthy();
            expect(screen.getByText("Net 30.")).toBeTruthy();
        });

        it("keeps a website that already has a scheme", async () => {
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: /Beta Fab/ }));
            expect((await screen.findByRole("link", { name: /beta.test/ })).getAttribute("href")).toBe("https://beta.test");
        });

        it("shows every process as a card with its key minimums and who uses it", async () => {
            renderPanel();
            const processes = await screen.findByRole("region", { name: "Processes" });
            const standardCard = (await within(processes).findByRole("heading", { name: "Standard" })).closest("article")!;
            expect(within(standardCard).getByText("Min track width")).toBeTruthy();
            expect(within(standardCard).getByText("0.1 mm")).toBeTruthy();
            expect(within(standardCard).getByText("0.25 mm")).toBeTruthy();
            expect(within(standardCard).getByText("Used by 1 project")).toBeTruthy();

            const advancedCard = within(processes).getByRole("heading", { name: "Advanced" }).closest("article")!;
            expect(within(advancedCard).getByText("No capabilities set.")).toBeTruthy();
            expect(within(advancedCard).getByText("Not used by any project")).toBeTruthy();
        });

        it("says when a manufacturer has no processes", async () => {
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: /Beta Fab/ }));
            expect(await screen.findByText(/No processes yet/)).toBeTruthy();
        });

        it("lists the projects using it, linking to their Manufacturing tab", async () => {
            renderPanel();
            const projects = await screen.findByRole("region", { name: "Projects" });
            expect(within(projects).getByRole("link", { name: "Board One" }).getAttribute("href")).toBe(
                "/project/p1?section=manufacturing",
            );
        });

        it("says so when no project uses it", async () => {
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: /Beta Fab/ }));
            expect(await screen.findByText(/No project has this manufacturer attached/)).toBeTruthy();
        });
    });

    describe("scorecard and recent production", () => {
        const runs = [
            makeRun({ id: "r1", job_number: "JOB-1", status: "closed", quantity_ordered: 100, quantity_good: 98, defect_severity_counts: { major: 1 }, updated_at: "2026-01-02T00:00:00Z" }),
            makeRun({ id: "r2", job_number: "JOB-2", status: "received", quantity_ordered: 50, quantity_good: 49, defect_severity_counts: { minor: 2 }, updated_at: "2026-02-02T00:00:00Z" }),
            makeRun({ id: "r3", job_number: "JOB-OTHER", manufacturer_id: "m2", manufacturer_name: "Beta Fab" }),
        ];

        it("summarises this manufacturer's productions only", async () => {
            renderPanel({ runs });
            const card = await screen.findByRole("region", { name: "Scorecard" });
            expect(within(card).getByText("Productions").nextElementSibling?.textContent).toBe("2");
            expect(within(card).getByText("Units ordered").nextElementSibling?.textContent).toBe("150");
            expect(within(card).getByText("Yield").nextElementSibling?.textContent).toBe("98%");
            expect(within(card).getByText("Defects").nextElementSibling?.textContent).toBe("3");
            expect(within(card).getByText("1 major, 2 minor")).toBeTruthy();
        });

        it("says when there is nothing to score yet", async () => {
            renderPanel({ runs: [] });
            expect(await screen.findByText("No productions with Acme Fab yet.")).toBeTruthy();
        });

        it("lists recent production newest first and opens one", async () => {
            const { onOpenRun } = renderPanel({ runs });
            const recent = await screen.findByRole("region", { name: "Recent production" });
            const buttons = within(recent).getAllByRole("button");
            expect(buttons[0].textContent).toContain("JOB-2");
            expect(within(recent).queryByText("JOB-OTHER")).toBeNull();
            fireEvent.click(buttons[0]);
            expect(onOpenRun).toHaveBeenCalledWith("r2");
        });

        it("links to the full filtered list when there is more than the recent few", async () => {
            const many = Array.from({ length: 7 }, (_, i) => makeRun({ id: `r${i}`, job_number: `JOB-${i}` }));
            renderPanel({ runs: many });
            const link = await screen.findByRole("link", { name: "View all 7" });
            expect(link.getAttribute("href")).toBe("/?section=manufacturing&status=all&q=Acme%20Fab");
        });
    });

    describe("editing", () => {
        const openActions = (name: string) => fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });

        it("edits a process through a unified Fields + Capabilities dialog", async () => {
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: "Edit Standard" }));
            await waitFor(() => expect(lastTabs.length).toBe(2));
            expect(lastTabs.map((t) => t.label)).toEqual(["Fields", "Capabilities"]);
            expect(screen.getByText("editor:Edit process: Standard")).toBeTruthy();
        });

        it("saves capability .config text from the Capabilities tab", async () => {
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: "Edit Standard" }));
            await waitFor(() => expect(lastTabs.length).toBe(2));

            const capTab = lastTabs.find((t) => t.id === "capabilities")!;
            await capTab.save("[Board rules]\nmin_track_width: number = 0.09 | Min track (mm)\n");
            expect(updateTemplate).toHaveBeenCalledWith("tpl_1", {
                capability_config: "[Board rules]\nmin_track_width: number = 0.09 | Min track (mm)\n",
            });
        });

        it("starts a new process, whose capabilities wait for a first save", async () => {
            renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: /New process/ }));
            await waitFor(() => expect(lastTabs.length).toBe(2));
            expect(screen.getByText("editor:New Acme Fab process")).toBeTruthy();
            expect(lastTabs.find((t) => t.id === "capabilities")!.disabledNote).toMatch(/Save the process first/);
        });

        it("deletes a process after confirming", async () => {
            const { onChanged } = renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: "Delete Advanced" }));
            expect(deleteTemplate).not.toHaveBeenCalled();
            expect(screen.getByText(/keep their form fields but lose its capabilities/)).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Delete" }));
            await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith("tpl_2"));
            await waitFor(() => expect(onChanged).toHaveBeenCalled());
        });

        it("edits the manufacturer's details", async () => {
            const { onChanged } = renderPanel();
            fireEvent.click(await screen.findByRole("button", { name: /^Edit$/ }));
            const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
            expect(name.value).toBe("Acme Fab");
            fireEvent.change(name, { target: { value: "Acme Fabrication" } });
            fireEvent.click(screen.getByRole("button", { name: "Save" }));
            await waitFor(() =>
                expect(updateManufacturer).toHaveBeenCalledWith("m1", expect.objectContaining({ name: "Acme Fabrication" })),
            );
            await waitFor(() => expect(onChanged).toHaveBeenCalled());
        });

        it("adds a manufacturer from the parent header and selects it", async () => {
            const { onAddOpenChange, onChanged } = renderPanel({ addOpen: true });
            fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Fresh Fab" } });
            fireEvent.click(screen.getByRole("button", { name: "Save" }));
            await waitFor(() => expect(createManufacturer).toHaveBeenCalledWith(expect.objectContaining({ name: "Fresh Fab" })));
            await waitFor(() => expect(onAddOpenChange).toHaveBeenCalledWith(false));
            expect(onChanged).toHaveBeenCalled();
        });

        it("deletes a manufacturer from its menu, after confirming", async () => {
            const { onChanged } = renderPanel();
            await screen.findByRole("heading", { name: "Acme Fab", level: 2 });
            openActions("Actions for Acme Fab");
            fireEvent.click(await screen.findByRole("menuitem", { name: /Delete manufacturer/ }));
            expect(deleteManufacturer).not.toHaveBeenCalled();
            fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
            await waitFor(() => expect(deleteManufacturer).toHaveBeenCalledWith("m1"));
            await waitFor(() => expect(onChanged).toHaveBeenCalled());
        });

        it("hides every edit control from viewers", async () => {
            renderPanel({ canEdit: false });
            await screen.findByRole("heading", { name: "Acme Fab", level: 2 });
            expect(screen.queryByRole("button", { name: /^Edit$/ })).toBeNull();
            expect(screen.queryByRole("button", { name: /New process/ })).toBeNull();
            expect(screen.queryByRole("button", { name: "Edit Standard" })).toBeNull();
            expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
        });
    });
});
