import {
    useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
    X, Loader2, AlertCircle, ChevronLeft, ChevronRight,
    Plus, Minus, RefreshCw, MapPin, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ECadViewerElement } from "@/types/ecad-viewer";
import {
    COMMON_HOTKEYS,
    EcadInfoPanel,
    EcadViewerHost,
    HotkeysLegend,
    OVERLAY_FRAMES,
    useEcadInfoPanel,
    useViewerHotkeys,
    useViewerReadiness,
} from "@/components/ecad-viewer-shared";
import { categorise, CATEGORY_META, categoryFor, type Category } from "@/lib/diff-grouping";
import { useCrossProbeRunner } from "@/lib/cross-probe-retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchItem {
    type: string;
    uuid: string;
    x: number;
    y: number;
    // symbol fields
    reference?: string;
    value?: string;
    footprint?: string;
    lib_id?: string;
    rotation?: number;
    mirror?: string;
    unit?: number;
    in_bom?: boolean;
    on_board?: boolean;
    dnp?: boolean;
    // label/text/sheet fields
    text?: string;
    sheet_file?: string;
    sheet_name?: string;
    // wire/bus/junction geometry
    start_x?: number;
    start_y?: number;
    end_x?: number;
    end_y?: number;
    net?: string;
}

interface FieldChange {
    old: string | number | null;
    new: string | number | null;
}

interface ChangedItem {
    item: SchItem;       // new version
    old_item: SchItem;  // old version
    changes: Record<string, FieldChange>;
}

interface SchDiff {
    added: SchItem[];
    removed: SchItem[];
    changed: ChangedItem[];
}

interface SheetData {
    filename: string;
    rel_path: string;
    has_old: boolean;
    has_new: boolean;
    // Content is lazy-fetched from the cacheable per-commit file endpoint
    // (diff requested with include_content=false), so these stay null.
    old_content: string | null;
    new_content: string | null;
    diff: SchDiff;
}

interface SchematicDiffData {
    commit1: string;
    commit2: string;
    sheets: SheetData[];
}

interface DiffMarker {
    kind: "added" | "removed" | "changed";
    item: SchItem;       // new version (or only version for added/removed)
    old_item?: SchItem; // old version (only for changed)
    changes?: Record<string, FieldChange>;
}

