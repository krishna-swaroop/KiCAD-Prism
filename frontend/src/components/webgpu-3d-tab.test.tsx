import { render, waitFor } from "@testing-library/react";
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

const renderTab = (scene: PrismInsetScene3D) =>
    render(
        <WebGpu3dTab
            projectId="p1"
            user={null}
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
