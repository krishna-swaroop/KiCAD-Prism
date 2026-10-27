import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FILTERS, type ProductionFilters } from "./production-filters";
import { ProductionList } from "./production-list";
import { resetReleaseLinkCache } from "./run-release-link";
import { makeRun } from "./test-fixtures";

const listCandidates = vi.fn();
vi.mock("@/components/release-studio/api", () => ({
    listCandidates: (...a: unknown[]) => listCandidates(...a),
}));

// Radix menus need these in jsdom.
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

const RUNS = [
    makeRun({ id: "a", job_number: "JOB-0001", status: "draft", updated_at: "2026-01-01T00:00:00Z" }),
    makeRun({ id: "b", job_number: "JOB-0002", status: "in_production", manufacturer_name: "Beta Fab", open_defect_count: 2, updated_at: "2026-03-01T00:00:00Z" }),
    makeRun({ id: "c", job_number: "JOB-0003", status: "closed", updated_at: "2026-02-01T00:00:00Z" }),
    makeRun({ id: "x", job_number: "JOB-0004", status: "cancelled", updated_at: "2026-02-02T00:00:00Z" }),
];

function renderList(props: Partial<React.ComponentProps<typeof ProductionList>> = {}) {
    const onOpen = vi.fn();
    const onFiltersChange = vi.fn();
    const utils = render(
        <MemoryRouter>
            <ProductionList
                runs={RUNS}
                filters={DEFAULT_FILTERS}
                onFiltersChange={onFiltersChange}
                onOpen={onOpen}
                {...props}
            />
        </MemoryRouter>,
    );
    return { onOpen, onFiltersChange, ...utils };
}

