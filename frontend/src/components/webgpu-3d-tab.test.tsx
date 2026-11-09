import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismInsetScene3D } from "@/lib/inset-scene-3d";
import { WebGpu3dTab } from "./webgpu-3d-tab";

const fetchJson = vi.fn();
vi.mock("@/lib/api", () => ({
    fetchJson: (...args: unknown[]) => fetchJson(...args),
    fetchApi: vi.fn(),
    readApiError: vi.fn(),
}));

const status = (overrides: Record<string, unknown>) => ({
    schema: "prism.webgpu_3d_status_a0",
    status: "missing",
    available: false,
    sourceRevisionKey: "rev",
    source_fingerprint: "s",
    build_fingerprint: "b",
    generator: { name: "prism", version: "1", build: "x" },
    ...overrides,
});

const renderTab = (scene?: PrismInsetScene3D, user: { role: string } | null = null) =>
    render(
        <WebGpu3dTab
            projectId="p1"
            user={user as never}
            active={false}
            workspace="pcb"
            selection={null}
            onSelection={() => {}}
            onClearSelection={() => {}}
            insetScene={scene}
        />,
    );

describe("WebGpu3dTab as the 3D view of PCB insets (IN-61)", () => {
    beforeEach(() => fetchJson.mockReset());

    it("a commit without a 3D bundle makes insets say 3D unavailable", async () => {
        fetchJson.mockResolvedValue(status({}));
        const scene = new PrismInsetScene3D(() => {});
        renderTab(scene);
        await waitFor(() => expect(scene.state()).toBe("unavailable"));
    });

    it("a bundle hands insets the tab's viewer element", async () => {
        fetchJson.mockResolvedValue(status({ status: "ready", available: true, bundle_url: "/bundle.json" }));
        const scene = new PrismInsetScene3D(() => {});
        const update = vi.spyOn(scene, "update");
        renderTab(scene);
        await waitFor(() => expect(update).toHaveBeenLastCalledWith({
            kind: "viewer",
            element: expect.objectContaining({ tagName: "PRISM-SEMANTIC-VIEWER" }),
        }));
        // Not drawing until the viewer reports it can.
        expect(scene.state()).toBe("loading");
    });
});

describe("WebGpu3dTab while the design bundle builds (V2a)", () => {
    beforeEach(() => fetchJson.mockReset());

    it("asks again while the bundle builds and shows the board once stored", async () => {
        const building = status({
            status: "building",
            job_id: "job-1",
            message: "Waiting for stage board of the design bundle",
            readiness: { schema: "prism.visualizer_readiness.a0", stage: "generating", progress: 45, available_assets: [], revision: "k:generating" },
        });
        const ready = status({
            status: "ready",
            available: true,
            bundle_url: "/api/projects/p1/webgpu-3d/analytic",
            readiness: { schema: "prism.visualizer_readiness.a0", stage: "semantic-ready", progress: 100, available_assets: [], revision: "k:semantic-ready" },
        });
        fetchJson.mockResolvedValueOnce(building).mockResolvedValue(ready);
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const { container } = renderTab();
            await waitFor(() => expect(screen.getByText("Waiting for stage board of the design bundle")).toBeTruthy());
            expect(screen.getByRole("button", { name: /Generate 3D assets/ }).hasAttribute("disabled")).toBe(true);
            await vi.advanceTimersByTimeAsync(2100);
            await waitFor(() => expect(container.querySelector("prism-semantic-viewer")).not.toBeNull());
            const viewer = container.querySelector("prism-semantic-viewer");
            expect(viewer?.getAttribute("bundle-url")).toBe("/api/projects/p1/webgpu-3d/analytic?viewer=k%3Asemantic-ready");
            const calls = fetchJson.mock.calls.length;
            await vi.advanceTimersByTimeAsync(4100);
            expect(fetchJson.mock.calls.length).toBe(calls);
        } finally {
            vi.useRealTimers();
        }
    });

    it("a board that failed to materialize offers a rebuild", async () => {
        fetchJson.mockResolvedValue(status({ status: "invalid", error: "The board could not be materialized: zone open" }));
        renderTab(undefined, { role: "designer" });
        await waitFor(() => expect(screen.getByText("The board could not be materialized: zone open")).toBeTruthy());
        expect(screen.getByRole("button", { name: /Rebuild/ }).hasAttribute("disabled")).toBe(false);
        expect(screen.queryByRole("button", { name: /Generate 3D assets/ })).toBeNull();
    });
});

describe("WebGpu3dTab after a KiCad library changed", () => {
    beforeEach(() => fetchJson.mockReset());

    it("a failed parts refresh is shown over the earlier parts", async () => {
        fetchJson.mockResolvedValue(status({
            status: "ready",
            available: true,
            bundle_url: "/bundle.json",
            readiness: { stage: "semantic-ready", progress: 100 },
            refreshFailure: "kicad-cli crashed",
        }));
        renderTab();
        const badge = await screen.findByText("Models not updated");
        expect(badge.closest("[title]")?.getAttribute("title")).toBe("kicad-cli crashed");
    });

    it("a refresh under way hides an earlier failure", async () => {
        fetchJson.mockResolvedValue(status({
            status: "ready",
            available: true,
            bundle_url: "/bundle.json",
            readiness: { stage: "semantic-ready", progress: 100 },
            refreshing: true,
            refreshFailure: "kicad-cli crashed",
        }));
        renderTab();
        await screen.findByText("Updating models: a KiCad library changed");
        expect(screen.queryByText("Models not updated")).toBeNull();
    });
});
