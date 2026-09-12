import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    fetchJson: vi.fn(),
    fetchApi: vi.fn(),
    readApiError: vi.fn(async () => "error"),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { fetchJson } from "@/lib/api";
import { LibraryComponentWorkspace } from "./library-component-workspace";

// Every tab's evidence is stored as one value carrying the component
// generation it was loaded for, and useEvidenceResource treats a result from
// an older generation as nothing loaded. Both halves matter: without the
// generation on the value the previous component's revisions stay on screen,
// and without it on the load state the status is still "loaded" so the new
// component is never fetched at all. A single reset effect used to stand in
// for both, and this is what it was protecting.

function component(id: string) {
    return {
        id, slug: id, name: id.toUpperCase(), mpn: `MPN-${id}`, value: "10k",
        workflow_stage: "draft", revision: 1, revision_id: `${id}-rev1`,
        parent_revision_id: "", version: 1, assets: [], representations: [],
        extra: {}, availability_state: "active", validation_status: "unknown",
        identity_kind: "mpn", source: "manual", preview_status: {},
        previews: [],
        validation: { status: "unknown", error_count: 0, warning_count: 0 },
    };
}

function revision(id: string, summary: string) {
    return {
        id: `${id}-rev1`, version: 1, release_status: "draft",
        created_at: "2026-08-01T00:00:00Z", created_by: "someone",
        change_summary: summary, change_kind: "metadata",
    };
}

function routeFor(id: string) {
    return (url: string) => {
        if (url === `/api/catalog/components/${id}`) return component(id);
        if (url === `/api/catalog/components/${id}/revisions`) {
            return { items: [revision(id, `history for ${id}`)] };
        }
        return { items: [] };
    };
}

function install(...ids: string[]) {
    const routes = ids.map(routeFor);
    vi.mocked(fetchJson).mockImplementation(async (input) => {
        const url = String(input);
        for (const route of routes) {
            const hit = route(url);
            if (hit) return hit as never;
        }
        // Anything this test has not taught the mock is a bug in the test, not
        // an empty response the component should have to cope with.
        throw new Error(`unrouted request: ${url}`);
    });
}

function Harness({ componentId, revision }: { componentId: string; revision?: string }) {
    const query = `/?section=library-manager&componentTab=revisions${revision ? `&revision=${revision}` : ""}`;
    return (
        <MemoryRouter initialEntries={[query]}>
            <LibraryComponentWorkspace
                componentId={componentId}
                user={{ id: "u1", email: "a@b.c", role: "admin" } as never}
                projects={[]}
                onBack={vi.fn()}
            />
        </MemoryRouter>
    );
}

function renderWorkspace(componentId: string) {
    return render(<Harness componentId={componentId} />);
}

beforeEach(() => install("comp-a", "comp-b"));
afterEach(() => vi.clearAllMocks());

describe("component evidence across generations", () => {
    it("loads the evidence for the component it is showing", async () => {
        renderWorkspace("comp-a");
        expect(await screen.findByText("history for comp-a")).toBeInTheDocument();
    });

    it("ignores a stale generation that completes after the component has moved on", async () => {
        let finishA: ((value: { items: ReturnType<typeof revision>[] }) => void) | undefined;
        const aRevisions = new Promise<{ items: ReturnType<typeof revision>[] }>((resolve) => {
            finishA = resolve;
        });
        vi.mocked(fetchJson).mockImplementation(async (input) => {
            const url = String(input);
            if (url === "/api/catalog/components/comp-a") return component("comp-a") as never;
            if (url === "/api/catalog/components/comp-b") return component("comp-b") as never;
            if (url === "/api/catalog/components/comp-a/revisions") return aRevisions as never;
            if (url === "/api/catalog/components/comp-b/revisions") {
                return { items: [revision("comp-b", "history for comp-b")] } as never;
            }
            return { items: [] } as never;
        });

        const { rerender } = renderWorkspace("comp-a");
        expect(await screen.findByText("COMP-A")).toBeInTheDocument();
        rerender(<Harness componentId="comp-b" />);
        expect(await screen.findByText("history for comp-b")).toBeInTheDocument();
        finishA!({ items: [revision("comp-a", "history for comp-a")] });
        await waitFor(() => {
            expect(screen.queryByText("history for comp-a")).not.toBeInTheDocument();
        });
        expect(screen.getByText("history for comp-b")).toBeInTheDocument();
    });

    // Arriving with a `?revision=` that belongs to a different component. Every
    // in-app path clears that param and the API scopes the lookup and 404s, so
    // the reachable version of this is a shared or bookmarked link -- and today
    // that 404s too. What is being pinned is the boundary: a 200 whose body is
    // not a component must not become the active component. It used to, and the
    // header dereferences `validation.status`, so the workspace went white.
    it("refuses a revision response that is not a component", async () => {
        vi.mocked(fetchJson).mockImplementation(async (input) => {
            const url = String(input);
            if (url === "/api/catalog/components/comp-a") return component("comp-a") as never;
            // The shape a paginated collection would have, standing in for any
            // 200 that is not the component this screen asked for.
            return { items: [] } as never;
        });

        render(<Harness componentId="comp-a" revision="comp-b-rev1" />);

        expect(
            await screen.findByText("That revision could not be loaded for this component."),
        ).toBeInTheDocument();
        // Still the component's own header, and still a way back.
        await waitFor(() => expect(screen.getByText("COMP-A")).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /return to current/i })).toBeInTheDocument();
    });
});
