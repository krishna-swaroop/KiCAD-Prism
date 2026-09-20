import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDetailPage } from "@/pages/ProjectDetailPage";
import {
    applyCanvasDeepLinkNavigation,
    applyComparisonDeepLinkNavigation,
    buildLoginReturnPath,
    canvasVisualizerTab,
    comparisonSideFromParam,
    deepLinkSceneKey,
    explicitPinnedCommit,
    isTrackerDeepLink,
    markerMissingMessage,
    normalizeCommitSha,
    normalizePrismProjectPath,
    readTrackerDeepLink,
    sourceUnavailableMessage,
    stashTrackerDeepLinkLoginReturn,
} from "@/lib/tracker-deep-link";
import { fetchJson } from "@/lib/api";
import type { User } from "@/types/auth";

vi.mock("@/components/visualizer", () => ({
    Visualizer: ({ commit }: { commit?: string | null }) => (
        <div data-testid="visualizer" data-commit={commit ?? ""} />
    ),
}));

vi.mock("@/components/history-viewer", () => ({
    HistoryViewer: () => <div data-testid="history-viewer" />,
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, fetchJson: vi.fn() };
});

const mockedFetchJson = vi.mocked(fetchJson);

function mockFetchUrl(input: RequestInfo | URL): string {
    return typeof input === "string" ? input : input.toString();
}

const COMMIT_A = "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695";
const COMMIT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const COMMENT_ID = "c_8f3a1b2c";

const viewer: User = {
    email: "viewer@example.com",
    name: "Viewer",
    role: "viewer",
};

function renderProject(initialEntry: string) {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/project/:projectId" element={<ProjectDetailPage user={viewer} />} />
            </Routes>
        </MemoryRouter>,
    );
}

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
});

beforeEach(() => {
    mockedFetchJson.mockReset();
    mockedFetchJson.mockImplementation(async (input: RequestInfo | URL) => {
        const url = mockFetchUrl(input);
        if (url.includes("/overview")) {
            return {
                project: {
                    id: "prj_test",
                    name: "Carrier",
                    description: "",
                    path: "/carrier",
                    last_modified: "today",
                },
                readme: "",
            };
        }
        if (url.includes("/commits/distance")) {
            return { commits_behind: 2 };
        }
        if (url.includes("/branches")) {
            return { branches: [{ name: "main", ref: "refs/heads/main", source: "local", is_current: true, hash: "abc1234", commit: COMMIT_B }] };
        }
        throw new Error(`Unexpected fetchJson url: ${url}`);
    });
});

