import { useSyncExternalStore } from "react";

import { worldToViewportScreen, type ActiveSchematicPage } from "@/lib/comment-overlays";
import { syncViewerVariant, type ViewerVariantSync } from "@/lib/ecad-viewer-variant";
import { viewerRetries } from "@/lib/viewer-retry";
import type {
    CrossProbeRequest,
    ECadViewerElement,
    EcadCommentAnchorResolution,
    EcadCommentAreaDetail,
    EcadCommentContext,
    EcadCommentOverlayHitDetail,
    EcadCommentOverlaySet,
    EcadHighlightChangeDetail,
    EcadInsetScene3D,
    EcadMeasureState,
    EcadMeasureUnits,
    EcadModeChangeDetail,
    EcadNetRef,
    SchematicNetMembers,
    EcadNetStatistics,
    EcadNetStatisticsRef,
    EcadPcbObjectVisibilityKind,
    EcadPcbViewState,
    EcadSchematicPageState,
    EcadSemanticSelectionDetail,
    EcadViewportInsets,
} from "@/types/ecad-viewer";

/**
 * One adapter per `<ecad-viewer>` element of the project viewer, and one pair
 * for the schematic and the board.
 *
 * The element is vendored and most of its API is optional, so every caller
 * used to feature-check, cast event listeners and mirror the element's state
 * its own way. The adapter does that once: it owns the element reference, the
 * source load and its readiness, the element's mirrored state as one
 * snapshot, typed event subscriptions that survive element swaps, and (in the
 * pair) the inset peer and 3D links. React reads the snapshot with
 * `useEcadViewer`.
 */

export type EcadView = "sch" | "pcb";

export interface EcadSource {
    filename: string;
    content: string;
}

export type PcbLayerPreset = Parameters<NonNullable<ECadViewerElement["applyPcbLayerPreset"]>>[0];
type PcbObjectKind = keyof EcadPcbViewState["objectOpacity"];

/** What React reads from one element. */
export interface EcadViewerState {
    element: ECadViewerElement | null;
    /** The revision whose sources are loaded and painted; null while a load runs. */
    readyRevision: string | null;
    /** Completed loads so far; 0 until the first. */
    generation: number;
    insetsAvailable: boolean;
    insetMode: boolean;
    measureAvailable: boolean;
    measureMode: boolean;
    measureState: EcadMeasureState | null;
    /** Board only. */
    pcbViewState: EcadPcbViewState | null;
    /** Schematic only. */
    schematicPages: EcadSchematicPageState[];
    /** Schematic only. */
    activePage: ActiveSchematicPage | null;
}

/** Element events, decoded. `ready` is the adapter's own: a load finished. */
export interface EcadViewerEvents {
    selection: EcadSemanticSelectionDetail;
    crossprobe: EcadSemanticSelectionDetail;
    "highlight-change": EcadHighlightChangeDetail;
    "comment-overlay-click": EcadCommentOverlayHitDetail;
    "comment-area": EcadCommentAreaDetail;
    "inset-mode": EcadModeChangeDetail;
    "measure-mode": EcadModeChangeDetail;
    ready: { revisionKey: string };
}
type EventName = keyof EcadViewerEvents;
type Handler<K extends EventName> = (detail: EcadViewerEvents[K]) => void;

const RELAYED = [
    "selection",
    "crossprobe",
    "highlight-change",
    "comment-overlay-click",
    "comment-area",
] as const;

/** The first view-state-change can report no layers yet; the board is re-read this often, for the viewer retry window. */
const PCB_POLL_MS = 150;
const PCB_POLL_ATTEMPTS = viewerRetries(PCB_POLL_MS);

export interface EcadViewerOptions {
    /** A source load failed for good. */
    onLoadError?: (cause: unknown) => void;
    /** Test seam; defaults to the custom element registry. */
    whenDefined?: () => Promise<unknown>;
}

const EMPTY_STATE: EcadViewerState = {
    element: null,
    readyRevision: null,
    generation: 0,
    insetsAvailable: false,
    insetMode: false,
    measureAvailable: false,
    measureMode: false,
    measureState: null,
    pcbViewState: null,
    schematicPages: [],
    activePage: null,
};

