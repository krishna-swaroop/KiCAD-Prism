import { describe, expect, it, vi } from "vitest";
import { PrismInsetScene3D } from "./inset-scene-3d";
import type { PrismInsetView, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

function fakeViewer(ready = true) {
    const listeners = new Set<() => void>();
    const views: PrismInsetView[] = [];
    const element = {
        ready,
        insetReady: () => element.ready,
        insetSurfaceZ: (bottom: boolean) => (bottom ? -0.0008 : 0.0008),
        renderInset: vi.fn((_canvas: HTMLCanvasElement, view: PrismInsetView) => {
            views.push(view);
            return true;
        }),
        releaseInset: vi.fn(),
        onSceneChange: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return {
        element: element as unknown as PrismSemanticViewerElement & typeof element,
        views,
        listeners,
        redraw: () => { for (const listener of listeners) listener(); },
    };
}

const camera = { center: { x: 12, y: 30 }, zoom: 9, rotation: 0.5, mirror: true, view3d: true, tilt: 0.7 };

describe("PrismInsetScene3D", () => {
    it("is loading until the 3D tab mounts; load mounts it once", () => {
        const mount = vi.fn();
        const scene = new PrismInsetScene3D(mount);
        expect(scene.state()).toBe("loading");
        scene.load();
        scene.update({ kind: "loading" });
        scene.load();
        expect(mount).toHaveBeenCalledTimes(1);
    });

    it("no bundle is unavailable", () => {
        const scene = new PrismInsetScene3D(() => {});
        scene.update({ kind: "unavailable" });
        expect(scene.state()).toBe("unavailable");
        expect(scene.render(camera, document.createElement("canvas"), false, "a")).toBe(false);
    });

    it("is ready once the viewer can draw insets, and tells subscribers", () => {
        const scene = new PrismInsetScene3D(() => {});
        const viewer = fakeViewer(false);
        const listener = vi.fn();
        scene.subscribe(listener);
        scene.update({ kind: "viewer", element: viewer.element });
        expect(scene.state()).toBe("loading");
        viewer.element.ready = true;
        viewer.redraw();
        expect(scene.state()).toBe("ready");
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("draws through the inset camera, pivoting on the side's surface", () => {
        const scene = new PrismInsetScene3D(() => {});
        const viewer = fakeViewer();
        scene.update({ kind: "viewer", element: viewer.element });
        expect(scene.render(camera, document.createElement("canvas"), true, "inset-1")).toBe(true);
        expect(viewer.views[0]).toEqual({
            center: [12, 30], zoom: 9, rotation: 0.5, mirror: true, tilt: 0.7, focusZ: -0.0008,
        });
        scene.release("inset-1");
        expect(viewer.element.releaseInset).toHaveBeenCalledWith("inset-1");
    });

    it("a reloaded viewer replaces the old one's subscription", () => {
        const scene = new PrismInsetScene3D(() => {});
        const first = fakeViewer();
        const second = fakeViewer();
        scene.update({ kind: "viewer", element: first.element });
        scene.update({ kind: "viewer", element: second.element });
        expect(first.listeners.size).toBe(0);
        expect(second.listeners.size).toBe(1);
        scene.dispose();
        expect(second.listeners.size).toBe(0);
    });
});