describe("tracker deep-link contract (TR-24 / F2 / F9)", () => {
    it("parses canvas links with commit, view, comment, variant and item", () => {
        const params = new URLSearchParams(
            `commit=${COMMIT_A}&view=pcb&comment=${COMMENT_ID}&variant=REV_B&item=net:CLK`,
        );
        expect(readTrackerDeepLink(params)).toEqual({
            kind: "canvas",
            commit: COMMIT_A,
            view: "pcb",
            commentId: COMMENT_ID,
            variant: "REV_B",
            semanticItemId: "net:CLK",
        });
        expect(isTrackerDeepLink(params)).toBe(true);
        expect(canvasVisualizerTab("pcb")).toBe("pcb");
    });

    it("parses comparison links with ordered pair, diff, side and item", () => {
        const params = new URLSearchParams(
            `section=history&base=${COMMIT_A}&compare=${COMMIT_B}&view=semantic&diff=pcb&comment=${COMMENT_ID}&side=compare&item=chg:1`,
        );
        expect(readTrackerDeepLink(params)).toEqual({
            kind: "comparison",
            baseCommit: COMMIT_A,
            compareCommit: COMMIT_B,
            diff: "pcb",
            commentId: COMMENT_ID,
            selectedSide: "compare",
            semanticItemId: "chg:1",
        });
        expect(comparisonSideFromParam("base")).toBe("base");
    });

    it("rejects short SHAs and links without comment id", () => {
        expect(normalizeCommitSha("3f2c9a1")).toBeNull();
        expect(readTrackerDeepLink(new URLSearchParams(`commit=${COMMIT_A}`)).kind).toBe("none");
    });

    it("normalizes forge /projects paths to app /project routes", () => {
        expect(normalizePrismProjectPath("/projects/prj_test")).toBe("/project/prj_test");
        expect(buildLoginReturnPath("prj_test", `commit=${COMMIT_A}&comment=${COMMENT_ID}`))
            .toBe(`/project/prj_test?commit=${COMMIT_A}&comment=${COMMENT_ID}`);
    });

    it("stashes the deep link for OIDC login return", () => {
        const params = new URLSearchParams(`commit=${COMMIT_A}&view=sch&comment=${COMMENT_ID}`);
        const stashed = stashTrackerDeepLinkLoginReturn(params, "/projects/prj_test");
        expect(stashed).toBe(true);
        expect(sessionStorage.getItem("kicad_prism_login_next"))
            .toBe(`/project/prj_test?commit=${COMMIT_A}&view=sch&comment=${COMMENT_ID}`);
    });

    it("applies canvas and comparison navigation params without dropping frozen keys", () => {
        const canvas = applyCanvasDeepLinkNavigation(new URLSearchParams(
            `commit=${COMMIT_A}&view=pcb&comment=${COMMENT_ID}&variant=REV_B`,
        ));
        expect(canvas.get("section")).toBe("visualizers");
        expect(canvas.get("tab")).toBe("pcb");
        expect(canvas.get("variant")).toBe("REV_B");

        const comparison = applyComparisonDeepLinkNavigation(new URLSearchParams(
            `base=${COMMIT_A}&compare=${COMMIT_B}&comment=${COMMENT_ID}&diff=pcb&side=base&item=chg:1`,
        ));
        expect(comparison.get("section")).toBe("history");
        expect(comparison.get("view")).toBe("semantic");
        expect(comparison.get("side")).toBe("base");
        expect(comparison.get("item")).toBe("chg:1");
    });

    it("builds stable scene keys for stale-async guards", () => {
        const canvasIntent = readTrackerDeepLink(new URLSearchParams(
            `commit=${COMMIT_A}&view=pcb&comment=${COMMENT_ID}`,
        ));
        const comparisonIntent = readTrackerDeepLink(new URLSearchParams(
            `base=${COMMIT_A}&compare=${COMMIT_B}&comment=${COMMENT_ID}&diff=sch&side=compare`,
        ));
        expect(deepLinkSceneKey("prj", canvasIntent)).toContain(COMMIT_A);
        expect(deepLinkSceneKey("prj", comparisonIntent)).toContain(COMMIT_B);
        expect(explicitPinnedCommit(new URLSearchParams(`commit=${COMMIT_A}&comment=${COMMENT_ID}`), canvasIntent))
            .toBe(COMMIT_A);
    });

    it("describes unavailable sources without silent fallback copy", () => {
        expect(sourceUnavailableMessage(COMMIT_A)).toContain(COMMIT_A.slice(0, 7));
        expect(markerMissingMessage(COMMENT_ID)).toContain(COMMENT_ID);
    });
});

describe("ProjectDetailPage deep-link host (F9)", () => {
    it("opens the visualizer on the pinned commit from a canvas deep link", async () => {
        renderProject(`/project/prj_test?commit=${COMMIT_A}&view=pcb&comment=${COMMENT_ID}`);
        await waitFor(() => expect(screen.getByTestId("visualizer")).toBeTruthy());
        expect(screen.getByTestId("visualizer").getAttribute("data-commit")).toBe(COMMIT_A);
    });

    it("shows an explicit unavailable state for missing commits", async () => {
        mockedFetchJson.mockImplementation(async (input: RequestInfo | URL) => {
            const url = mockFetchUrl(input);
            if (url.includes("/commits/distance")) {
                const error = new Error("Commit not found") as Error & { status: number };
                error.status = 404;
                const { ApiHttpError } = await import("@/lib/api");
                throw new ApiHttpError(404, "Commit not found");
            }
            if (url.includes("/overview")) {
                return {
                    project: {
                        id: "prj_test",
                        name: "Carrier",
                        description: "",
                        path: "/carrier",
                        last_modified: "today",
                    },
                    readme: "",
                };
            }
            if (url.includes("/branches")) return { branches: [] };
            throw new Error(`Unexpected fetchJson url: ${url}`);
        });

        renderProject(`/project/prj_test?commit=${COMMIT_A}&view=pcb&comment=${COMMENT_ID}`);
        await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeTruthy());
        expect(screen.queryByTestId("visualizer")).toBeNull();
    });
});