function samePage(a: ActiveSchematicPage | null, b: ActiveSchematicPage | null) {
    return a === b || (a !== null && b !== null
        && a.projectPath === b.projectPath && a.filename === b.filename && a.page === b.page);
}

/**
 * Load a revision's sources, and give a failed paint one more go.
 *
 * The viewer paints as soon as sources land and throws "Image not ready" when
 * a bitmap on the sheet has not finished decoding, which rejects
 * `replaceSources`. Nothing used to catch that, so a transient decode race
 * ended the whole load: the viewer was never marked ready and the sheet sat
 * half-painted -- component bodies drawn, everything after the failing layer
 * missing -- with no way back short of a reload.
 *
 * A decode that lost one race has almost always finished by the next frame, so
 * the retry is a frame later rather than an interval. Two attempts, because a
 * third would be saying the failure is something other than a race, and if it
 * is then the caller should hear about it.
 */
async function loadSources(
    element: ECadViewerElement,
    payload: Parameters<ECadViewerElement["replaceSources"]>[0],
    isStale: () => boolean,
): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await element.replaceSources(payload);
            return;
        } catch (cause) {
            if (isStale()) return;
            if (attempt === 1) throw cause;
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            if (isStale()) return;
        }
    }
}

export class EcadViewer {
    #element: ECadViewerElement | null = null;
    #state: EcadViewerState = EMPTY_STATE;
    #subscribers = new Set<() => void>();
    #handlers = new Map<EventName, Set<(detail: never) => void>>();
    #unbind: (() => void) | null = null;
    #pollTimer: ReturnType<typeof setTimeout> | undefined;
    #loadToken = 0;
    #loaded: { revisionKey: string; sources: readonly EcadSource[] } | null = null;

    constructor(
        readonly view: EcadView,
        private readonly options: EcadViewerOptions = {},
        private readonly onAttach?: (element: ECadViewerElement | null, previous: ECadViewerElement | null) => void,
    ) {}

    get element(): ECadViewerElement | null {
        return this.#element;
    }

    getSnapshot = (): EcadViewerState => this.#state;

    subscribe = (listener: () => void): (() => void) => {
        this.#subscribers.add(listener);
        return () => {
            this.#subscribers.delete(listener);
        };
    };

    on<K extends EventName>(name: K, handler: Handler<K>): () => void {
        let set = this.#handlers.get(name);
        if (!set) {
            set = new Set();
            this.#handlers.set(name, set);
        }
        const entry = handler as (detail: never) => void;
        set.add(entry);
        return () => {
            set.delete(entry);
        };
    }

