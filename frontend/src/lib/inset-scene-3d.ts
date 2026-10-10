import type { EcadInset3DState, EcadInsetCamera, EcadInsetScene3D } from "@/types/ecad-viewer";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

/** What the 3D tab knows about its bundle (IN-61). */
export type Inset3DSource =
    | { kind: "unmounted" }
    | { kind: "loading" }
    | { kind: "viewer"; element: PrismSemanticViewerElement }
    | { kind: "unavailable" };

/**
 * The 3D tab's board as the 3D view of PCB insets (IN-61). One object for
 * the visualizer's lifetime: the tab mounts, reloads and swaps its viewer
 * element behind it. `load` mounts the tab in the background.
 */
export class PrismInsetScene3D implements EcadInsetScene3D {
    #source: Inset3DSource = { kind: "unmounted" };
    #listeners = new Set<() => void>();
    #unhook: (() => void) | null = null;

    constructor(private readonly mount: () => void) {}

    /** The 3D tab's latest state. */
    update(source: Inset3DSource) {
        const previous = this.#source;
        if (
            previous.kind === source.kind
            && (previous.kind !== "viewer" || source.kind !== "viewer" || previous.element === source.element)
        ) return;
        this.#unhook?.();
        this.#unhook = null;
        this.#source = source;
        if (source.kind === "viewer") {
            this.#unhook = source.element.onSceneChange?.(() => this.#notify()) ?? null;
        }
        this.#notify();
    }

    state(): EcadInset3DState {
        const source = this.#source;
        if (source.kind === "unavailable") return "unavailable";
        if (source.kind === "viewer" && source.element.insetReady?.()) return "ready";
        return "loading";
    }

    load() {
        if (this.#source.kind === "unmounted") this.mount();
    }

    render(camera: EcadInsetCamera, canvas: HTMLCanvasElement, bottom: boolean, key: string) {
        const source = this.#source;
        if (source.kind !== "viewer" || !source.element.renderInset) return false;
        return source.element.renderInset(canvas, {
            center: [camera.center.x, camera.center.y],
            zoom: camera.zoom,
            rotation: camera.rotation,
            mirror: camera.mirror,
            tilt: camera.tilt ?? 0,
            focusZ: source.element.insetSurfaceZ?.(bottom) ?? 0,
        }, key);
    }

    release(key: string) {
        if (this.#source.kind === "viewer") this.#source.element.releaseInset?.(key);
    }

    subscribe(listener: () => void) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    dispose() {
        this.#unhook?.();
        this.#unhook = null;
        this.#listeners.clear();
    }

    #notify() {
        for (const listener of this.#listeners) listener();
    }
}
