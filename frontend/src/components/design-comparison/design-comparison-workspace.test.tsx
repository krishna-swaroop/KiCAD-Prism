import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
    Toaster: () => null,
}));
vi.mock("@/lib/api", () => ({
    fetchJson: vi.fn(async () => ({ items: [] })),
    fetchApi: vi.fn(async () => new Response("{}", { status: 200 })),
    readApiError: vi.fn(async () => "error"),
    ApiHttpError: class ApiHttpError extends Error {},
}));

// Hoisted so the job result keeps its identity across renders, the way the
// real useState-backed hook does. A fresh object per render would re-fire
// every result-keyed effect and hide what these tests are about.
const { JOB } = vi.hoisted(() => {
    const change = (id: string, domain: "schematic" | "pcb") => ({
        id,
        kind: "changed",
        domain,
        label: id,
        reference: id.toUpperCase(),
        object_kind: domain === "pcb" ? "footprint" : "symbol",
        page: "root.kicad_sch",
        layers: domain === "pcb" ? ["F.Cu"] : [],
        fields: {},
        reasons: [],
        net: null,
        semantic_id: `sem-${id}`,
    });
    const pcbChanges = [
        change("p1", "pcb"),
        {
            ...change("gnd-added", "pcb"),
            kind: "added",
            category: "nets",
            label: "GND",
            reference: null,
            object_kind: "track",
            net: "GND",
            semantic_id: null,
        },
        {
            ...change("gnd-removed", "pcb"),
            kind: "removed",
            category: "nets",
            label: "GND",
            reference: null,
            object_kind: "track",
            net: "GND",
            semantic_id: null,
        },
    ];
    return {
        JOB: {
            result: {
                document_diff: {
                    project: {
                        documents: [{
                            path: "root.kicad_sch",
                            changes: [change("s1", "schematic")],
                        }],
                    },
                    navigation: {},
                    diagnostics: [],
                },
                files: [{ path: "root.kicad_sch", status: "modified" }],
                schematic: { changes: [change("s1", "schematic")] },
                pcb: { changes: pcbChanges, route_metrics: {} },
                bom: { summary: {}, changes: [], fields: [] },
                stackup: { layers: [] },
                fabrication: {},
            },
            status: { state: "completed" },
            error: null,
        },
    };
});

vi.mock("./use-design-compare-job", () => ({ useDesignCompareJob: () => JOB }));
vi.mock("./use-comparison-comments", () => ({
    useComparisonComments: () => [[], vi.fn(), { status: "live", error: null, hasLoaded: true }],
}));
// The shell hosts a custom element jsdom cannot instantiate, and has its own
// suite. What is under test here is the workspace around it.
vi.mock("./comparison-presentation-shell", () => ({
    ComparisonPresentationShell: ({
        toolbarContent,
    }: {
        toolbarContent?: React.ReactNode;
    }) => <div data-testid="shell">{toolbarContent}</div>,
}));

import { DesignComparisonWorkspace } from "./design-comparison-workspace";

/**
 * Fails the render rather than hanging the run.
 *
 * The comparison state lives in the address bar, so a redundant write is a
 * navigation and a navigation is a render. Left unguarded the two feed each
 * other and the event loop never yields -- which is a test-run timeout with no
 * output, not a readable failure. Counting router-driven renders and throwing
 * turns that into an assertion.
 */
let routerRenders = 0;

function SettleGuard({ cap }: { cap: number }) {
    const location = useLocation();
    // A module-scoped counter rather than a ref: counting has to include
    // renders React discards, which is exactly the work a ref is not allowed
    // to record.
    routerRenders += 1;
    if (routerRenders > cap) {
        throw new Error(
            `the comparison did not settle: ${routerRenders} renders driven `
            + `by the router, last search "${location.search}"`,
        );
    }
    return null;
}

function mountOn(tab: string) {
    routerRenders = 0;
    return render(
        <MemoryRouter
            initialEntries={[
                `/?section=history&base=b&compare=c&view=semantic&diff=${tab}`,
            ]}
        >
            <SettleGuard cap={25} />
            <DesignComparisonWorkspace
                projectId="p1"
                base="b"
                head="c"
                branchTipSha={null}
                canComment
                onClose={vi.fn()}
            />
        </MemoryRouter>,
    );
}

describe("design comparison workspace", () => {
    // Every tab, because the re-anchor effect that used to spin runs on all of
    // them: with nothing selected it clears an already-empty selection on each
    // pass, and that write reaches the URL.
    for (const tab of ["sch", "pcb", "bom", "stackup", "fabrication"]) {
        it(`settles when opened on the ${tab} tab`, async () => {
            mountOn(tab);
            // The tab bar is rendered on every tab, unlike the domain shells,
            // so finding it means the tree reached a stable render. Reaching
            // this line at all is the assertion: an unsettled workspace never
            // returns from `render`.
            expect(await screen.findAllByRole("button", { name: /schematic/i }))
                .not.toHaveLength(0);
        });
    }

    it("keeps a deep link's tab and selection", async () => {
        routerRenders = 0;
        render(
            <MemoryRouter
                initialEntries={[
                    "/?section=history&base=b&compare=c&view=semantic"
                    + "&diff=pcb&item=p1",
                ]}
            >
                <SettleGuard cap={25} />
                <DesignComparisonWorkspace
                    projectId="p1"
                    base="b"
                    head="c"
                    branchTipSha={null}
                    canComment
                    onClose={vi.fn()}
                />
            </MemoryRouter>,
        );
        // The tab carries a change-count badge, so its accessible name is
        // "PCB" plus a number.
        const pcbTab = (await screen.findAllByRole("button", { name: /pcb/i }))[0];
        expect(pcbTab).toHaveAttribute("aria-pressed", "true");
    });

    it("filters authored decisions without reclassifying their parser events", async () => {
        mountOn("pcb");
        fireEvent.click(await screen.findByRole("button", { name: "Filter changes" }));
        fireEvent.click(screen.getByRole("button", { name: "Modified Modified (2)" }));
        fireEvent.click(screen.getByRole("button", { name: "Removed Removed (0)" }));

        // The added and removed GND primitives form one Modified routing
        // decision. Added-only must not split that decision and relabel half of
        // it as an Added row.
        expect(screen.getByRole("button", { name: "Added Added (0)" }))
            .toHaveTextContent("Added (0)");
        expect(screen.getByText("No differences match these filters.")).toBeTruthy();
    });

    it("highlights the shown mode and resets an override on the next listing", async () => {
        mountOn("pcb");

        expect(screen.queryByRole("button", { name: "Auto" })).toBeNull();
        expect(await screen.findByRole("button", { name: "Composite" }))
            .toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Side by side" }))
            .toHaveAttribute("aria-pressed", "false");

        fireEvent.click(screen.getByRole("button", {
            name: "Single revision presentation mode",
        }));
        expect(screen.getByRole("button", {
            name: "Single revision presentation mode",
        })).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(screen.getByRole("button", {
            name: "Modified Modified P1",
        }));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Side by side" }))
                .toHaveAttribute("aria-pressed", "true");
        });
        expect(screen.getByRole("button", {
            name: "Single revision presentation mode",
        })).toHaveAttribute("aria-pressed", "false");
    });
});
