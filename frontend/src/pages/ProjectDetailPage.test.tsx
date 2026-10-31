import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/lib/api";
import { invalidateServerState } from "@/lib/server-state";
import { ProjectDetailPage } from "./ProjectDetailPage";

vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return {
        ...actual,
        fetchJson: vi.fn(),
        fetchApi: vi.fn(),
        readApiError: vi.fn(),
    };
});

vi.mock("@/components/markdown-content", () => ({ MarkdownContent: () => null }));
vi.mock("@/components/release-studio/ReleaseStudioPanel", () => ({ ReleaseStudioPanel: () => null }));
vi.mock("@/components/visualizer", () => ({
    Visualizer: ({ commit }: { commit: string | null }) => <div>viewer at {commit}</div>,
}));

const MAIN = { name: "main", ref: "main", source: "local", is_current: true, hash: "a1", commit: "a1" };
let BRANCHES = { branches: [{ ...MAIN }] };

function branchRequests(): number {
    return vi.mocked(fetchJson).mock.calls.filter(([url]) => String(url).endsWith("/branches")).length;
}

function renderPage(path = "/project/p1") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/project/:projectId" element={<ProjectDetailPage user={null} />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("ProjectDetailPage window.prism", () => {
    beforeEach(() => {
        vi.mocked(fetchJson).mockImplementation(async (input) => {
            const url = String(input);
            if (url.endsWith("/branches")) return BRANCHES;
            if (url.includes("/overview")) {
                return {
                    project: { id: "p1", name: "Board", description: "", path: "", last_modified: "" },
                    readme: null,
                };
            }
            throw new Error(`unrouted ${url}`);
        });
    });

    afterEach(() => {
        vi.mocked(fetchJson).mockReset();
        delete window.prism;
    });

    it("installs while the page is mounted, links the view and removes itself", async () => {
        const page = renderPage("/project/p1?section=visualizers&tab=pcb&sel=R1,U3");
        await screen.findAllByText("Board");

        expect(window.prism?.version).toBe("v1");
        expect(window.prism?.projectId).toBe("p1");
        expect(window.prism?.link()).toBe(
            `${window.location.origin}/project/p1?section=visualizers&tab=pcb&sel=R1%2CU3`,
        );

        await window.prism?.open({ tab: "sch" });
        await waitFor(() => {
            const url = new URL(window.prism!.link());
            expect(url.searchParams.get("tab")).toBe("sch");
            expect(url.searchParams.get("sel")).toBe("R1,U3");
        });

        page.unmount();
        expect(window.prism).toBeUndefined();
    });
});

describe("ProjectDetailPage branch polling", () => {
    beforeEach(() => {
        vi.mocked(fetchJson).mockImplementation(async (input) => {
            const url = String(input);
            if (url.endsWith("/branches")) return BRANCHES;
            if (url.includes("/overview")) {
                return {
                    project: { id: "p1", name: "Board", description: "", path: "", last_modified: "" },
                    readme: null,
                };
            }
            throw new Error(`unrouted ${url}`);
        });
    });

    afterEach(() => {
        vi.mocked(fetchJson).mockReset();
        BRANCHES = { branches: [{ ...MAIN }] };
    });

    it("keeps one branch poller across section switches", async () => {
        renderPage();
        await screen.findAllByText("Board");
        await waitFor(() => expect(branchRequests()).toBe(1));

        const workflows = screen.getAllByRole("button", { name: /Workflows/ })[0];
        fireEvent.click(workflows);
        await screen.findByRole("heading", { name: "Workflows" });
        const overview = screen.getAllByRole("button", { name: /Overview/ })[0];
        fireEvent.click(overview);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(branchRequests()).toBe(1);
    });

    it("keeps the visualizer on the commit it opened when the branch head moves", async () => {
        renderPage("/project/p1?section=visualizers");
        expect(await screen.findByText("viewer at a1")).toBeInTheDocument();

        BRANCHES = { branches: [{ ...MAIN, hash: "b2", commit: "b2" }] };
        await invalidateServerState(["project", "p1", "branches"]);

        const offer = await screen.findByRole("button", { name: /New revision available/ });
        expect(screen.getByText("viewer at a1")).toBeInTheDocument();
        fireEvent.click(offer);
        expect(await screen.findByText("viewer at b2")).toBeInTheDocument();
    });

    it("stays up while it reads the overview again for the branch head, so open sections are not loaded twice", async () => {
        let release: () => void = () => undefined;
        const base = vi.mocked(fetchJson).getMockImplementation();
        vi.mocked(fetchJson).mockImplementation(async (input, ...rest) => {
            if (String(input).includes("/overview?commit=")) await new Promise<void>((resolve) => { release = resolve; });
            return base!(input, ...rest);
        });
        renderPage();
        await screen.findAllByText("Board");
        await waitFor(() => expect(vi.mocked(fetchJson).mock.calls.some(([url]) => String(url).includes("/overview?commit=a1"))).toBe(true));
        expect(screen.queryByText("Loading...")).toBeNull();
        expect(screen.getAllByText("Board").length).toBeGreaterThan(0);
        release();
    });
});