    /** The element's callback ref. Stable for the adapter's lifetime. */
    attach = (element: ECadViewerElement | null): void => {
        if (element === this.#element) return;
        const previous = this.#element;
        this.#unbind?.();
        this.#unbind = null;
        this.#stopPoll();
        this.#loadToken += 1;
        this.#loaded = null;
        this.#element = element;
        this.#state = {
            ...EMPTY_STATE,
            generation: this.#state.generation,
            element,
            ...(element ? this.#readModes(element) : {}),
            ...(element ? this.#readView(element) : {}),
            measureState: element?.measureState ?? null,
        };
        if (element) {
            this.#unbind = this.#bind(element);
            if (this.view === "pcb") this.#pollPcb(element, 0);
            // An element React created before the bundle defined it gains its API on upgrade.
            void this.#defined().then(() => {
                if (this.#element === element) this.#update({ ...this.#readModes(element), ...this.#readView(element) });
            });
        }
        this.onAttach?.(element, previous);
        this.#notify();
    };

    /** Let go of the element: listeners, the layer re-read and any load in flight stop. */
    dispose(): void {
        this.attach(null);
        this.#stopPoll();
    }

    /**
     * Load a revision's sources -- the root sheet first, then the project
     * file, page layout and other sheets -- in one `replaceSources` call. The
     * element does not repaint for appended sources, so a root loaded ahead
     * of its .kicad_pro kept KiCad's default title block until something else
     * repainted it. A call with the same revision and sources array does
     * nothing; any other call reloads.
     */
    load(revisionKey: string, sources: readonly EcadSource[]): void {
        const element = this.#element;
        if (!element || sources.length === 0) return;
        if (this.#loaded?.revisionKey === revisionKey && this.#loaded.sources === sources) return;
        this.#loaded = { revisionKey, sources };
        this.#setReadyRevision(null);
        void this.#load(element, revisionKey, [...sources]);
    }

    /** Whether `revisionKey` is loaded and painted in the current element. */
    isReady(revisionKey: string): boolean {
        return this.#state.readyRevision === revisionKey;
    }

    setActive(active: boolean): void {
        void this.#defined().then(() => this.#element?.setActive(active));
    }

    setViewportInsets(insets: EcadViewportInsets): void {
        const element = this.#element;
        if (!element) return;
        void this.#defined().then(() => {
            if (this.#element === element) element.setViewportInsets(insets);
        });
    }

    /**
     * Apply a design variant once the element is defined (`pending` without
     * one); null when `isCurrent` says the request was superseded meanwhile.
     */
    async syncVariant(variant: string | null, isCurrent: () => boolean = () => true): Promise<ViewerVariantSync | null> {
        await this.#defined();
        return isCurrent() ? syncViewerVariant(this.#element, variant) : null;
    }

    setInsetMode(on: boolean): void {
        this.#element?.setInsetMode?.(on);
    }

    setMeasureMode(on: boolean): void {
        this.#element?.setMeasureMode?.(on);
    }

    setMeasureUnits(units: EcadMeasureUnits): void {
        this.#element?.setMeasureUnits?.(units);
    }

    setCommentMode(enabled: boolean): void {
        const element = this.#element;
        if (!element) return;
        element.setCommentMode?.(enabled);
        if (enabled) element.setAttribute("comment-mode", "true");
        else element.removeAttribute("comment-mode");
    }

    setCommentOverlays(overlays: EcadCommentOverlaySet): EcadCommentAnchorResolution[] {
        return this.#element ? this.#element.setCommentOverlays(overlays) : [];
    }

    clearCommentOverlays(context: EcadCommentContext): void {
        this.#element?.clearCommentOverlays(context);
    }

    /** Screen position of a world point, in client coordinates. */
    screenPoint(x: number, y: number): { x: number; y: number } | null {
        return worldToViewportScreen(this.#element, x, y);
    }

    zoomToLocation(x: number, y: number): void {
        this.#element?.zoomToLocation(x, y);
    }

    switchPage(page: string): void {
        this.#element?.switchPage(page);
        this.#refreshView();
    }

    /** Switch page and resolve once applied; null when the element cannot. */
    showPage(page: string): Promise<void> | null {
        return this.#element?.showPage ? this.#element.showPage(page) : null;
    }

    navigateSchematicPage(direction: -1 | 1): boolean {
        return Boolean(this.#element?.navigateSchematicPage?.(direction));
    }

    navigateSchematicParent(): boolean {
        const handled = Boolean(this.#element?.navigateSchematicParent?.());
        this.#refreshView();
        return handled;
    }

    findLabelInstances(name: string): NonNullable<ReturnType<NonNullable<ECadViewerElement["findLabelInstances"]>>> {
        return this.#element?.findLabelInstances?.(name) ?? [];
    }

    /** Frame a label instance; null when the element cannot. */
    focusLabelInstance(uuid: string): Promise<boolean> | null {
        return this.#element?.focusLabelInstance ? this.#element.focusLabelInstance(uuid) : null;
    }

    /** Drop the inspected object, keeping the highlighted nets. */
    clearSelection(): void {
        this.#element?.clearSelection({ keepHighlights: true });
    }

    /** Null when no element can take the probe. */
    requestCrossProbe(request: CrossProbeRequest): ReturnType<ECadViewerElement["requestCrossProbe"]> | null {
        const element = this.#element;
        return typeof element?.requestCrossProbe === "function" ? element.requestCrossProbe(request) : null;
    }

    setHighlightedNets(nets: readonly EcadNetRef[]): void {
        this.#element?.setHighlightedNets?.(nets);
    }

    setSchematicHighlightedNets(nets: readonly SchematicNetMembers[]): void {
        void this.#element?.setSchematicHighlightedNets?.(nets);
    }

    focusHighlightedNets(): void {
        this.#element?.focusHighlightedNets?.();
    }

    /** Null before the board has loaded, for an unknown net, or when the element throws. */
    getNetStatistics(ref: EcadNetStatisticsRef): EcadNetStatistics | null {
        if (!this.#element || this.#state.generation === 0) return null;
        try {
            return this.#element.getNetStatistics?.(ref) ?? null;
        } catch {
            return null;
        }
    }

    applyPcbLayerPreset(preset: PcbLayerPreset): void {
        this.#updatePcb((element) => element.applyPcbLayerPreset?.(preset));
    }

    setPcbLayerVisibility(name: string, visible: boolean): void {
        this.#updatePcb((element) => element.setPcbLayerVisibility?.(name, visible));
    }

    setPcbLayerHighlight(name: string | null): void {
        this.#updatePcb((element) => element.setPcbLayerHighlight?.(name));
    }

    setPcbObjectOpacity(kind: PcbObjectKind, opacity: number): void {
        this.#updatePcb((element) => element.setPcbObjectOpacity?.(kind, opacity));
    }

    setPcbObjectVisibility(kind: EcadPcbObjectVisibilityKind, visible: boolean): void {
        this.#updatePcb((element) => element.setPcbObjectVisibility?.(kind, visible));
    }

    setPcbTrackHighlight(enabled: boolean): void {
        this.#updatePcb((element) => element.setPcbTrackHighlight?.(enabled));
    }

    #defined(): Promise<unknown> {
        return this.options.whenDefined?.() ?? customElements.whenDefined("ecad-viewer");
    }

    #load(element: ECadViewerElement, revisionKey: string, sources: EcadSource[]): Promise<void> {
        const token = ++this.#loadToken;
        const stale = () => token !== this.#loadToken || this.#element !== element;
        const run = async () => {
            await this.#defined();
            if (stale()) return;
            await loadSources(element, { revisionKey, sources }, stale);
            if (stale()) return;
            // Wait for parse and first paint: `ready` is a promise, not the `isReady` flag.
            await element.ready;
            if (stale()) return;
            this.#markReady(revisionKey);
        };
        return run().catch((cause: unknown) => {
            if (!stale()) this.options.onLoadError?.(cause);
        });
    }

    #setReadyRevision(readyRevision: string | null) {
        if (this.#state.readyRevision === readyRevision) return;
        this.#state = { ...this.#state, readyRevision };
        this.#notify();
    }

    #markReady(revisionKey: string) {
        this.#state = { ...this.#state, readyRevision: revisionKey, generation: this.#state.generation + 1 };
        this.#notify();
        this.#emit("ready", { revisionKey });
    }

    #bind(element: ECadViewerElement): () => void {
        const offs: Array<() => void> = [];
        const listen = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void) => {
            element.addEventListener(type, listener);
            offs.push(() => element.removeEventListener(type, listener));
        };
        for (const name of RELAYED) {
            listen(`ecad-viewer:${name}`, (event) => this.#emit(name, event.detail as never));
        }
        listen("ecad-viewer:view-state-change", () => this.#refreshView());
        listen("ecad-viewer:inset-mode", (event) => {
            this.#update(this.#readModes(element));
            this.#emit("inset-mode", event.detail);
        });
        listen("ecad-viewer:measure-mode", (event) => {
            this.#update({ ...this.#readModes(element), measureState: element.measureState ?? null });
            this.#emit("measure-mode", event.detail);
        });
        listen("ecad-viewer:measure", (event) => this.#update({ measureState: event.detail }));
        return () => offs.forEach((off) => off());
    }

    #readModes(element: ECadViewerElement): Partial<EcadViewerState> {
        return {
            insetsAvailable: Boolean(element.setInsetMode),
            insetMode: element.insetMode ?? false,
            measureAvailable: Boolean(element.setMeasureMode),
            measureMode: element.measureMode ?? false,
        };
    }

    #readView(element: ECadViewerElement): Partial<EcadViewerState> {
        if (this.view === "pcb") return { pcbViewState: element.getPcbViewState?.() ?? null };
        const active = element.getActiveSchematicPage?.();
        const activePage = active ? { projectPath: active.projectPath, filename: active.filename, page: active.page } : null;
        return {
            schematicPages: element.getSchematicPages?.() ?? [],
            activePage: samePage(this.#state.activePage, activePage) ? this.#state.activePage : activePage,
        };
    }

    #refreshView() {
        if (this.#element) this.#update(this.#readView(this.#element));
    }

    #updatePcb(action: (element: ECadViewerElement) => void) {
        if (!this.#element) return;
        action(this.#element);
        this.#refreshView();
    }

    #stopPoll() {
        if (this.#pollTimer !== undefined) clearTimeout(this.#pollTimer);
        this.#pollTimer = undefined;
    }

    #pollPcb(element: ECadViewerElement, attempt: number) {
        this.#pollTimer = setTimeout(() => {
            this.#pollTimer = undefined;
            // A test environment (or page) torn down under a pending re-read has no window left.
            if (typeof window === "undefined") return;
            if (this.#element !== element || attempt >= PCB_POLL_ATTEMPTS) return;
            const pcbViewState = element.getPcbViewState?.() ?? null;
            if (pcbViewState?.layers?.length) {
                this.#update({ pcbViewState });
                return;
            }
            this.#pollPcb(element, attempt + 1);
        }, PCB_POLL_MS);
    }

    #update(patch: Partial<EcadViewerState>) {
        this.#state = { ...this.#state, ...patch };
        this.#notify();
    }

    #notify() {
        for (const listener of this.#subscribers) listener();
    }

    #emit<K extends EventName>(name: K, detail: EcadViewerEvents[K]) {
        const set = this.#handlers.get(name);
        if (!set) return;
        for (const handler of set) (handler as Handler<K>)(detail);
    }
}

