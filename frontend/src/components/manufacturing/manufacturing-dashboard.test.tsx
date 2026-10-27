import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";
import type { Project } from "@/types/project";
import { makeRun } from "./test-fixtures";

const listRuns = vi.fn();
const listManufacturers = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    listRuns: (...a: unknown[]) => listRuns(...a),
    listManufacturers: (...a: unknown[]) => listManufacturers(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// The heavy children are stubbed: this suite is about what the URL opens and what the shell wires up.
vi.mock("./run-drawer", () => ({
    RunDrawer: (props: { runId: string | null; onClose: () => void }) =>
        props.runId ? (
            <div>
                drawer:{props.runId}
                <button type="button" onClick={props.onClose}>close drawer</button>
            </div>
        ) : null,
}));
vi.mock("./new-production-dialog", () => ({
    NewProductionDialog: (props: { initialProjectId?: string; projects: { id: string; name: string }[] }) => (
        <div>wizard:{props.initialProjectId ?? "none"}:{props.projects.map((p) => p.name).join("|")}</div>
    ),
}));
vi.mock("./manufacturers-panel", () => ({ ManufacturersPanel: () => <div>manufacturers-panel</div> }));

import { ManufacturingDashboard } from "./manufacturing-dashboard";

const DESIGNER = { role: "designer" } as User;
const PROJECTS = [
    { id: "p1", name: "board-one", display_name: "Board One", sub_path: "." },
    { id: "p2", name: "radio", sub_path: "rf" },
] as unknown as Project[];

function Search() {
    return <div data-testid="search">{useLocation().search}</div>;
}

function renderAt(url: string, user: User | null = DESIGNER) {
    return render(
        <MemoryRouter initialEntries={[url]}>
            <ManufacturingDashboard user={user} projects={PROJECTS} />
            <Search />
        </MemoryRouter>,
    );
}
const search = () => screen.getByTestId("search").textContent;

describe("ManufacturingDashboard", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    const empty = () => {
        listRuns.mockResolvedValue([]);
        listManufacturers.mockResolvedValue([]);
    };

    describe("deep links", () => {
        it("opens the run named in the URL in the drawer and keeps the param while open", async () => {
            empty();
            renderAt("/?section=manufacturing&run=run_9");
            expect(await screen.findByText("drawer:run_9")).toBeTruthy();
            expect(search()).toBe("?section=manufacturing&run=run_9");
        });

        it("ignores a leftover newRunFor link rather than opening the dialog", async () => {
            empty();
            renderAt("/?section=manufacturing&newRunFor=p1");
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            expect(screen.queryByText(/wizard:/)).toBeNull();
        });

        it("opens nothing without those params", async () => {
            empty();
            renderAt("/?section=manufacturing");
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            expect(screen.queryByText(/drawer:/)).toBeNull();
            expect(screen.queryByText(/wizard:/)).toBeNull();
        });
    });

    describe("the production list", () => {
        const runs = () => {
            listRuns.mockResolvedValue([
                makeRun({ id: "r1", job_number: "JOB-0001", status: "draft" }),
                makeRun({ id: "r2", job_number: "JOB-0002", status: "closed" }),
            ]);
            listManufacturers.mockResolvedValue([]);
        };

        it("shows active runs first and opens a run in the drawer through the URL", async () => {
            runs();
            renderAt("/?section=manufacturing");
            fireEvent.click(await screen.findByText("JOB-0001"));
            expect(await screen.findByText("drawer:r1")).toBeTruthy();
            expect(search()).toContain("run=r1");
            expect(screen.queryByText("JOB-0002")).toBeNull();

            fireEvent.click(screen.getByRole("button", { name: "close drawer" }));
            await waitFor(() => expect(screen.queryByText("drawer:r1")).toBeNull());
            expect(search()).not.toContain("run=");
        });

        it("keeps the filters in the URL", async () => {
            runs();
            renderAt("/?section=manufacturing");
            await screen.findByText("JOB-0001");
            fireEvent.click(screen.getByRole("button", { name: /^Closed/ }));
            await waitFor(() => expect(search()).toContain("status=closed"));
            expect(screen.getByText("JOB-0002")).toBeTruthy();
            expect(screen.queryByText("JOB-0001")).toBeNull();

            fireEvent.change(screen.getByLabelText("Search production"), { target: { value: "0002" } });
            await waitFor(() => expect(search()).toContain("q=0002"));
        });

        it("restores the filters from the URL", async () => {
            runs();
            renderAt("/?section=manufacturing&status=closed&q=JOB");
            expect(await screen.findByText("JOB-0002")).toBeTruthy();
            expect(screen.queryByText("JOB-0001")).toBeNull();
            expect((screen.getByLabelText("Search production") as HTMLInputElement).value).toBe("JOB");
        });

    });

    describe("page headers", () => {
        it("titles the Production tab and keeps New production on its filter row", async () => {
            empty();
            renderAt("/?section=manufacturing");
            expect(await screen.findByRole("heading", { level: 2, name: "Production" })).toBeTruthy();
            expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
            const header = screen.getByRole("banner");
            expect(within(header).getByRole("button", { name: /New production/ })).toBeTruthy();
        });

        it("titles the Manufacturers tab with Refresh and Add manufacturer", async () => {
            empty();
            renderAt("/?section=manufacturing");
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            fireEvent.mouseDown(screen.getByRole("tab", { name: /Manufacturers/ }));
            expect(await screen.findByRole("heading", { level: 2, name: "Manufacturers" })).toBeTruthy();
            const header = screen.getByRole("banner");
            expect(within(header).getByRole("button", { name: "Refresh" })).toBeTruthy();
            expect(within(header).getByRole("button", { name: /Add manufacturer/ })).toBeTruthy();
        });

        it("leaves Add manufacturer out of the header for viewers", async () => {
            empty();
            renderAt("/?section=manufacturing", { role: "viewer" } as User);
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            fireEvent.mouseDown(screen.getByRole("tab", { name: /Manufacturers/ }));
            await screen.findByRole("heading", { level: 2, name: "Manufacturers" });
            expect(screen.queryByRole("button", { name: /Add manufacturer/ })).toBeNull();
            expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
        });

        it("Refresh reloads the data", async () => {
            empty();
            renderAt("/?section=manufacturing");
            await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(1));
            fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
            await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
            expect(listManufacturers).toHaveBeenCalledTimes(2);
        });
    });

    describe("actions and roles", () => {
        it("offers New production to designers and opens the dialog with every project", async () => {
            empty();
            renderAt("/?section=manufacturing");
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            fireEvent.click(screen.getAllByRole("button", { name: /New production/ })[0]);
            expect(await screen.findByText("wizard:none:Board One|radio (rf)")).toBeTruthy();
        });

        it("hides New production from viewers", async () => {
            empty();
            renderAt("/?section=manufacturing", { role: "viewer" } as User);
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            expect(screen.queryByRole("button", { name: /New production/ })).toBeNull();
        });

        it("switches to the Manufacturers tab", async () => {
            empty();
            renderAt("/?section=manufacturing");
            await waitFor(() => expect(listRuns).toHaveBeenCalled());
            fireEvent.mouseDown(screen.getByRole("tab", { name: /Manufacturers/ }));
            expect(await screen.findByText("manufacturers-panel")).toBeTruthy();
            expect(screen.getByRole("button", { name: /Add manufacturer/ })).toBeTruthy();
        });
    });
});
