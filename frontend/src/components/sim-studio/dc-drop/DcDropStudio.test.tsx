import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
    listSetups: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    checkSetup: vi.fn(async () => ({ ok: true, issues: [] })),
    readPowerTree: vi.fn(async () => ({})),
    submitSetup: vi.fn(),
}));

vi.mock("./power-tree-session", () => ({
    loadTree: vi.fn(),
    saveTree: vi.fn(),
    boardIndex: vi.fn(async () => null),
    candidatesFor: vi.fn(async () => ({ rails: [], converters: [], sources: [], loads: [] })),
    semanticIndexFor: vi.fn(async () => null),
    createSetup: vi.fn(),
}));

vi.mock("./PowerTreeCanvas", () => ({ PowerTreeCanvas: () => null }));
vi.mock("./SetupSettingsPane", () => ({ SetupSettingsPane: () => null }));
vi.mock("./results/ResultsView", () => ({ ResultsView: () => null }));
vi.mock("@/components/design-search-field", () => ({ DesignSearchField: () => null }));

import { DcDropStudio } from "./DcDropStudio";
import * as session from "./power-tree-session";

const setup = {
    schema: "prism.sim.setup" as const,
    version: "a0" as const,
    name: "Head-following setup",
    bundle: { board_id: "main" },
    materials: { slices: {} },
    components: {},
    rails: [],
    terminals: [],
    sources: [],
    loads: [],
    converters: [],
    probes: [],
    analyses: [{ id: "dc", kind: "dc-drop" as const, rails: [] }],
};

function tree(commit?: string) {
    return {
        record: {
            schema: "prism.sim.setup-record" as const,
            version: "a0" as const,
            setup_id: "sup_1",
            project_id: "p1",
            etag: '"simsetup:sup_1:1"',
            revision: 1,
            kind: "dc-drop",
            source: { project_path: "b.kicad_pro", ...(commit ? { commit } : {}) },
            created_by: "designer",
            created_at: "2026-11-07T00:00:00Z",
            updated_at: "2026-11-07T00:00:00Z",
            setup,
        },
        layout: { version: 1 as const, positions: {}, pending: [] },
    };
}

/** The studio header renders the setup's name once its record has loaded. */
const panel = (props: { headCommit?: string; commit?: string }) => (
    <DcDropStudio
        projectId="p1"
        canMutate
        active
        setupId="sup_1"
        tab="setup"
        headCommit={props.headCommit}
        onSetupChange={() => undefined}
        onTabChange={() => undefined}
        onBack={() => undefined}
    />
);

describe("DcDropStudio board reads", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(session.loadTree).mockResolvedValue(tree() as never);
    });

    it("reads at HEAD until the branch head is known, then at the head", async () => {
        const { rerender } = render(panel({}));
        await screen.findByText("Head-following setup");
        // No branch list yet: the canvas still gets a board, read at HEAD.
        await waitFor(() => expect(session.boardIndex).toHaveBeenCalledWith("p1", undefined));

        rerender(panel({ headCommit: "head-sha" }));
        await waitFor(() => expect(session.boardIndex).toHaveBeenCalledWith("p1", "head-sha"));
        expect(session.candidatesFor).toHaveBeenCalledWith("p1", "head-sha");
        expect(session.semanticIndexFor).toHaveBeenCalledWith("p1", "head-sha");
    });

    it("reads a pinned setup at its own commit rather than the head", async () => {
        vi.mocked(session.loadTree).mockResolvedValue(tree("pinned-sha") as never);
        render(panel({ headCommit: "head-sha" }));
        await waitFor(() => expect(session.boardIndex).toHaveBeenCalledWith("p1", "pinned-sha"));
        expect(session.boardIndex).not.toHaveBeenCalledWith("p1", "head-sha");
    });
});