describe("ProductionList", () => {
    beforeEach(() => {
        resetReleaseLinkCache();
        listCandidates.mockReset();
        listCandidates.mockResolvedValue([]);
    });

    afterEach(cleanup);

    it("shows the active runs by default and counts every status on its chip", () => {
        renderList();
        expect(screen.getByText("JOB-0001")).toBeTruthy();
        expect(screen.getByText("JOB-0002")).toBeTruthy();
        expect(screen.queryByText("JOB-0003")).toBeNull();

        const chips = screen.getByRole("group", { name: "Filter by status" });
        expect(within(chips).getByRole("button", { name: /^Active 2$/ }).getAttribute("aria-pressed")).toBe("true");
        expect(within(chips).getByRole("button", { name: /^Closed 1$/ })).toBeTruthy();
        expect(within(chips).getByRole("button", { name: /^Cancelled 1$/ })).toBeTruthy();
        expect(within(chips).getByRole("button", { name: /^All 4$/ })).toBeTruthy();
        // Cancelled runs are not active, so they stay out of the default list.
        expect(screen.queryByText("JOB-0004")).toBeNull();
    });

    it("lists cancelled runs under their own chip, with a cancelled badge", () => {
        renderList({ filters: { ...DEFAULT_FILTERS, status: "cancelled" } });
        const row = screen.getByText("JOB-0004").closest("[data-run-row]") as HTMLElement;
        expect(within(row).getByText("Cancelled")).toBeTruthy();
        expect(screen.queryByText("JOB-0001")).toBeNull();
    });

    it("changes the status filter from a chip", () => {
        const { onFiltersChange } = renderList();
        fireEvent.click(screen.getByRole("button", { name: /^Closed/ }));
        expect(onFiltersChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: "closed" });
    });

    it("reports the search text and the open-defects toggle", () => {
        const { onFiltersChange } = renderList();
        fireEvent.change(screen.getByLabelText("Search production"), { target: { value: "beta" } });
        expect(onFiltersChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, query: "beta" });

        fireEvent.click(screen.getByRole("button", { name: /Open defects/ }));
        expect(onFiltersChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, openDefectsOnly: true });
    });

    it("applies the filters it is given", () => {
        renderList({ filters: { ...DEFAULT_FILTERS, status: "all", openDefectsOnly: true } });
        expect(screen.getByText("JOB-0002")).toBeTruthy();
        expect(screen.queryByText("JOB-0001")).toBeNull();
    });

    it("opens a run on click, Enter and Space", () => {
        const { onOpen } = renderList();
        const row = screen.getByText("JOB-0002").closest("[data-run-row]") as HTMLElement;
        fireEvent.click(row);
        fireEvent.keyDown(row, { key: "Enter" });
        fireEvent.keyDown(row, { key: " " });
        expect(onOpen).toHaveBeenCalledTimes(3);
        expect(onOpen).toHaveBeenCalledWith("b");
    });

    it("moves focus between rows with the arrow keys", () => {
        renderList();
        const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-run-row]"));
        expect(rows).toHaveLength(2);
        rows[0].focus();
        fireEvent.keyDown(rows[0], { key: "ArrowDown" });
        expect(document.activeElement).toBe(rows[1]);
        fireEvent.keyDown(rows[1], { key: "ArrowUp" });
        expect(document.activeElement).toBe(rows[0]);
    });

    it("marks the selected row", () => {
        renderList({ selectedId: "b" });
        const row = screen.getByText("JOB-0002").closest("[data-run-row]") as HTMLElement;
        expect(row.getAttribute("aria-pressed")).toBe("true");
    });

    it("shows open defects on a row and an updated time", () => {
        renderList();
        const row = screen.getByText("JOB-0002").closest("[data-run-row]") as HTMLElement;
        expect(within(row).getByTitle("2 open defect(s)")).toBeTruthy();
        expect(within(row).getByText("In production")).toBeTruthy();
    });

    it("shows the ordered quantity, the yield percentage, who created it and when", () => {
        renderList({
            runs: [makeRun({ id: "q", job_number: "JOB-Q", status: "received", quantity_ordered: 250, quantity_good: 240, created_by: "ana@x", created_at: "2026-03-04T12:00:00Z" })],
        });
        const row = screen.getByText("JOB-Q").closest("[data-run-row]") as HTMLElement;
        expect(within(row).getByTitle("Units ordered").textContent).toBe("250");
        expect(within(row).getByText("96%")).toBeTruthy();
        expect(within(row).getByText("ana@x")).toBeTruthy();
        expect(within(row).getByText(new Date("2026-03-04T12:00:00Z").toLocaleDateString())).toBeTruthy();
        // "Ordered" is also a status chip, so look for the column header specifically.
        expect(screen.getAllByText("Ordered").some((el) => el.tagName === "SPAN" && el.className.includes("text-right"))).toBe(true);
        expect(screen.getByText("Created")).toBeTruthy();
    });

    it("splits the defects by severity on the row", () => {
        renderList({
            runs: [makeRun({ id: "d", job_number: "JOB-D", status: "received", defect_severity_counts: { critical: 1, minor: 2 }, open_defect_count: 1 })],
        });
        const row = screen.getByText("JOB-D").closest("[data-run-row]") as HTMLElement;
        expect(within(row).getByText("1 critical")).toBeTruthy();
        expect(within(row).getByText("2 minor")).toBeTruthy();
        expect(within(row).getByText("1 open")).toBeTruthy();
    });

    it("marks a run that has notes, with the notes on hover", () => {
        renderList({
            runs: [
                makeRun({ id: "n", job_number: "JOB-N", status: "received", notes: "Rush order, ship DHL" }),
                makeRun({ id: "m", job_number: "JOB-M", status: "received", notes: "  " }),
            ],
        });
        const withNotes = screen.getByText("JOB-N").closest("[data-run-row]") as HTMLElement;
        expect(within(withNotes).getByLabelText("Has notes").getAttribute("title")).toBe("Rush order, ship DHL");
        const without = screen.getByText("JOB-M").closest("[data-run-row]") as HTMLElement;
        expect(within(without).queryByLabelText("Has notes")).toBeNull();
    });

    it("draws a page header with a title and its actions when given a title", () => {
        renderList({
            title: "Production",
            icon: <span data-testid="icon" />,
            headerActions: <button type="button">Refresh</button>,
            actions: <button type="button">New production</button>,
        });
        expect(screen.getByRole("heading", { level: 2, name: "Production" })).toBeTruthy();
        const header = screen.getByRole("banner");
        expect(within(header).getByTestId("icon")).toBeTruthy();
        // Refresh sits with the title; the page action stays on the filter row beneath it.
        const titleRow = screen.getByRole("heading", { level: 2 }).closest("div")!.parentElement!;
        expect(within(titleRow).getByRole("button", { name: "Refresh" })).toBeTruthy();
        expect(within(titleRow).queryByRole("button", { name: "New production" })).toBeNull();
        expect(within(header).getByRole("button", { name: "New production" })).toBeTruthy();
        expect(within(header).getByLabelText("Search production")).toBeTruthy();
    });

    it("has no page header when used inline", () => {
        renderList();
        expect(screen.queryByRole("banner")).toBeNull();
        expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    });

    it("links each row to its project's Manufacturing page without opening the run", () => {
        const { onOpen } = renderList();
        const row = screen.getByText("JOB-0002").closest("[data-run-row]") as HTMLElement;
        const link = within(row).getByRole("link", { name: "Open Board One manufacturing page" });
        expect(link.getAttribute("href")).toBe("/project/p1?section=manufacturing");
        fireEvent.click(link);
        expect(onOpen).not.toHaveBeenCalled();
    });

    it("links a row's release to its package in Release Studio, without opening the run", async () => {
        listCandidates.mockResolvedValue([
            { commit_sha: "abc1234", builds: [{ id: "b1", status: "succeeded", completed_at: "2026-10-01T00:00:00Z" }] },
        ]);
        const runs = [
            makeRun({ id: "r1", job_number: "JOB-0101", release_tag: "v1.0", commit_sha: "abc1234" }),
            makeRun({ id: "r2", job_number: "JOB-0102", release_tag: "v1.0", commit_sha: "abc1234" }),
        ];
        const { onOpen } = renderList({ runs });
        const row = screen.getByText("JOB-0101").closest("[data-run-row]") as HTMLElement;
        const link = within(row).getByRole("link", { name: /v1\.0/ });
        await waitFor(() => expect(link.getAttribute("href")).toBe("/project/p1?section=release-studio&build=b1&stage=outputs"));
        fireEvent.click(link);
        expect(onOpen).not.toHaveBeenCalled();
        // Rows of one project share a single lookup.
        expect(listCandidates).toHaveBeenCalledTimes(1);
    });

    it("has no project link when the list is one project's", () => {
        renderList({ hideProject: true });
        expect(screen.queryByRole("link", { name: /manufacturing page/ })).toBeNull();
    });

    it("scrolls its rows in the themed scrollbar", () => {
        renderList();
        const body = document.querySelector("[data-run-row]")!.parentElement!.parentElement!;
        expect(body.className).toContain("themed-scrollbar");
    });

    it("leaves out the project name when the list is one project's", () => {
        renderList({ hideProject: true });
        expect(screen.getByText("Job / Board")).toBeTruthy();
        expect(screen.queryByText("Job / Project")).toBeNull();
    });

    it("explains an empty list and offers the action it was given", () => {
        renderList({ runs: [], emptyAction: <button type="button">Start one</button> });
        expect(screen.getByText("No production yet.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Start one" })).toBeTruthy();
    });

    it("explains a filtered-out list and clears the filters", () => {
        const filters: ProductionFilters = { ...DEFAULT_FILTERS, status: "ordered", query: "zzz" };
        const { onFiltersChange } = renderList({ filters });
        expect(screen.getByText("No production matches these filters.")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, status: "active", query: "", openDefectsOnly: false });
    });

    it("groups rows under a labelled header", () => {
        const { unmount } = renderList();
        // Ungrouped: the name shows once, on its row.
        expect(screen.getAllByText("Beta Fab")).toHaveLength(1);
        unmount();
        renderList({ filters: { ...DEFAULT_FILTERS, status: "all", group: "manufacturer" } });
        // Grouped: once more as the group's header.
        expect(screen.getAllByText("Beta Fab")).toHaveLength(2);
        expect(screen.getAllByText("Acme Fab").length).toBeGreaterThan(1);
    });

    it("changes grouping and sorting from the View menu", async () => {
        const { onFiltersChange } = renderList();
        fireEvent.keyDown(screen.getByRole("button", { name: /View/ }), { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitemradio", { name: "Manufacturer" }));
        expect(onFiltersChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, group: "manufacturer" });

        fireEvent.keyDown(screen.getByRole("button", { name: /View/ }), { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitemradio", { name: "Job number" }));
        expect(onFiltersChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, sort: "job" });
    });
});