interface SchematicDiffViewerProps {
    projectId: string;
    commit1: string; // newer
    commit2: string; // older
    onClose: () => void;
    embedded?: boolean;
    onCrossProbe?: (reference: string) => void;
    crossProbeTarget?: { ref: string; seq: number }; // reference to navigate to when switching from PCB
    /** Item id (uuid) to focus on when the diff loads. */
    focusItemId?: string;
    /** Filename (e.g. "power.kicad_sch") the focus item came from. When set,
        we pin to this sheet directly instead of guessing by uuid match — uuids
        can collide across sheets and the first match would otherwise win. */
    focusFilename?: string;
    /** When true, hide the OLD/NEW toggle for single-commit history views. */
    singleCommit?: boolean;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const KIND_COLOR: Record<DiffMarker["kind"], string> = {
    added: "#22c55e",
    removed: "#ef4444",
    changed: "#f59e0b",
};

const KIND_LABEL: Record<DiffMarker["kind"], string> = {
    added: "Added",
    removed: "Removed",
    changed: "Changed",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function itemLabel(item: SchItem): string {
    if (item.reference) return item.reference;
    if (item.text) return item.text.slice(0, 24) + (item.text.length > 24 ? "…" : "");
    if (item.sheet_name) return item.sheet_name;
    return item.type;
}

function fieldLabel(key: string): string {
    const LABELS: Record<string, string> = {
        lib_id: "Library ID",
        in_bom: "In BOM",
        on_board: "On Board",
        dnp: "DNP",
    };
    return LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(_field: string, value: unknown): string {
    if (value == null || value === "") return "–";
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value);
}

// ---------------------------------------------------------------------------
// EcadViewerHost (inline version so we don't import visualizer internals)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Overlay: colour-coded pins using getScreenLocation
// ---------------------------------------------------------------------------

interface OverlayProps {
    markers: DiffMarker[];
    viewerRef: React.RefObject<ECadViewerElement | null>;
    onMarkerClick: (marker: DiffMarker) => void;
    activeUuid: string | null;
    showing: "new" | "old";
    kickRef?: React.MutableRefObject<((frames?: number) => void) | null>;
}

// World-space half-extents (mm) per item type for the bounding box
// (only used for symbols and sheets — wire/text use their own geometry)
function _boxHalfExtent(type: string): { hw: number; hh: number } {
    switch (type) {
        case "symbol": return { hw: 5, hh: 4 };
        case "sheet":  return { hw: 6, hh: 5 };
        default:       return { hw: 2, hh: 1.2 }; // labels, text — tighter than before
    }
}

// Items rendered as SVG geometry rather than a bounding box
const WIRE_TYPES = new Set(["wire", "bus", "bus_entry"]);

function DiffOverlay({ markers, viewerRef, onMarkerClick, activeUuid, showing, kickRef }: OverlayProps) {
    const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const svgRef  = useRef<SVGSVGElement | null>(null);

    // Find the schematic inner element (the one that owns the canvas + renderer).
    // Mirrors the walk used by updatePositions for bbox lookups.
    type SchInnerEl = HTMLElement & { viewer?: { renderer?: { canvas?: HTMLCanvasElement } } };
    const findSchInner = useCallback((root: ShadowRoot | Element | null): SchInnerEl | null => {
        if (!root) return null;
        const sr = (root as HTMLElement).shadowRoot;
        const searchIn: ShadowRoot | Element = sr ?? root;
        const found = (searchIn as ShadowRoot).querySelector?.("kc-schematic-app, kc-schematic-viewer") as SchInnerEl | null;
        if (found) return found;
        for (const child of (searchIn as ShadowRoot).querySelectorAll?.("*") ?? []) {
            if ((child as HTMLElement).shadowRoot) {
                const f = findSchInner(child as HTMLElement);
                if (f) return f;
            }
        }
        return null;
    }, []);

    // Fallback: any <canvas> reachable via the shadow tree.
    const findAnyCanvas = useCallback((root: Element | ShadowRoot | null): HTMLCanvasElement | null => {
        if (!root) return null;
        // Prefer a sized canvas — there can be hidden 1x1 helper canvases.
        const candidates: HTMLCanvasElement[] = [];
        const pushFrom = (r: ShadowRoot | Element) => {
            const list = (r as ShadowRoot).querySelectorAll?.("canvas") ?? [];
            for (const c of list) candidates.push(c as HTMLCanvasElement);
        };
        pushFrom(root);
        const all = (root as ShadowRoot).querySelectorAll?.("*") ?? [];
        for (const el of all) {
            const sr = (el as HTMLElement).shadowRoot;
            if (sr) pushFrom(sr);
        }
        // Recurse one level deeper through nested shadow roots
        for (const el of all) {
            const sr = (el as HTMLElement).shadowRoot;
            if (sr) {
                const inner = sr.querySelectorAll("*");
                for (const e2 of inner) {
                    const sr2 = (e2 as HTMLElement).shadowRoot;
                    if (sr2) pushFrom(sr2);
                }
            }
        }
        return candidates.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0] ?? null;
    }, []);

    const dispatchWheel = useCallback((source: { deltaX: number; deltaY: number; deltaZ: number; deltaMode: number; clientX: number; clientY: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; }) => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const inner = findSchInner(viewer as unknown as Element);
        const canvas =
            inner?.viewer?.renderer?.canvas
            ?? findAnyCanvas(viewer as unknown as Element)
            ?? findAnyCanvas((viewer as unknown as HTMLElement).shadowRoot);
        const target = canvas ?? (viewer as unknown as EventTarget);
        target.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true, cancelable: true,
            deltaX: source.deltaX, deltaY: source.deltaY, deltaZ: source.deltaZ,
            deltaMode: source.deltaMode,
            clientX: source.clientX, clientY: source.clientY,
            ctrlKey: source.ctrlKey, shiftKey: source.shiftKey, altKey: source.altKey,
        }));
    }, [viewerRef, findSchInner, findAnyCanvas]);

    const forwardWheel = useCallback((e: React.WheelEvent) => { dispatchWheel(e); }, [dispatchWheel]);

    // The SVG has pointer-events:none so React onWheel never fires on children.
    // Attach a native wheel listener directly — it fires regardless of CSS.
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const handler = (e: WheelEvent) => { dispatchWheel(e); };
        svg.addEventListener("wheel", handler, { passive: true });
        return () => svg.removeEventListener("wheel", handler);
    }, [dispatchWheel]);

    // uuid → colored top line; uuid+":base" → black base line (both share coords)
    const svgElRefs = useRef<Map<string, SVGElement>>(new Map());
    const rafRef  = useRef<number | null>(null);
    const framesLeftRef = useRef(0);

    const updatePositions = useCallback((): boolean => {
        const viewer = viewerRef.current;
        if (!viewer?.getScreenLocation) return false;
        try {
            const rect = viewer.getBoundingClientRect();
            if (!rect.width) return false;
            let anyVisible = false;

            // Access the inner schematic renderer for real item bboxes.
            // The element is nested behind multiple shadow roots, so we do a
            // recursive walk — same strategy as getSchEl.
            type SchRenderer = { get_item_bbox?: (uuid: string) => { x: number; y: number; w: number; h: number } | undefined };
            type SchInner = Element & { viewer?: { schematic_renderer?: SchRenderer } };
            const findSchEl = (root: ShadowRoot | Element): SchInner | null => {
                const sr = (root as HTMLElement).shadowRoot;
                const searchIn = sr ?? root;
                const found = (searchIn as ShadowRoot).querySelector?.("kc-schematic-app, kc-schematic-viewer") as SchInner | null;
                if (found) return found;
                for (const child of (searchIn as ShadowRoot).querySelectorAll?.("*") ?? []) {
                    if ((child as HTMLElement).shadowRoot) {
                        const f = findSchEl(child as HTMLElement);
                        if (f) return f;
                    }
                }
                return null;
            };
            const schRenderer = findSchEl(viewer as unknown as Element)?.viewer?.schematic_renderer;

            for (const m of markers) {
                // For changed items, use the geometry of the version currently shown.
                // Refs are always keyed by m.item.uuid (the stable render key), so
                // use that for lookups regardless of which geometry version we read.
                const geom = (m.kind === "changed" && showing === "old" && m.old_item) ? m.old_item : m.item;
                const refKey = m.item.uuid;
                const isWire = WIRE_TYPES.has(geom.type);

                if (isWire) {
                    // Two lines share the same coords: shadow base + colored top
                    const svgEl  = svgElRefs.current.get(refKey);
                    const baseEl = svgElRefs.current.get(`${refKey}:base`);
                    if (!svgEl) continue;
                    const hasStartEnd =
                        geom.start_x != null && geom.start_y != null &&
                        geom.end_x   != null && geom.end_y   != null;
                    if (!hasStartEnd) {
                        svgEl.setAttribute("display", "none");
                        baseEl?.setAttribute("display", "none");
                        continue;
                    }
                    const p1 = viewer.getScreenLocation(geom.start_x!, geom.start_y!);
                    const p2 = viewer.getScreenLocation(geom.end_x!,   geom.end_y!);
                    if (!p1 || !p2) {
                        svgEl.setAttribute("display", "none");
                        baseEl?.setAttribute("display", "none");
                        continue;
                    }
                    const vis =
                        (Math.max(p1.x, p2.x) > 0 && Math.min(p1.x, p2.x) < rect.width) &&
                        (Math.max(p1.y, p2.y) > 0 && Math.min(p1.y, p2.y) < rect.height);
                    if (vis) {
                        for (const el of [svgEl, baseEl]) {
                            if (!el) continue;
                            el.setAttribute("x1", String(p1.x));
                            el.setAttribute("y1", String(p1.y));
                            el.setAttribute("x2", String(p2.x));
                            el.setAttribute("y2", String(p2.y));
                            el.removeAttribute("display");
                        }
                        anyVisible = true;
                    } else {
                        svgEl.setAttribute("display", "none");
                        baseEl?.setAttribute("display", "none");
                    }
                } else {
                    // Div box for symbols, sheets, labels, text
                    const el = boxRefs.current.get(refKey);
                    if (!el) continue;
                    const PAD = 6; // px offset around the kicanvas hover bbox
                    // Try real bbox using the UUID that exists in the currently-shown viewer
                    const realBBox = schRenderer?.get_item_bbox?.(geom.uuid);
                    let left: number, top: number, w: number, h: number;
                    if (realBBox) {
                        const tl = viewer.getScreenLocation(realBBox.x, realBBox.y);
                        const br = viewer.getScreenLocation(realBBox.x + realBBox.w, realBBox.y + realBBox.h);
                        if (!tl || !br) { el.style.display = "none"; continue; }
                        left = Math.min(tl.x, br.x) - PAD;
                        top  = Math.min(tl.y, br.y) - PAD;
                        w    = Math.abs(br.x - tl.x) + PAD * 2;
                        h    = Math.abs(br.y - tl.y) + PAD * 2;
                    } else {
                        const { hw, hh } = _boxHalfExtent(geom.type);
                        const tl = viewer.getScreenLocation(geom.x - hw, geom.y - hh);
                        const br = viewer.getScreenLocation(geom.x + hw, geom.y + hh);
                        if (!tl || !br) { el.style.display = "none"; continue; }
                        left = Math.min(tl.x, br.x);
                        top  = Math.min(tl.y, br.y);
                        w    = Math.abs(br.x - tl.x);
                        h    = Math.abs(br.y - tl.y);
                    }
                    const vis  = left + w > 0 && left < rect.width && top + h > 0 && top < rect.height;
                    if (vis) {
                        el.style.display = "";
                        el.style.left   = `${left}px`;
                        el.style.top    = `${top}px`;
                        el.style.width  = `${w}px`;
                        el.style.height = `${h}px`;
                        anyVisible = true;
                    } else {
                        el.style.display = "none";
                    }
                }
            }
            return anyVisible || markers.length === 0;
        } catch { return false; }
    }, [viewerRef, markers, showing]);

    const tick = useCallback(() => {
        const done = updatePositions();
        if (framesLeftRef.current > 0 || !done) {
            if (framesLeftRef.current > 0) framesLeftRef.current--;
            rafRef.current = requestAnimationFrame(tick);
        } else {
            rafRef.current = null;
        }
    }, [updatePositions]);

    const kick = useCallback((frames: number = OVERLAY_FRAMES.DEFAULT) => {
        framesLeftRef.current = Math.max(framesLeftRef.current, frames);
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(tick);
        }
    }, [tick]);

    // Expose kick to parent so zoom/toggle can trigger overlay refresh
    useEffect(() => {
        if (kickRef) kickRef.current = kick;
        return () => { if (kickRef) kickRef.current = null; };
    }, [kick, kickRef]);

    useEffect(() => {
        // mousedown starts a generous frame budget that easily covers a drag
        // mouseup tops it up for a few final settling frames
        // wheel kicks for inertial wheel events
        // No global mousemove listener — that fires too often and wastes work
        const onDown  = () => kick(OVERLAY_FRAMES.DRAG);
        const onUp    = () => kick(OVERLAY_FRAMES.SETTLE);
        const onWheel = () => kick(OVERLAY_FRAMES.SETTLE);
        window.addEventListener("mousedown", onDown);
        window.addEventListener("mouseup",   onUp);
        window.addEventListener("wheel",     onWheel, { passive: true });
        window.addEventListener("resize",    onUp);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("mouseup",   onUp);
            window.removeEventListener("wheel",     onWheel);
            window.removeEventListener("resize",    onUp);
            if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        };
    }, [kick]);

    // On mount / markers change: run enough frames to catch async ecad-viewer load
    useEffect(() => { kick(OVERLAY_FRAMES.LOAD); }, [markers, kick]);

    // Hook into the underlying viewer's on_viewport_change so the overlay
    // refreshes whenever the camera moves — including the post-load auto-fit,
    // which doesn't emit a DOM panzoom event and would otherwise leave boxes
    // stranded at stale coordinates until the user interacts.
    useEffect(() => {
        let stopped = false;
        const findInner = (host: HTMLElement): (Record<string, unknown> & { on_viewport_change?: () => void; __overlayKickHooked?: boolean }) | null => {
            const sr = host.shadowRoot;
            const root: ShadowRoot | HTMLElement = sr ?? host;
            const candidate = (root as ShadowRoot).querySelector?.("kc-schematic-app, kc-schematic-viewer") as (HTMLElement & { viewer?: Record<string, unknown> }) | null;
            const inner = candidate?.viewer;
            if (inner && typeof inner.on_viewport_change === "function") return inner as Record<string, unknown> & { on_viewport_change: () => void };
            for (const child of (root as ShadowRoot).querySelectorAll?.("*") ?? []) {
                if ((child as HTMLElement).shadowRoot) {
                    const f = findInner(child as HTMLElement);
                    if (f) return f;
                }
            }
            return null;
        };
        const tryHook = () => {
            if (stopped) return;
            const host = viewerRef.current;
            const inner = host ? findInner(host as unknown as HTMLElement) : null;
            if (!inner) {
                window.setTimeout(tryHook, 200);
                return;
            }
            if (inner.__overlayKickHooked) return;
            const orig = (inner.on_viewport_change as () => void).bind(inner);
            inner.on_viewport_change = function () {
                orig();
                kick(OVERLAY_FRAMES.VIEWPORT);
            };
            inner.__overlayKickHooked = true;
        };
        tryHook();
        return () => { stopped = true; };
    }, [viewerRef, kick]);

    return (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
            {/* SVG layer: wires and buses — shadow base + solid colored line */}
            <svg
                ref={svgRef}
                className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
            >
                {markers.filter(m => WIRE_TYPES.has(m.item.type)).map((m) => {
                    const color = KIND_COLOR[m.kind];
                    const isActive = m.item.uuid === activeUuid;
                    const wTop  = isActive ? 5 : 3.5;
                    const wBase = wTop + 3;
                    return (
                        <g key={m.item.uuid} style={{ cursor: "pointer", pointerEvents: "stroke" }} onClick={() => onMarkerClick(m)} onWheel={forwardWheel}>
                            {/* Solid black outline — opacity 0 for now; rounded only at terminations */}
                            <line
                                ref={(node) => {
                                    if (node) svgElRefs.current.set(`${m.item.uuid}:base`, node);
                                    else svgElRefs.current.delete(`${m.item.uuid}:base`);
                                }}
                                display="none"
                                x1="0" y1="0" x2="0" y2="0"
                                stroke="#000"
                                strokeOpacity="0"
                                strokeWidth={wBase}
                                strokeLinecap="round"
                            />
                            {/* Translucent color zebra on top */}
                            <line
                                ref={(node) => {
                                    if (node) svgElRefs.current.set(m.item.uuid, node);
                                    else svgElRefs.current.delete(m.item.uuid);
                                }}
                                display="none"
                                x1="0" y1="0" x2="0" y2="0"
                                stroke={color}
                                strokeWidth={wTop}
                                strokeOpacity={isActive ? 0.9 : 0.78}
                                strokeLinecap="butt"
                                strokeDasharray="16 12"
                                filter={isActive ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 3px ${color})` : `drop-shadow(0 0 3px ${color})`}
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Div boxes: symbols, sheets, labels, text */}
            {markers.filter(m => !WIRE_TYPES.has(m.item.type)).map((m) => {
                const color = KIND_COLOR[m.kind];
                const isActive = m.item.uuid === activeUuid;
                const HIT = 6;
                return (
                    <div
                        key={m.item.uuid}
                        ref={(node) => {
                            if (node) boxRefs.current.set(m.item.uuid, node);
                            else boxRefs.current.delete(m.item.uuid);
                        }}
                        className="absolute"
                        style={{
                            display: "none",
                            border: `2px solid ${color}`,
                            borderRadius: 3,
                            backgroundColor: `${color}1A`,
                            boxShadow: isActive
                                ? `0 0 8px 2px ${color}, 0 0 0 2px ${color}66, inset 0 0 0 1px ${color}44`
                                : `0 0 4px 1px ${color}99, 0 0 0 1px rgba(0,0,0,0.4)`,
                            pointerEvents: "none",
                        }}
                    >
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: HIT, pointerEvents: "auto", cursor: "pointer" }} onClick={() => onMarkerClick(m)} onWheel={forwardWheel} />
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: HIT, pointerEvents: "auto", cursor: "pointer" }} onClick={() => onMarkerClick(m)} onWheel={forwardWheel} />
                        <div style={{ position: "absolute", top: HIT, bottom: HIT, left: 0, width: HIT, pointerEvents: "auto", cursor: "pointer" }} onClick={() => onMarkerClick(m)} onWheel={forwardWheel} />
                        <div style={{ position: "absolute", top: HIT, bottom: HIT, right: 0, width: HIT, pointerEvents: "auto", cursor: "pointer" }} onClick={() => onMarkerClick(m)} onWheel={forwardWheel} />
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SchematicDiffViewer({
    projectId,
    commit1,
    commit2,
    onClose,
    embedded = false,
    onCrossProbe,
    crossProbeTarget,
    focusItemId,
    focusFilename,
    singleCommit = false,
}: SchematicDiffViewerProps) {
    const [data, setData] = useState<SchematicDiffData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // "new" = commit1 (newer), "old" = commit2 (older)
    const [showing, setShowing] = useState<"new" | "old">("new");
    const [activeMarker, setActiveMarker] = useState<DiffMarker | null>(null);

    // Parsing backend used to compute the diff: in-house ("native") or
    // kicad_monkey ("monkey"). Changing it refetches the diff. Lets us compare
    // the two parsers' results side by side on the same commits.
    const parser = (() => { try { return localStorage.getItem("kicad-prism:diff:parser") === "monkey" ? "monkey" : "native"; } catch { return "native"; } })() as "native" | "monkey";

    // Visibility toggles
    const [showOverlay, setShowOverlay] = useState(true);
    const [showAdded, setShowAdded] = useState(true);
    const [showRemoved, setShowRemoved] = useState(true);
    const [showChanged, setShowChanged] = useState(true);
    const [hiddenCategories, setHiddenCategories] = useState<Set<Category>>(new Set());

    const toggleCategory = useCallback((cat: Category) => {
        setHiddenCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
        });
    }, []);

    // Two always-mounted viewers — swapping visibility preserves pan/zoom state
    const newViewerRef = useRef<ECadViewerElement | null>(null);
    const oldViewerRef = useRef<ECadViewerElement | null>(null);
    const viewerRef = showing === "new" ? newViewerRef : oldViewerRef;
    const syncRafRef = useRef<number | null>(null);
    const overlayKickRef = useRef<((frames?: number) => void) | null>(null);

    // Camera shape we touch directly — avoids the bbox setter's viewport-dependent math
    type Vec2 = { x: number; y: number; set: (x: number, y: number) => void };
    type Camera = { center: Vec2; zoom: number };
    type InnerViewer = {
        viewport?: { camera?: Camera };
        draw?: () => void;
        zoom_fit_item?: (uuid: string) => void;
        zoom_fit_top_item?: () => void;
    };
    type SchEl = HTMLElement & { viewer?: InnerViewer };
    const schElCache = useRef<WeakMap<ECadViewerElement, SchEl>>(new WeakMap());

    const getSchEl = useCallback((host: ECadViewerElement): SchEl | null => {
        // Cache entry is valid only if the viewer is still ALIVE — i.e. its
        // Canvas2DRenderer hasn't been disposed (dispose() sets ctx2d = void 0).
        // React StrictMode's mount/unmount/remount cycle (and any future
        // viewer rebuild inside the shadow DOM) can leave us with a cached
        // dead reference while a fresh kc-schematic-app paints alongside —
        // see the parallel fix in pcb-diff-viewer.tsx.
        const cached = schElCache.current.get(host);
        const cachedInner = cached?.viewer as (InnerViewer & { renderer?: { ctx2d?: unknown } }) | undefined;
        if (cached && cachedInner?.viewport?.camera && cachedInner?.renderer?.ctx2d) return cached;
        // Cache miss or stale — re-walk and prefer the live viewer.
        const isLive = (el: SchEl | null): boolean => {
            const v = el?.viewer as (InnerViewer & { renderer?: { ctx2d?: unknown } }) | undefined;
            return !!v?.viewport?.camera && !!v?.renderer?.ctx2d;
        };
        const walk = (root: ShadowRoot | Element): SchEl | null => {
            const sr = (root as HTMLElement).shadowRoot;
            const searchRoot: ShadowRoot | Element = sr ?? root;
            // Prefer a LIVE kc-schematic-app, then any kc-schematic-app, then
            // a live kc-schematic-viewer, then any kc-schematic-viewer.
            const apps = Array.from((searchRoot as ShadowRoot).querySelectorAll?.("kc-schematic-app") ?? []) as SchEl[];
            for (const el of apps) if (isLive(el)) return el;
            const viewers = Array.from((searchRoot as ShadowRoot).querySelectorAll?.("kc-schematic-viewer") ?? []) as SchEl[];
            for (const el of viewers) if (isLive(el)) return el;
            // Recurse into children's shadow roots
            for (const el of (searchRoot as ShadowRoot).querySelectorAll?.("*") ?? []) {
                if ((el as HTMLElement).shadowRoot) {
                    const f = walk(el as HTMLElement);
                    if (f) return f;
                }
            }
            // Fall back to any candidate (even disposed) so callers that don't
            // need ctx2d still work — e.g. overlay positioning via getScreenLocation.
            return apps[0] ?? viewers[0] ?? null;
        };
        const result = host.shadowRoot ? walk(host) : null;
        if (isLive(result)) schElCache.current.set(host, result!);
        return result;
    }, []);

    const getCamera = useCallback((host: ECadViewerElement): Camera | null => {
        return getSchEl(host)?.viewer?.viewport?.camera ?? null;
    }, [getSchEl]);

    // Safe draw: only call draw() when the renderer's ctx2d is initialized.
    // ctx2d is set in setup() — if it's missing, the canvas isn't ready and draw() would crash.
    const safeDraw = useCallback((host: ECadViewerElement) => {
        const inner = getSchEl(host)?.viewer as (InnerViewer & { renderer?: { ctx2d?: unknown } }) | undefined;
        if (inner?.renderer?.ctx2d) inner.draw?.();
    }, [getSchEl]);

    // Camera we want to impose on the active viewer after a toggle or item click.
    // Released when the viewer fires a "panzoom" event (user panned/zoomed interactively).
    const imposeCamRef = useRef<{ zoom: number; cx: number; cy: number } | null>(null);

    const handleToggle = useCallback((next: "new" | "old") => {
        if (next === showing) return;
        const fromRef = showing === "new" ? newViewerRef : oldViewerRef;
        const toRef   = showing === "new" ? oldViewerRef : newViewerRef;
        const cam = fromRef.current ? getCamera(fromRef.current) : null;
        if (cam) {
            const state = { zoom: cam.zoom, cx: cam.center.x, cy: cam.center.y };
            imposeCamRef.current = state;
            // Pre-write camera into target viewer and queue a repaint BEFORE the visibility
            // flip, so our rAF is ahead of the viewer's own ResizeObserver-triggered draw().
            const toHost = toRef.current;
            const toCam  = toHost ? getCamera(toHost) : null;
            if (toCam && toHost) {
                toCam.zoom = state.zoom;
                toCam.center.set(state.cx, state.cy);
                safeDraw(toHost);
            }
        }
        setShowing(next);
    }, [showing, getCamera, safeDraw]);

    const showingRef = useRef(showing);
    useEffect(() => { showingRef.current = showing; }, [showing]);

    // Ref attached to the viewer container div — used to detect user interaction for impose release.
    const viewerContainerRef = useRef<HTMLDivElement | null>(null);

    const viewerRefsArr = useRef([newViewerRef, oldViewerRef]).current;
    const { detail: selectedDetail, clear: clearSelectedDetail } = useEcadInfoPanel({
        containerRef: viewerContainerRef,
        viewerRefs: viewerRefsArr,
    });

    // Continuous loop: whenever imposeCamRef is set, keep writing it to the active viewer.
    // Released when the user interacts with the viewer area (pointerdown or wheel).
    useEffect(() => {
        let raf = 0;
        const tick = () => {
            const impose = imposeCamRef.current;
            if (impose) {
                const activeRef = showingRef.current === "new" ? newViewerRef : oldViewerRef;
                const host = activeRef.current;
                const cam = host ? getCamera(host) : null;
                if (cam && host) {
                    cam.zoom = impose.zoom;
                    cam.center.set(impose.cx, impose.cy);
                    safeDraw(host);
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        // pointerdown and wheel on the viewer container release the impose lock.
        // These events compose through shadow DOM so they reach the host container.
        const release = () => { imposeCamRef.current = null; };
        const container = viewerContainerRef.current;
        container?.addEventListener("pointerdown", release);
        container?.addEventListener("wheel", release, { passive: true });

        return () => {
            if (raf) cancelAnimationFrame(raf);
            container?.removeEventListener("pointerdown", release);
            container?.removeEventListener("wheel", release);
        };

    }, [getCamera, safeDraw]);

    const [activeSheet, setActiveSheet] = useState<string>("");

    // Readiness signals — both hosts must reach a state where camera AND the
    // Canvas2D context are both up before we can drive the viewer. The camera
    // is created early in Viewer.setup(), but the renderer's ctx2d is set
    // later inside its own async setup(). Probing both prevents firing focus
    // while safeDraw would silently no-op. See parallel fix in pcb-diff-viewer.
    const newViewerKey = data ? `sch-diff-new-${data.commit1}-${data.commit2}` : "sch-diff-new-pending";
    const oldViewerKey = data ? `sch-diff-old-${data.commit1}-${data.commit2}` : "sch-diff-old-pending";
    const schReadyProbe = useCallback(
        (host: ECadViewerElement) => {
            const inner = getSchEl(host)?.viewer as (InnerViewer & { renderer?: { ctx2d?: unknown } }) | undefined;
            return !!inner?.viewport?.camera && !!inner?.renderer?.ctx2d;
        },
        [getSchEl],
    );
    const { ready: newReady } = useViewerReadiness({ host: newViewerRef, viewerKey: newViewerKey, probe: schReadyProbe });
    const { ready: oldReady } = useViewerReadiness({ host: oldViewerRef, viewerKey: oldViewerKey, probe: schReadyProbe });

    // Counter that bumps every time the viewer finishes loading a sheet. Used
    // as a focus-gate dep so the effect re-evaluates after the rAF watcher
    // eventually drives the viewer onto the target sheet — without it, the
    // gate could be stuck "waiting for the right document" forever despite no
    // other React deps changing.
    const [sheetLoadTick, setSheetLoadTick] = useState(0);
    useEffect(() => {
        const bump = () => setSheetLoadTick(t => t + 1);
        const attach = (host: ECadViewerElement | null) => {
            if (!host) return () => {};
            host.addEventListener("kicanvas:sheet:loaded", bump);
            const sr = (host as HTMLElement).shadowRoot;
            sr?.addEventListener("kicanvas:sheet:loaded", bump);
            return () => {
                host.removeEventListener("kicanvas:sheet:loaded", bump);
                sr?.removeEventListener("kicanvas:sheet:loaded", bump);
            };
        };
        let detachNew: (() => void) | null = null;
        let detachOld: (() => void) | null = null;
        const tryAttach = () => {
            if (!detachNew && newViewerRef.current) detachNew = attach(newViewerRef.current);
            if (!detachOld && oldViewerRef.current) detachOld = attach(oldViewerRef.current);
        };
        tryAttach();
        const poll = window.setInterval(() => {
            tryAttach();
            if (detachNew && detachOld) window.clearInterval(poll);
        }, 100);
        window.setTimeout(() => window.clearInterval(poll), 5000);
        return () => {
            window.clearInterval(poll);
            detachNew?.();
            detachOld?.();
        };
    }, []);

    // Pin both viewer hosts to whatever sheet React thinks is active. Naively
    // this would be a one-shot switchPage call when activeSheet changes, but
    // the underlying ecad-viewer fights us:
    //   - EcadViewerHost's mount (whenDefined → append blobs → load_src) is
    //     async; switchPage calls before load_src completes are dropped, and
    //     load_src itself always loads files[0] (the root) by default.
    //   - The viewer's project fires a "change" event after init that triggers
    //     another auto-load of get_first_page — a second hijack that arrives
    //     AFTER any one-shot switchPage has already returned.
    // So we run a rAF watcher that reads each host's current document filename
    // and re-pushes switchPage whenever it drifts from desiredSheetRef. The
    // PUSH_COOLDOWN_MS throttle prevents hammering a load that's still in
    // flight (sch_name doesn't update until it resolves).
    const desiredSheetRef = useRef<string>("");

    useEffect(() => {
        desiredSheetRef.current = activeSheet;
        if (!activeSheet) return;
        newViewerRef.current?.switchPage?.(activeSheet);
        oldViewerRef.current?.switchPage?.(activeSheet);
    }, [activeSheet]);

    useEffect(() => {
        let raf = 0;
        const PUSH_COOLDOWN_MS = 200;
        const lastPushAt = new Map<ECadViewerElement, number>();

        const reconcileHost = (host: ECadViewerElement | null) => {
            if (!host) return;
            const want = desiredSheetRef.current;
            if (!want) return;
            const schEl = getSchEl(host) as (SchEl & { viewer?: { document?: { filename?: string } } }) | null;
            // viewer.document.filename is the live current page on kc-schematic-app
            // (the sch_name getter is undefined in this build).
            const current = schEl?.viewer?.document?.filename ?? "";
            if (current === want) {
                if (lastPushAt.has(host)) lastPushAt.delete(host);
                return;
            }
            const now = performance.now();
            const last = lastPushAt.get(host) ?? 0;
            if (now - last < PUSH_COOLDOWN_MS) return;
            lastPushAt.set(host, now);
            host.switchPage?.(want);
        };

        const tick = () => {
            reconcileHost(newViewerRef.current);
            reconcileHost(oldViewerRef.current);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cancel pending rAFs on unmount
    useEffect(() => () => {
        if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
    }, []);

    // Fetch diff data
    useEffect(() => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ commit1, commit2, parser });
        // include_content=false: sheet files are lazy-fetched separately from
        // the cacheable per-commit file endpoint (see the sheet-content effect).
        params.set("include_content", "false");
        fetch(`/api/projects/${projectId}/schematic-diff?${params}`)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<SchematicDiffData>;
            })
            .then((d) => {
                setData(d);
                if (d.sheets.length > 0) {
                    // Prefer focusFilename when it points at a real sheet, so
                    // a re-firing fetch (StrictMode, parent re-render) doesn't
                    // clobber the focus path's sheet choice with the root sheet.
                    const preferred = focusFilename && d.sheets.some(s => s.filename === focusFilename)
                        ? focusFilename
                        : d.sheets[0].filename;
                    setActiveSheet(preferred);
                }
                setLoading(false);
            })
            .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : "Failed to load diff");
                setLoading(false);
            });
    // focusFilename intentionally read at effect-creation time only — we don't
    // want fetch to re-fire when it changes. `parser` IS a dep: switching the
    // parsing backend refetches the diff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, commit1, commit2, parser]);

    const activeSheetData = data?.sheets.find(s => s.filename === activeSheet) ?? null;

    // Lazy-fetched sheet file contents, keyed `${side}:${filename}`. Populated
    // from the cacheable /commits/{hash}/file endpoint so each sheet file is
    // downloaded (gzipped) at most once per commit and cached by the browser.
    const [sheetContent, setSheetContent] = useState<Record<string, string>>({});

    useEffect(() => {
        setSheetContent({});
    }, [commit1, commit2]);

    useEffect(() => {
        if (!data) return;
        const controller = new AbortController();
        const fetchSide = async (side: "new" | "old", commit: string, sheet: SheetData) => {
            const key = `${side}:${sheet.filename}`;
            const url = `/api/projects/${projectId}/commits/${commit}/file?path=${encodeURIComponent(sheet.rel_path)}`;
            const r = await fetch(url, { signal: controller.signal });
            if (!r.ok) return;
            const text = await r.text();
            setSheetContent(prev => (prev[key] !== undefined ? prev : { ...prev, [key]: text }));
        };
        for (const sheet of data.sheets) {
            if (sheet.has_new) void fetchSide("new", data.commit1, sheet).catch(() => {});
            if (sheet.has_old) void fetchSide("old", data.commit2, sheet).catch(() => {});
        }
        return () => controller.abort();
    }, [data, projectId]);

    // KiCad-style hotkeys: zoom, fit, redraw, sheet nav, close.
    const cycleSheet = useCallback((delta: 1 | -1) => {
        const sheets = data?.sheets;
        if (!sheets || sheets.length === 0) return;
        const idx = sheets.findIndex(s => s.filename === activeSheet);
        const next = sheets[((idx === -1 ? 0 : idx) + delta + sheets.length) % sheets.length];
        if (next) setActiveSheet(next.filename);
    }, [data, activeSheet]);
    useViewerHotkeys({
        containerRef: viewerContainerRef,
        viewerRefs: viewerRefsArr,
        onNextSheet: () => cycleSheet(1),
        onPrevSheet: () => cycleSheet(-1),
        onClose,
    });

    // All markers for the active sheet (for the sidebar list)
    const allMarkers: DiffMarker[] = [];
    if (activeSheetData) {
        for (const item of activeSheetData.diff.added)   allMarkers.push({ kind: "added",   item });
        for (const item of activeSheetData.diff.removed)  allMarkers.push({ kind: "removed", item });
        for (const { item, old_item, changes } of activeSheetData.diff.changed) allMarkers.push({ kind: "changed", item, old_item, changes });
    }

    // Filtered markers shown on the overlay
    const visibleMarkers = !showOverlay ? [] : allMarkers.filter((m) => {
        if (hiddenCategories.has(categoryFor(m.item.type))) return false;
        if (m.kind === "added"   && !showAdded)   return false;
        if (m.kind === "removed" && !showRemoved)  return false;
        if (m.kind === "changed" && !showChanged)  return false;
        if (m.kind === "added"   && showing !== "new") return false;
        if (m.kind === "removed" && showing !== "old") return false;
        return true;
    });

    const totalChanges = allMarkers.length;

    // Total changes across ALL sheets (for sheet selector badges)
    const sheetChangeCounts = data
        ? Object.fromEntries(data.sheets.map(s => [
            s.filename,
            s.diff.added.length + s.diff.removed.length + s.diff.changed.length,
          ]))
        : {};

    // Navigate to a marker without triggering the viewer's selection highlight.
    // zoom_fit_item internally calls paint_selected which draws a blue box on the entity —
    // instead we replicate just the camera move and clear any existing selection.
    const zoomToMarkerOn = useCallback((marker: DiffMarker, target: "new" | "old") => {
        const ref = target === "new" ? newViewerRef : oldViewerRef;
        const viewer = ref.current;
        if (!viewer) return;
        try {
            const schEl = getSchEl(viewer);
            const inner = schEl?.viewer as (InnerViewer & {
                schematic_renderer?: { get_item_bbox?: (uuid: string) => unknown };
                paint_selected?: (bbox?: unknown) => void;
            }) | undefined;
            const camera = inner?.viewport?.camera;
            if (!inner || !camera) return;

            // Try to get the item's bbox from the renderer map
            const bbox = inner.schematic_renderer?.get_item_bbox?.(marker.item.uuid) as
                ({ grow?: (n: number) => unknown } | undefined);

            if (bbox) {
                // Replicate zoom_fit_item but skip paint_selected
                const grown = bbox.grow?.(20) ?? bbox;
                const cameraWithBBox = camera as typeof camera & { bbox?: unknown };
                cameraWithBBox.bbox = grown;
            } else {
                // UUID not indexed — manually center on item position
                camera.zoom = 20;
                camera.center.set(marker.item.x, marker.item.y);
            }

            // Clear any existing selection highlight
            inner.paint_selected?.();

            // Clear any prior impose so the bbox fit is allowed to settle.
            imposeCamRef.current = null;
            safeDraw(viewer);
        } catch { /* ignore */ }
        overlayKickRef.current?.(OVERLAY_FRAMES.ZOOM_TO);
    }, [getSchEl, safeDraw]);

    const handleMarkerClick = useCallback((m: DiffMarker) => {
        setActiveMarker(prev => prev?.item.uuid === m.item.uuid ? null : m);
        const targetSide: "new" | "old" =
            m.kind === "added"   ? "new" :
            m.kind === "removed" ? "old" :
            showing;
        if (targetSide !== showing) {
            handleToggle(targetSide);
            // Defer until after React flushes the showing change.
            requestAnimationFrame(() => zoomToMarkerOn(m, targetSide));
        } else {
            zoomToMarkerOn(m, targetSide);
        }
    }, [zoomToMarkerOn, showing, handleToggle]);

    // Resolve the focus item synchronously from data. Returns null until data
    // is available or the uuid can't be found on the requested sheet. When
    // focusFilename is provided we restrict the search to that sheet — uuids
    // can repeat across sheets (hierarchical instances).
    type FocusTarget = { sheet: string; marker: DiffMarker | null };
    const focusTarget = useMemo<FocusTarget | null>(() => {
        if (!data) return null;
        if (!focusItemId && !focusFilename) return null;
        const candidateSheets = focusFilename
            ? data.sheets.filter(s => s.filename === focusFilename)
            : data.sheets;
        if (focusItemId) {
            for (const s of candidateSheets) {
                const inAdded   = s.diff.added.find(i => i.uuid === focusItemId);
                const inRemoved = s.diff.removed.find(i => i.uuid === focusItemId);
                const inChanged = s.diff.changed.find(c => c.item.uuid === focusItemId);
                if (inAdded)   return { sheet: s.filename, marker: { kind: "added",   item: inAdded } };
                if (inRemoved) return { sheet: s.filename, marker: { kind: "removed", item: inRemoved } };
                if (inChanged) return { sheet: s.filename, marker: { kind: "changed", item: inChanged.item, changes: inChanged.changes } };
            }
        }
        // No uuid match but the filename is known — pin the sheet without a marker.
        if (focusFilename && data.sheets.some(s => s.filename === focusFilename)) {
            return { sheet: focusFilename, marker: null };
        }
        return null;
    }, [data, focusItemId, focusFilename]);

    // Focus flow — event-driven state machine, no timers. Fires exactly once
    // per focus request when all prerequisites converge:
    //   1. focusTarget is resolved.
    //   2. activeSheet matches the target sheet (we drive setActiveSheet if not).
    //   3. The target side's viewer host has reached readiness (camera +
    //      ctx2d both live), AND its current document is the target sheet
    //      (the rAF watcher above eventually drives this).
    //   4. handleMarkerClick is then safe to call.
    const focusFiredRef = useRef<string | null>(null);
    useEffect(() => {
        if (!focusTarget) return;
        const fingerprint = `${focusTarget.sheet}::${focusTarget.marker?.item.uuid ?? ""}`;
        if (focusFiredRef.current === fingerprint) return;
        if (focusTarget.sheet !== activeSheet) {
            setActiveSheet(focusTarget.sheet);
            return;
        }
        // Determine which side will be navigated to.
        const targetSide: "new" | "old" = focusTarget.marker
            ? (focusTarget.marker.kind === "removed" ? "old" : "new")
            : showing;
        const sideReady = targetSide === "new" ? newReady : oldReady;
        if (!sideReady) return;
        // Verify the viewer is actually showing the target sheet — otherwise
        // the bbox lookup would run against the wrong page's renderer index.
        const host = (targetSide === "new" ? newViewerRef : oldViewerRef).current;
        const innerWithDoc = host ? (getSchEl(host)?.viewer as (InnerViewer & { document?: { filename?: string } }) | undefined) : undefined;
        if (innerWithDoc?.document?.filename !== focusTarget.sheet) return;
        focusFiredRef.current = fingerprint;
        if (focusTarget.marker) handleMarkerClick(focusTarget.marker);
    }, [focusTarget, activeSheet, newReady, oldReady, showing, getSchEl, handleMarkerClick, sheetLoadTick]);

    // Diagnostic safety net: if everything fails to converge after 8s, log
    // which signal is missing. No best-effort fire — we don't want to drive
    // a half-mounted viewer.
    useEffect(() => {
        if (!focusTarget) return;
        const fingerprint = `${focusTarget.sheet}::${focusTarget.marker?.item.uuid ?? ""}`;
        if (focusFiredRef.current === fingerprint) return;
        const t = window.setTimeout(() => {
            if (focusFiredRef.current === fingerprint) return;

            console.warn("[sch-diff] focus stalled — target:", focusTarget,
                "activeSheet:", activeSheet,
                "newReady:", newReady, "oldReady:", oldReady);
        }, 8000);
        return () => window.clearTimeout(t);
    }, [focusTarget, activeSheet, newReady, oldReady]);

    // Fire onCrossProbe when the user selects an item.
    // kicanvas:select bubbles+composed so it reaches the container div.
    const onCrossProbeRef = useRef(onCrossProbe);
    useEffect(() => { onCrossProbeRef.current = onCrossProbe; }, [onCrossProbe]);
    useEffect(() => {
        const container = viewerContainerRef.current;
        if (!container) return;
        const handler = (e: Event) => {
            const item = (e as CustomEvent<{ item: unknown }>).detail?.item as Record<string, unknown> | null;
            if (!item) return;
            const ref = (item.reference ?? item.Reference ?? item.designator) as string | undefined;
            if (ref && /^[A-Za-z]+\d+/.test(ref)) onCrossProbeRef.current?.(ref);
        };
        container.addEventListener("kicanvas:select", handler);
        return () => container.removeEventListener("kicanvas:select", handler);
    }, []);

    // Navigate to a reference when cross-probed from the PCB / BOM viewer.
    //
    // kicanvas's requestCrossProbe only searches the currently-active sheet, so
    // for multi-sheet projects we first locate which sheet actually contains
    // the reference by string-searching each sheet's content. If that sheet
    // differs from activeSheet, we drive setActiveSheet — the existing rAF
    // watcher / readiness machinery then re-runs this effect once the viewer's
    // document.filename catches up, and we fire the probe.
    const crossProbeRunner = useCrossProbeRunner();
    // Tracks which seq has already been dispatched so re-renders caused by
    // navigation (sheetLoadTick, readiness changes) don't re-fire the probe and
    // lock the viewer back onto a stale component.
    const crossProbeFiredSeqRef = useRef<number>(-1);
    useEffect(() => {
        if (!crossProbeTarget || !data) return;
        // Already dispatched this exact request — don't re-probe.
        if (crossProbeTarget.seq === crossProbeFiredSeqRef.current) return;

        const { ref } = crossProbeTarget;

        // Locate the sheet containing this reference. The content strings are
        // full .kicad_sch s-expressions; a property of name "Reference" with the
        // target value uniquely identifies a symbol instance on that sheet.
        // Quote-escape regex meta in the reference (designators are A-Za-z0-9).
        const refEscaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const refRe = new RegExp(`\\(property\\s+"Reference"\\s+"${refEscaped}"`);
        const containingSheet = data.sheets.find(s => {
            const content = sheetContent[`${showing}:${s.filename}`];
            return content ? refRe.test(content) : false;
        });
        if (containingSheet && containingSheet.filename !== activeSheet) {
            setActiveSheet(containingSheet.filename);
            return; // Re-run once activeSheet propagates and the viewer reloads.
        }

        // Gate on readiness so we don't probe a viewer whose camera isn't live.
        const sideReady = showing === "new" ? newReady : oldReady;
        if (!sideReady) return;

        // Verify the visible viewer actually shows the sheet we want before
        // firing — same precondition the focus flow uses.
        const host = (showing === "new" ? newViewerRef : oldViewerRef).current;
        const innerDoc = host ? (getSchEl(host)?.viewer as (InnerViewer & { document?: { filename?: string } }) | undefined) : undefined;
        if (containingSheet && innerDoc?.document?.filename !== containingSheet.filename) return;

        crossProbeFiredSeqRef.current = crossProbeTarget.seq;
        crossProbeRunner.run(host, "PCB", "SCH", ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crossProbeTarget, data, activeSheet, newReady, oldReady, showing, sheetLoadTick, sheetContent]);

    return (
        <div className={embedded ? "h-full bg-background flex flex-col" : "fixed inset-0 z-50 bg-background flex flex-col"}>
            {/* Header — hidden when embedded (modal owns the chrome) */}
            {!embedded && (
                <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold">Interactive Schematic Diff</h2>
                        <p className="text-xs text-muted-foreground font-mono">
                            {commit2.slice(0, 7)} → {commit1.slice(0, 7)}
                        </p>
                    </div>
                </div>
            )}

            {/* Body: sidebar + viewer */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── Left sidebar ── */}
                <div className="w-56 shrink-0 border-r flex flex-col bg-background overflow-hidden">

                    {/* OLD / NEW toggle */}
                    {data && !singleCommit && (
                        <div className="px-3 pt-3 pb-2 shrink-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Version</p>
                            <div className="flex rounded-md border overflow-hidden text-xs font-medium w-full">
                                <button
                                    className={`flex-1 py-1.5 transition-colors ${showing === "old" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                    onClick={() => handleToggle("old")}
                                >
                                    <ChevronLeft className="inline h-3 w-3 mr-0.5" />OLD
                                </button>
                                <button
                                    className={`flex-1 py-1.5 transition-colors ${showing === "new" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                    onClick={() => handleToggle("new")}
                                >
                                    NEW<ChevronRight className="inline h-3 w-3 ml-0.5" />
                                </button>
                            </div>
                        </div>
                    )}


                    {/* Filter toggles */}
                    {data && (
                        <div className="px-3 pt-2 pb-2 shrink-0 space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Show</p>
                            <button
                                onClick={() => setShowOverlay(v => !v)}
                                className={`flex items-center justify-between w-full px-2 py-1 rounded text-xs border transition-colors ${showOverlay ? "border-border text-foreground" : "border-border text-muted-foreground opacity-50"}`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <RefreshCw className="h-3 w-3" />
                                    Highlights
                                </span>
                                <span className="text-[10px] font-mono">{showOverlay ? "on" : "off"}</span>
                            </button>
                            {(["added", "removed", "changed"] as const).map((kind) => {
                                const counts = {
                                    added:   activeSheetData?.diff.added.length   ?? 0,
                                    removed: activeSheetData?.diff.removed.length ?? 0,
                                    changed: activeSheetData?.diff.changed.length ?? 0,
                                };
                                const active = kind === "added" ? showAdded : kind === "removed" ? showRemoved : showChanged;
                                const toggle = kind === "added" ? () => setShowAdded(v => !v) : kind === "removed" ? () => setShowRemoved(v => !v) : () => setShowChanged(v => !v);
                                const Icon   = kind === "added" ? Plus : kind === "removed" ? Minus : RefreshCw;
                                return (
                                    <button
                                        key={kind}
                                        onClick={toggle}
                                        className={`flex items-center justify-between w-full px-2 py-1 rounded text-xs border transition-opacity ${active ? "opacity-100" : "opacity-40"}`}
                                        style={{ borderColor: KIND_COLOR[kind], color: KIND_COLOR[kind] }}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <Icon className="h-3 w-3" />
                                            {KIND_LABEL[kind]}
                                        </span>
                                        <span className="font-mono font-semibold">{counts[kind]}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Sheet selector */}
                    {data && data.sheets.length > 1 && (
                        <div className="px-3 pb-2 shrink-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Sheets</p>
                            <div className="space-y-0.5">
                                {data.sheets.map((sheet) => {
                                    const count = sheetChangeCounts[sheet.filename] ?? 0;
                                    const isActive = sheet.filename === activeSheet;
                                    const sheetStatus = !sheet.has_old ? "added" : !sheet.has_new ? "removed" : null;
                                    return (
                                        <button
                                            key={sheet.filename}
                                            onClick={() => {
                                                setActiveSheet(sheet.filename);
                                                setActiveMarker(null);
                                                newViewerRef.current?.switchPage?.(sheet.filename);
                                                oldViewerRef.current?.switchPage?.(sheet.filename);
                                            }}
                                            className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"}`}
                                        >
                                            {sheetStatus && (
                                                <span
                                                    className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded leading-none"
                                                    style={{
                                                        backgroundColor: `${KIND_COLOR[sheetStatus]}22`,
                                                        color: KIND_COLOR[sheetStatus],
                                                        border: `1px solid ${KIND_COLOR[sheetStatus]}66`,
                                                    }}
                                                    title={sheetStatus === "added" ? "Sheet added in new version" : "Sheet removed in new version"}
                                                >
                                                    {sheetStatus === "added" ? "+" : "−"}
                                                </span>
                                            )}
                                            <span className="truncate flex-1">{sheet.filename.replace(/\.kicad_sch$/, "")}</span>
                                            {count > 0 && (
                                                <span className="ml-auto shrink-0 text-[10px] font-mono font-semibold px-1 rounded bg-muted">{count}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="border-t mx-3 shrink-0" />

                    {/* Navigable item list — grouped by unified category. */}
                    <div className="flex-1 overflow-y-auto py-2">
                        {!data && !loading && (
                            <p className="text-xs text-muted-foreground px-4 py-2">No data</p>
                        )}
                        {data && totalChanges === 0 && (
                            <p className="text-xs text-muted-foreground px-4 py-4 text-center">No changes detected</p>
                        )}
                        {data && (() => {
                            // Sidebar always shows ALL markers (hidden categories stay
                            // listed but their overlay highlights are suppressed).
                            const groups = categorise(allMarkers.map(m => ({ kind: m.kind, item: m.item })));
                            // Reverse-lookup so a clicked sub-row routes back to its DiffMarker.
                            const markerByUuid = new Map(allMarkers.map(m => [m.item.uuid, m] as const));
                            // Group the buckets by category so we render a single
                            // category header (e.g. "Nets") and list all sub-groups
                            // beneath it, instead of repeating the header per net.
                            const categories = Array.from(new Set(groups.map(g => g.category)))
                                .sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order as number);
                            return categories.map((catKey) => {
                                const catGroups = groups.filter(g => g.category === catKey);
                                const catLabel = CATEGORY_META[catKey].label;
                                const total = catGroups.reduce((s, g) => s + g.members.length, 0);
                                const hidden = hiddenCategories.has(catKey);
                                return (
                                    <div key={catKey} className="mb-1">
                                        <div className="text-[10px] uppercase tracking-wider px-3 py-1 sticky top-0 bg-background font-medium flex items-center gap-2">
                                            <span>{catLabel}</span>
                                            <span className="font-mono text-[10px] opacity-70">{total}</span>
                                            <button
                                                onClick={() => toggleCategory(catKey)}
                                                className="ml-auto opacity-50 hover:opacity-100 transition-opacity"
                                                title={hidden ? "Show highlights" : "Hide highlights"}
                                            >
                                                {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                            </button>
                                        </div>
                                        {catGroups.map((group) => (
                                            <div key={group.id}>
                                                {group.members.map((member) => {
                                                    const it = member.item;
                                                    const m = markerByUuid.get(it.uuid);
                                                    if (!m) return null;
                                                    const isActive = activeMarker?.item.uuid === it.uuid;
                                                    return (
                                                        <button
                                                            key={it.uuid}
                                                            onClick={() => handleMarkerClick(m)}
                                                            className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 ${isActive ? "bg-muted" : ""}`}
                                                        >
                                                            <span
                                                                className="w-2 h-2 rounded-full shrink-0"
                                                                style={{ backgroundColor: KIND_COLOR[member.kind] }}
                                                            />
                                                            <span className="truncate font-medium">{itemLabel(it)}</span>
                                                            <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                );
                            });
                        })()}
                    </div>

                    {/* Active item detail — inline at bottom of sidebar */}
                    {activeMarker && (
                        <div className="border-t shrink-0 max-h-64 overflow-y-auto">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                                <span className="text-xs font-semibold" style={{ color: KIND_COLOR[activeMarker.kind] }}>
                                    {KIND_LABEL[activeMarker.kind]}
                                </span>
                                <button onClick={() => setActiveMarker(null)} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="px-3 py-2 space-y-2 text-xs">
                                <div>
                                    <p className="font-semibold">{itemLabel(activeMarker.item)}</p>
                                    <p className="text-muted-foreground">{activeMarker.item.type}</p>
                                </div>
                                {activeMarker.item.value && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Value</span>
                                        <span className="font-mono">{activeMarker.item.value}</span>
                                    </div>
                                )}
                                {activeMarker.item.footprint && (
                                    <div>
                                        <span className="text-muted-foreground">Footprint</span>
                                        <p className="font-mono truncate">{activeMarker.item.footprint}</p>
                                    </div>
                                )}
                                {activeMarker.item.text && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Text</span>
                                        <span className="font-mono">{activeMarker.item.text}</span>
                                    </div>
                                )}
                                {activeMarker.changes && Object.entries(activeMarker.changes).map(([field, { old: ov, new: nv }]) => (
                                    <div key={field} className="rounded border bg-muted/30 p-1.5 space-y-1">
                                        <p className="font-medium text-muted-foreground">{fieldLabel(field)}</p>
                                        <div className="flex items-center gap-1 font-mono text-[11px]">
                                            <span className="text-red-500 line-through truncate max-w-[80px]">{formatFieldValue(field, ov)}</span>
                                            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                            <span className="text-green-500 truncate max-w-[80px]">{formatFieldValue(field, nv)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Viewer area ── */}
                <div ref={viewerContainerRef} className="flex-1 relative overflow-hidden">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-40">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Parsing schematic diff…</p>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center z-40">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <AlertCircle className="h-8 w-8 text-destructive" />
                                <p className="text-sm text-destructive">{error}</p>
                                <p className="text-xs text-muted-foreground">No schematic file found for this project/commit pair.</p>
                            </div>
                        </div>
                    )}
                    {data && (
                        <>
                            <div
                                className="absolute inset-0"
                                style={{ opacity: showing === "new" ? 1 : 0, pointerEvents: showing === "new" ? "auto" : "none" }}
                            >
                                <EcadViewerHost
                                    viewerKey={`sch-diff-new-${data.commit1}-${data.commit2}`}
                                    files={data.sheets
                                        .filter(s => sheetContent[`new:${s.filename}`] !== undefined)
                                        .map(s => ({ filename: s.filename, content: sheetContent[`new:${s.filename}`] }))}
                                    viewerRef={newViewerRef}
                                    showLayersButton={false}
                                />
                            </div>
                            <div
                                className="absolute inset-0"
                                style={{ opacity: showing === "old" ? 1 : 0, pointerEvents: showing === "old" ? "auto" : "none" }}
                            >
                                <EcadViewerHost
                                    viewerKey={`sch-diff-old-${data.commit1}-${data.commit2}`}
                                    files={data.sheets
                                        .filter(s => sheetContent[`old:${s.filename}`] !== undefined)
                                        .map(s => ({ filename: s.filename, content: sheetContent[`old:${s.filename}`] }))}
                                    viewerRef={oldViewerRef}
                                    showLayersButton={false}
                                />
                            </div>
                            <DiffOverlay
                                markers={visibleMarkers}
                                viewerRef={viewerRef}
                                onMarkerClick={handleMarkerClick}
                                activeUuid={activeMarker?.item.uuid ?? null}
                                showing={showing}
                                kickRef={overlayKickRef}
                            />
                            {/* Sheet not present in the currently-showing version */}
                            {activeSheetData && (
                                (showing === "new" && !activeSheetData.has_new) ||
                                (showing === "old" && !activeSheetData.has_old)
                            ) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-30 pointer-events-none">
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        {showing === "new" ? (
                                            <>
                                                <span className="text-2xl font-bold" style={{ color: KIND_COLOR.removed }}>−</span>
                                                <p className="text-sm font-medium">Sheet removed</p>
                                                <p className="text-xs text-muted-foreground">This sheet does not exist in the new version</p>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-2xl font-bold" style={{ color: KIND_COLOR.added }}>+</span>
                                                <p className="text-sm font-medium">Sheet added</p>
                                                <p className="text-xs text-muted-foreground">This sheet does not exist in the old version</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {totalChanges === 0 && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/90 border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow z-30">
                                    No schematic changes detected between these commits
                                </div>
                            )}
                            <EcadInfoPanel detail={selectedDetail} onClose={clearSelectedDetail} />
                            <HotkeysLegend
                                entries={[
                                    ...COMMON_HOTKEYS,
                                    { keys: ["PgUp", "PgDn"], label: "Previous / next sheet" },
                                    { keys: ["Esc"],          label: "Close" },
                                ]}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