/**
 * The schematic and board elements of one project viewer. Each element gets
 * insets as it attaches; the board gets the 3D scene for its insets; and the
 * two are linked as each other's inset peer while both are attached.
 */
export class EcadViewerPair {
    readonly sch: EcadViewer;
    readonly pcb: EcadViewer;
    #peers: [ECadViewerElement, ECadViewerElement] | null = null;

    constructor(options: EcadViewerOptions & { inset3d?: EcadInsetScene3D } = {}) {
        this.sch = new EcadViewer("sch", options, (element) => this.#attached(element));
        this.pcb = new EcadViewer("pcb", options, (element, previous) => {
            previous?.setInset3D?.(null);
            if (element && options.inset3d) element.setInset3D?.(options.inset3d);
            this.#attached(element);
        });
    }

    get(view: EcadView): EcadViewer {
        return view === "sch" ? this.sch : this.pcb;
    }

    /** Let go of both elements (unlinking them) and stop their timers. */
    dispose(): void {
        this.pcb.dispose();
        this.sch.dispose();
    }

    /** One handler on both elements, told which one fired. */
    on<K extends EventName>(name: K, handler: (detail: EcadViewerEvents[K], view: EcadView) => void): () => void {
        const offSch = this.sch.on(name, (detail) => handler(detail, "sch"));
        const offPcb = this.pcb.on(name, (detail) => handler(detail, "pcb"));
        return () => {
            offSch();
            offPcb();
        };
    }

    #attached(element: ECadViewerElement | null) {
        element?.enableInsets?.();
        const sch = this.sch.element;
        const pcb = this.pcb.element;
        if (this.#peers && (this.#peers[0] !== sch || this.#peers[1] !== pcb)) {
            this.#peers[0].setInsetPeer?.(null);
            this.#peers[1].setInsetPeer?.(null);
            this.#peers = null;
        }
        if (!this.#peers && sch?.setInsetPeer && pcb?.setInsetPeer) {
            sch.setInsetPeer(pcb);
            pcb.setInsetPeer(sch);
            this.#peers = [sch, pcb];
        }
    }
}

const subscribeNothing = () => () => {};
const emptyState = () => EMPTY_STATE;

/** The element's state as React sees it; an empty state without a viewer. */
export function useEcadViewer(viewer: EcadViewer | null): EcadViewerState {
    return useSyncExternalStore(viewer?.subscribe ?? subscribeNothing, viewer?.getSnapshot ?? emptyState);
}
