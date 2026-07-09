import {
    useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
    X, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronDown,
    Plus, Minus, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ECadViewerElement } from "@/types/ecad-viewer";
import {
    COMMON_HOTKEYS,
    EcadInfoPanel,
    EcadViewerHost,
    HotkeysLegend,
    OVERLAY_FRAMES,
    useBoardClickFix,
    useEcadInfoPanel,
    useViewerHotkeys,
    useViewerReadiness,
} from "@/components/ecad-viewer-shared";
import { CATEGORY_META, type Category } from "@/lib/diff-grouping";
import { useCrossProbeRunner } from "@/lib/cross-probe-retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PcbItem {
    type: string;
    uuid: string;
    x: number;
    y: number;
    reference?: string;
    value?: string;
    lib_id?: string;
    layer?: string;
    net_name?: string;
    name?: string;
    net?: string;
    text?: string;
    start_x?: number;
    start_y?: number;
    mid_x?: number;
    mid_y?: number;
    end_x?: number;
    end_y?: number;
    width?: number;
    size?: number;
    drill?: number;
    rotation?: number;
    pad_sig?: string;
    geo_sig?: string;
    polygon_points?: [number, number][];
    // via extras
    start_layer?: string;
    end_layer?: string;
    via_type?: string;
    // zone extras
    priority?: number;
    fill_mode?: string;
    min_thickness?: number;
    connect_pads_mode?: string;
    connect_pads_clearance?: number;
    keepout_sig?: string;
    // footprint-graphics extra: reference of the parent footprint
    parent_ref?: string;
}

interface FieldChange {
    old: string | number | null;
    new: string | number | null;
}

interface ChangedItem {
    item: PcbItem;      // new version
    old_item: PcbItem; // old version
    changes: Record<string, FieldChange>;
}

interface PcbDiff {
    added: PcbItem[];
    removed: PcbItem[];
    changed: ChangedItem[];
}

interface BoardData {
    filename: string;
    rel_path: string;
    has_old: boolean;
    has_new: boolean;
    // Content is lazy-fetched from the cacheable per-commit file endpoint
    // (diff requested with include_content=false), so these stay null.
    old_content: string | null;
    new_content: string | null;
    diff: PcbDiff;
}

interface PcbDiffData {
    commit1: string;
    commit2: string;
    boards: BoardData[];
}

interface DiffMarker {
    kind: "added" | "removed" | "changed";
    item: PcbItem;      // new version (or only version for added/removed)
    old_item?: PcbItem; // old version (only for changed)
    changes?: Record<string, FieldChange>;
}

// Use the shared Category union — PCB only ever produces these four.
type GroupCategory = Extract<Category, "components" | "nets" | "zones" | "graphics">;

/** A sub-item collapsed into a component group (courtyard, fab, ref text, etc.) */
interface ChildGroup {
    label: string;
    kind: "added" | "removed" | "changed";
    members: DiffMarker[];
}

interface GroupedMarker {
    id: string;
    category: GroupCategory;
    kind: "added" | "removed" | "changed";
    label: string;
    members: DiffMarker[];
    // merged world-space bbox for the new (or only) version
    bboxMinX: number;
    bboxMinY: number;
    bboxMaxX: number;
    bboxMaxY: number;
    // bbox for the old version of changed items (undefined for added/removed)
    oldBboxMinX?: number;
    oldBboxMinY?: number;
    oldBboxMaxX?: number;
    oldBboxMaxY?: number;
    // zone polygon in world coords (only set for zone groups)
    polygonPoints?: [number, number][];
    oldPolygonPoints?: [number, number][];
    // fp_* items on structural layers (courtyard/fab/cmts) absorbed into this component
    childGroups?: ChildGroup[];
    // Per-member overlay groups (nets only): one tight bbox per segment/via instead
    // of one big merged bbox. Used for rendering only — sidebar still shows the parent.
    overlayGroups?: GroupedMarker[];
}

interface PcbDiffViewerProps {
    projectId: string;
    commit1: string;
    commit2: string;
    onClose: () => void;
    embedded?: boolean;
    onCrossProbe?: (reference: string) => void;
    crossProbeTarget?: { ref: string; seq: number }; // reference to navigate to when switching from schematic
    /** Item id (uuid or geometric key) to focus on when the diff loads. */
    focusItemId?: string;
    /** When true, hide the OLD/NEW toggle and always show the new board.
     *  Used when opening a single commit's changes (vs. a manual two-commit compare). */
    singleCommit?: boolean;
    /** True when this viewer's tab is the currently visible one. Used to gate
     *  cross-probe firing on visibility — probes that fire while display:none
     *  zoom against a 0×0 canvas. Defaults to true for standalone usage. */
    active?: boolean;
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

const KIND_PREFIX: Record<DiffMarker["kind"], string> = {
    added: "+",
    removed: "−",
    changed: "~",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function itemLabel(item: PcbItem): string {
    if (item.reference) return `${item.reference}${item.value ? ` (${item.value})` : ""}`;
    if (item.text) return item.text.slice(0, 24) + (item.text.length > 24 ? "…" : "");
    if (item.net_name) return item.net_name;
    if (item.name) return item.name;
    if (item.type === "segment") return `Wire${item.layer ? ` ${item.layer}` : ""}`;
    if (item.type === "arc")     return `Arc${item.layer ? ` ${item.layer}` : ""}`;
    if (item.type === "via")     return `Via${item.net_name ? ` ${item.net_name}` : item.net ? ` Net ${item.net}` : ""}`;
    if (item.type === "gr_line")   return `Line${item.layer ? ` (${item.layer})` : ""}`;
    if (item.type === "gr_circle") return `Circle${item.layer ? ` (${item.layer})` : ""}`;
    if (item.type === "gr_rect")   return `Rect${item.layer ? ` (${item.layer})` : ""}`;
    if (item.type === "gr_arc")    return `Arc${item.layer ? ` (${item.layer})` : ""}`;
    if (item.type === "gr_poly")   return `Polygon${item.layer ? ` (${item.layer})` : ""}`;
    return item.type;
}

function fieldLabel(key: string): string {
    const LABELS: Record<string, string> = {
        outline_sig: "Outline",
        net_name: "Net",
        pad_sig: "Pads",
        geo_sig: "Geometry",
        keepout_sig: "Keepout",
        start_layer: "From Layer",
        end_layer: "To Layer",
        via_type: "Via Type",
        fill_mode: "Fill Mode",
        fill_thermal_gap: "Thermal Gap",
        fill_thermal_bridge: "Thermal Bridge",
        min_thickness: "Min Thickness",
        connect_pads_mode: "Connect Pads",
        connect_pads_clearance: "Pad Clearance",
        in_bom: "In BOM",
        on_board: "On Board",
        dnp: "DNP",
    };
    return LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(field: string, value: unknown): string {
    if (value == null || value === "") return "–";
    if (field === "outline_sig") {
        const pts = String(value).split(";").filter(Boolean).length;
        return `${pts} point${pts === 1 ? "" : "s"}`;
    }
    if (field === "pad_sig") {
        const pads = String(value).split(";").filter(Boolean).length;
        return `${pads} pad${pads === 1 ? "" : "s"}`;
    }
    if (field === "keepout_sig") {
        return String(value).split(";").filter(Boolean).join(", ") || "–";
    }
    if (field === "geo_sig") return "changed";
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value);
}

// ---------------------------------------------------------------------------
// Marker grouping
// ---------------------------------------------------------------------------

function _mergedKind(members: DiffMarker[]): "added" | "removed" | "changed" {
    const kinds = new Set(members.map(m => m.kind));
    if (kinds.size > 1) return "changed"; // mixed → rerouted/modified
    return members[0].kind;
}

function _bboxFromMembers(members: DiffMarker[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of members) {
        const item = m.item as any;

        // If the item explicitly carries polygon points, include them.
        if (Array.isArray(item.polygon_points) && item.polygon_points.length > 0) {
            for (const [px, py] of item.polygon_points) {
                if (Number.isFinite(px) && Number.isFinite(py)) {
                    minX = Math.min(minX, px);
                    minY = Math.min(minY, py);
                    maxX = Math.max(maxX, px);
                    maxY = Math.max(maxY, py);
                }
            }
            continue;
        }

        // Treat any item with start/end coordinates as a segment/line
        const hasStartEnd = Number.isFinite(item.start_x) && Number.isFinite(item.start_y) && Number.isFinite(item.end_x) && Number.isFinite(item.end_y);
        if (hasStartEnd) {
            const pad = Number(item.width ?? 0.2) / 2;
            minX = Math.min(minX, item.start_x - pad, item.end_x - pad);
            minY = Math.min(minY, item.start_y - pad, item.end_y - pad);
            maxX = Math.max(maxX, item.start_x + pad, item.end_x + pad);
            maxY = Math.max(maxY, item.start_y + pad, item.end_y + pad);
            continue;
        }

        // Fallback to point-like items using x/y
        const x = Number(item.x);
        const y = Number(item.y);
        const hw = item.type === "footprint" ? 3 : item.type === "zone" ? 5 : item.type === "via" ? 0.5 : 2;
        const hh = hw;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            minX = Math.min(minX, x - hw);
            minY = Math.min(minY, y - hh);
            maxX = Math.max(maxX, x + hw);
            maxY = Math.max(maxY, y + hh);
            continue;
        }

        // As a last resort, ignore this member (prevents NaN/Infinity from leaking).
    }

    // Ensure we return finite numbers so downstream layout doesn't produce NaN.
    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(minY)) minY = 0;
    if (!Number.isFinite(maxX)) maxX = minX + 1;
    if (!Number.isFinite(maxY)) maxY = minY + 1;
    return { minX, minY, maxX, maxY };
}

const GRAPHIC_TYPES = new Set([
    "gr_text", "gr_line", "gr_circle", "gr_rect", "gr_arc", "gr_poly",
    // Footprint graphics (silkscreen / fab / courtyard) — itemised per element.
    "fp_text", "fp_line", "fp_circle", "fp_rect", "fp_arc", "fp_poly",
]);
const TRACK_TYPES   = new Set(["segment", "arc"]);

function groupMarkers(raw: DiffMarker[]): GroupedMarker[] {
    const result: GroupedMarker[] = [];
    let gid = 0;
    const nextId = () => `g${gid++}`;

    // Helper: wrap old_item as a fake marker for bbox computation
    const oldMarker = (m: DiffMarker): DiffMarker => ({ ...m, item: m.old_item! });

    // ── Components (footprints) — one group per UUID, keep kind as-is ──
    for (const m of raw) {
        if (m.item.type !== "footprint") continue;
        const { minX, minY, maxX, maxY } = _bboxFromMembers([m]);
        const ref = m.item.reference || m.item.lib_id || "?";
        const val = m.item.value ? ` (${m.item.value})` : "";
        const oldBbox = m.kind === "changed" && m.old_item ? _bboxFromMembers([oldMarker(m)]) : null;
        result.push({
            id: nextId(), category: "components", kind: m.kind,
            label: `${ref}${val}`,
            members: [m], bboxMinX: minX, bboxMinY: minY, bboxMaxX: maxX, bboxMaxY: maxY,
            ...(oldBbox && { oldBboxMinX: oldBbox.minX, oldBboxMinY: oldBbox.minY, oldBboxMaxX: oldBbox.maxX, oldBboxMaxY: oldBbox.maxY }),
        });
    }

    // ── Nets (segments + arcs + vias) — group by net name ──
    const netMap = new Map<string, DiffMarker[]>();
    for (const m of raw) {
        if (!TRACK_TYPES.has(m.item.type) && m.item.type !== "via") continue;
        // Prefer net_name (human-readable) as the group key; fall back to net number string
        const key = m.item.net_name || (m.item.net != null && m.item.net !== "" ? `Net ${m.item.net}` : "(no net)");
        const arr = netMap.get(key) ?? [];
        arr.push(m);
        netMap.set(key, arr);
    }
    for (const [netLabel, members] of netMap) {
        const { minX, minY, maxX, maxY } = _bboxFromMembers(members);
        const kind = _mergedKind(members);
        const trackCount = members.filter(m => TRACK_TYPES.has(m.item.type)).length;
        const viaCount   = members.filter(m => m.item.type === "via").length;
        const parts: string[] = [];
        if (trackCount) parts.push(`${trackCount} wire${trackCount > 1 ? "s" : ""}`);
        if (viaCount)   parts.push(`${viaCount} via${viaCount > 1 ? "s" : ""}`);
        const label = parts.length > 0 ? `${netLabel} — ${parts.join(", ")}` : netLabel;
        const oldMembers = members.filter(m => m.kind === "changed" && m.old_item).map(oldMarker);
        const oldBbox = oldMembers.length > 0 ? _bboxFromMembers(oldMembers) : null;
        // Build one tight overlay box per segment/via so only the actually-changed
        // traces are highlighted, not a merged rect spanning the whole net.
        const overlayGroups: GroupedMarker[] = members.map(m => {
            const b = _bboxFromMembers([m]);
            const ob = m.kind === "changed" && m.old_item ? _bboxFromMembers([oldMarker(m)]) : null;
            return {
                id: nextId(), category: "nets", kind: m.kind,
                label, members: [m],
                bboxMinX: b.minX, bboxMinY: b.minY, bboxMaxX: b.maxX, bboxMaxY: b.maxY,
                ...(ob && { oldBboxMinX: ob.minX, oldBboxMinY: ob.minY, oldBboxMaxX: ob.maxX, oldBboxMaxY: ob.maxY }),
            };
        });
        result.push({
            id: nextId(), category: "nets", kind,
            label,
            members, bboxMinX: minX, bboxMinY: minY, bboxMaxX: maxX, bboxMaxY: maxY,
            ...(oldBbox && { oldBboxMinX: oldBbox.minX, oldBboxMinY: oldBbox.minY, oldBboxMaxX: oldBbox.maxX, oldBboxMaxY: oldBbox.maxY }),
            overlayGroups,
        });
    }

    // ── Zones — one group per UUID ──
    for (const m of raw) {
        if (m.item.type !== "zone") continue;
        const pts = m.item.polygon_points;
        const oldPts = m.kind === "changed" && m.old_item ? (m.old_item.polygon_points ?? undefined) : undefined;
        let minX: number, minY: number, maxX: number, maxY: number;
        if (pts && pts.length > 0) {
            minX = Math.min(...pts.map(p => p[0]));
            minY = Math.min(...pts.map(p => p[1]));
            maxX = Math.max(...pts.map(p => p[0]));
            maxY = Math.max(...pts.map(p => p[1]));
        } else {
            ({ minX, minY, maxX, maxY } = _bboxFromMembers([m]));
        }
        let oldMinX: number | undefined, oldMinY: number | undefined, oldMaxX: number | undefined, oldMaxY: number | undefined;
        if (oldPts && oldPts.length > 0) {
            oldMinX = Math.min(...oldPts.map(p => p[0]));
            oldMinY = Math.min(...oldPts.map(p => p[1]));
            oldMaxX = Math.max(...oldPts.map(p => p[0]));
            oldMaxY = Math.max(...oldPts.map(p => p[1]));
        } else if (m.kind === "changed" && m.old_item) {
            const ob = _bboxFromMembers([oldMarker(m)]);
            oldMinX = ob.minX; oldMinY = ob.minY; oldMaxX = ob.maxX; oldMaxY = ob.maxY;
        }
        const label = m.item.net_name && m.item.layer
            ? `${m.item.net_name} (${m.item.layer})`
            : m.item.net_name || m.item.name || "Zone";
        result.push({
            id: nextId(), category: "zones", kind: m.kind,
            label, members: [m],
            bboxMinX: minX, bboxMinY: minY, bboxMaxX: maxX, bboxMaxY: maxY,
            polygonPoints: pts && pts.length > 0 ? pts : undefined,
            ...(oldMinX !== undefined && { oldBboxMinX: oldMinX, oldBboxMinY: oldMinY, oldBboxMaxX: oldMaxX, oldBboxMaxY: oldMaxY }),
            ...(oldPts && oldPts.length > 0 && { oldPolygonPoints: oldPts }),
        });
    }

    // ── Graphics ──
    // fp_* items on structural layers (courtyard, fab, Cmts.User) are absorbed
    // into their parent footprint's component group — they clutter the view and
    // almost always change in lockstep with the footprint.
    // Reference/value fp_text (${REFERENCE} / ${VALUE}) are also absorbed.
    // Everything else (SilkS strokes, gr_* board graphics) stays in graphics.
    const COMPONENT_LAYERS = new Set([
        "F.CrtYd", "B.CrtYd",
        "F.Fab", "B.Fab",
        "F.Adhes", "B.Adhes",
        "Cmts.User",
    ]);
    const FP_TEXT_TYPES = new Set(["fp_text"]);
    const isAbsorbedIntoComponent = (m: DiffMarker): boolean => {
        if (!m.item.parent_ref) return false;
        if (COMPONENT_LAYERS.has(m.item.layer ?? "")) return true;
        if (FP_TEXT_TYPES.has(m.item.type)) {
            const t = (m.item.text ?? "").trim();
            if (t === "${REFERENCE}" || t === "${VALUE}") return true;
        }
        return false;
    };

    // Build a map from reference → component GroupedMarker so absorbed items
    // can expand the component's bbox and attach as child groups.
    const compGroupByRef = new Map<string, GroupedMarker>();
    for (const g of result) {
        if (g.category !== "components") continue;
        const ref = g.members[0]?.item.reference;
        if (ref) compGroupByRef.set(ref, g);
    }

    // Collect absorbed items per (ref, layer/role) key so we can label them.
    const absorbedMap = new Map<string, DiffMarker[]>();
    for (const m of raw) {
        if (!GRAPHIC_TYPES.has(m.item.type)) continue;
        if (!isAbsorbedIntoComponent(m)) continue;
        const ref = m.item.parent_ref!;
        const role = FP_TEXT_TYPES.has(m.item.type)
            ? (m.item.text ?? "text").replace(/\$\{([^}]+)\}/, "$1").toLowerCase()
            : (m.item.layer ?? "unknown");
        const key = `${ref}::${role}`;
        const arr = absorbedMap.get(key) ?? [];
        arr.push(m);
        absorbedMap.set(key, arr);
    }

    // Attach absorbed child groups to their parent component group.
    // If the footprint itself isn't in the diff, create a synthetic component
    // group so these items still appear under Components, not Graphics.
    for (const [key, members] of absorbedMap) {
        const ref = key.split("::")[0];
        const role = key.split("::").slice(1).join("::");
        let compGroup = compGroupByRef.get(ref);
        if (!compGroup) {
            // Footprint not in diff — synthesise a group for it.
            const extra = _bboxFromMembers(members);
            compGroup = {
                id: nextId(), category: "components", kind: _mergedKind(members),
                label: ref,
                members: [],
                bboxMinX: extra.minX, bboxMinY: extra.minY,
                bboxMaxX: extra.maxX, bboxMaxY: extra.maxY,
                childGroups: [],
            };
            compGroupByRef.set(ref, compGroup);
            result.push(compGroup);
        }

        // Expand the component's bbox to include these items.
        const extra = _bboxFromMembers(members);
        compGroup.bboxMinX = Math.min(compGroup.bboxMinX, extra.minX);
        compGroup.bboxMinY = Math.min(compGroup.bboxMinY, extra.minY);
        compGroup.bboxMaxX = Math.max(compGroup.bboxMaxX, extra.maxX);
        compGroup.bboxMaxY = Math.max(compGroup.bboxMaxY, extra.maxY);

        const childKind = _mergedKind(members);
        const kinds = new Set([compGroup.kind, childKind]);
        compGroup.kind = kinds.size > 1 ? "changed" : compGroup.kind;

        compGroup.childGroups ??= [];
        compGroup.childGroups.push({ label: role, kind: childKind, members });
    }

    // Remaining gr_* and non-absorbed fp_* items go to graphics.
    const TEXT_GFX = new Set(["gr_text", "fp_text"]);
    const gfxMap = new Map<string, DiffMarker[]>();
    for (const m of raw) {
        if (!GRAPHIC_TYPES.has(m.item.type)) continue;
        if (isAbsorbedIntoComponent(m)) continue; // all absorbed items handled above
        const layer = m.item.layer ?? "(no layer)";
        const ref = m.item.parent_ref;
        let key: string;
        if (TEXT_GFX.has(m.item.type)) {
            key = `text:${m.item.uuid}`;
        } else if (ref) {
            // Stroke graphics of a footprint not yet handled (e.g. SilkS): one box per (fp, layer).
            key = `fp:${ref}:${layer}`;
        } else {
            key = `board:${m.item.uuid}`;
        }
        const arr = gfxMap.get(key) ?? [];
        arr.push(m);
        gfxMap.set(key, arr);
    }
    for (const [key, members] of gfxMap) {
        const { minX, minY, maxX, maxY } = _bboxFromMembers(members);
        const kind = _mergedKind(members);
        const first = members[0].item;
        const layer = first.layer ?? "(no layer)";
        let label: string;
        if (key.startsWith("text:")) {
            const t = (first.text ?? "").trim();
            const shown = t.length > 24 ? `${t.slice(0, 23)}…` : t || "Text";
            label = first.parent_ref ? `${first.parent_ref} — ${shown}` : shown;
        } else if (key.startsWith("fp:")) {
            label = `${first.parent_ref} — ${layer}`;
        } else {
            label = `${itemLabel(first)}`;
        }
        const textPoly = key.startsWith("text:") && members.length === 1
            ? (members[0].item.polygon_points ?? undefined)
            : undefined;
        const oldTextPoly = key.startsWith("text:") && members.length === 1 && members[0].old_item
            ? (members[0].old_item.polygon_points ?? undefined)
            : undefined;
        result.push({
            id: nextId(), category: "graphics", kind,
            label,
            members, bboxMinX: minX, bboxMinY: minY, bboxMaxX: maxX, bboxMaxY: maxY,
            ...(textPoly && textPoly.length > 0 && { polygonPoints: textPoly }),
            ...(oldTextPoly && oldTextPoly.length > 0 && { oldPolygonPoints: oldTextPoly }),
        });
    }

    return result;
}

// ---------------------------------------------------------------------------

interface OverlayProps {
    groups: GroupedMarker[];
    viewerRef: React.RefObject<ECadViewerElement | null>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    getBoardEl: (host: ECadViewerElement) => BoardEl | null;
    onGroupClick: (group: GroupedMarker) => void;
    activeIds: Set<string>;
    showing: "new" | "old";
    kickRef?: React.MutableRefObject<((frames?: number) => void) | null>;
}

// Per-kind stripe rotation so stacked changes remain distinguishable.
const stripeRotation = { added: 45, removed: -45, changed: 45 } as const;

function DiffOverlay({ groups, viewerRef, containerRef, getBoardEl, onGroupClick, activeIds, showing, kickRef }: OverlayProps) {
    const boxRefs  = useRef<Map<string, HTMLDivElement>>(new Map());
    const polyRefs = useRef<Map<string, SVGPolygonElement>>(new Map());
    const patternRefs = useRef<Map<string, SVGPatternElement>>(new Map());
    const rafRef   = useRef<number | null>(null);
    const framesLeftRef = useRef(0);

    // kicanvas attaches its wheel listener to the inner <canvas>, not the host
    // element — so dispatching wheel events on the host has no effect. We have
    // to find the canvas (behind nested shadow roots) and dispatch there.
    const findCanvas = useCallback((root: Element | ShadowRoot | null): HTMLCanvasElement | null => {
        if (!root) return null;
        const c = (root as ShadowRoot).querySelector?.("canvas") as HTMLCanvasElement | null;
        if (c) return c;
        const all = (root as ShadowRoot).querySelectorAll?.("*") ?? [];
        for (const el of all) {
            const sr = (el as HTMLElement).shadowRoot;
            if (sr) {
                const found = findCanvas(sr);
                if (found) return found;
            }
        }
        return null;
    }, []);

    const dispatchWheel = useCallback((source: { deltaX: number; deltaY: number; deltaZ: number; deltaMode: number; clientX: number; clientY: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; }) => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const canvas =
            (getBoardEl(viewer) as ({ viewer?: { renderer?: { canvas?: HTMLCanvasElement } } } | null))?.viewer?.renderer?.canvas
            ?? findCanvas(viewer as unknown as Element)
            ?? findCanvas((viewer as unknown as HTMLElement).shadowRoot);
        const target = canvas ?? (viewer as unknown as EventTarget);
        target.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true, cancelable: true,
            deltaX: source.deltaX, deltaY: source.deltaY, deltaZ: source.deltaZ,
            deltaMode: source.deltaMode,
            clientX: source.clientX, clientY: source.clientY,
            ctrlKey: source.ctrlKey, shiftKey: source.shiftKey, altKey: source.altKey,
        }));
    }, [viewerRef, getBoardEl, findCanvas]);

    const forwardWheel = useCallback((e: React.WheelEvent) => { dispatchWheel(e); }, [dispatchWheel]);

    const svgRef = useRef<SVGSVGElement | null>(null);
    // The SVG has pointer-events:none so React onWheel never fires on children.
    // Attach a native wheel listener directly — it fires regardless of CSS.
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const handler = (e: WheelEvent) => { dispatchWheel(e); };
        svg.addEventListener("wheel", handler, { passive: true });
        return () => svg.removeEventListener("wheel", handler);
    }, [dispatchWheel]);

    const updatePositions = useCallback((): boolean => {
        const viewer = viewerRef.current;
        const container = containerRef.current;
        if (!viewer || !container) return false;
        try {
            const containerRect = container.getBoundingClientRect();
            if (!containerRect.width) return false;

            // getScreenLocation returns canvas-relative coords (world_to_screen without adding
            // the canvas bounding rect offset). To convert to container-relative coords we need
            // to add the canvas offset relative to our container.
            // We derive that offset by calling getScreenLocation for a known world point and
            // comparing to worldToScreen on the internal viewer.
            type FootprintBBox = { x: number; y: number; w: number; h: number };
            type BoardDoc = { find_footprint?: (ref: string) => { bbox?: FootprintBBox } | null };
            type InternalViewer = {
                worldToScreen?: (x: number, y: number) => { x: number; y: number };
                board?: BoardDoc;
            };
            const boardEl = getBoardEl(viewer) as (HTMLElement & { viewer?: InternalViewer }) | null;
            const worldToScreen = boardEl?.viewer?.worldToScreen?.bind(boardEl.viewer);
            const findFootprint = boardEl?.viewer?.board?.find_footprint?.bind(boardEl.viewer.board);

            // Prefer the host element's `getScreenLocation` (canvas-relative) which is
            // the same approach used by the schematic overlay. If unavailable, fall
            // back to the inner viewer's `worldToScreen` method.
            let toContainerPt: (wx: number, wy: number) => { x: number; y: number };
            if (viewer.getScreenLocation) {
                // getScreenLocation is canvas-relative. Find canvas offset by checking the
                // ecad-viewer element's own bounding rect vs the container rect.
                const viewerRect = viewer.getBoundingClientRect();
                const dx = viewerRect.left - containerRect.left;
                const dy = viewerRect.top  - containerRect.top;
                toContainerPt = (wx, wy) => {
                    const s = viewer.getScreenLocation(wx, wy);
                    if (!s) return { x: -9999, y: -9999 };
                    return { x: s.x + dx, y: s.y + dy };
                };
            } else if (worldToScreen) {
                toContainerPt = (wx, wy) => {
                    const s = worldToScreen(wx, wy);
                    return { x: s.x - containerRect.left, y: s.y - containerRect.top };
                };
            } else {
                return false;
            }

            let anyVisible = false;
            const SCREEN_PAD = 4;
            for (const g of groups) {
                // For changed groups, pick geometry for the currently-shown version.
                const useOld = showing === "old" && g.kind === "changed";
                const activePoly = useOld ? (g.oldPolygonPoints ?? g.polygonPoints) : g.polygonPoints;
                const activeBbox = useOld
                    ? { minX: g.oldBboxMinX ?? g.bboxMinX, minY: g.oldBboxMinY ?? g.bboxMinY, maxX: g.oldBboxMaxX ?? g.bboxMaxX, maxY: g.oldBboxMaxY ?? g.bboxMaxY }
                    : { minX: g.bboxMinX, minY: g.bboxMinY, maxX: g.bboxMaxX, maxY: g.bboxMaxY };
                if (activePoly) {
                    const poly = polyRefs.current.get(g.id);
                    if (!poly) continue;
                    const pts = activePoly.map(([wx, wy]) => {
                        const s = toContainerPt(wx, wy);
                        return `${s.x},${s.y}`;
                    });
                    poly.setAttribute("points", pts.join(" "));
                    poly.style.display = "";
                    // Translate the per-polygon pattern by the first vertex so the
                    // stripes pan with the polygon when the canvas moves. Rotation
                    // is set declaratively on the JSX; we rebuild the full transform
                    // here to combine translate + rotate.
                    const pat = patternRefs.current.get(g.id);
                    if (pat && activePoly && activePoly.length > 0) {
                        const p0 = toContainerPt(activePoly[0][0], activePoly[0][1]);
                        const rot = stripeRotation[g.kind];
                        pat.setAttribute("patternTransform", `translate(${p0.x} ${p0.y}) rotate(${rot})`);
                    }
                    anyVisible = true;
                } else {
                    const el = boxRefs.current.get(g.id);
                    if (!el) continue;
                    // For footprint groups, use kicanvas's real footprint bbox
                    // (same one used for the hover outline) + a pixel offset.
                    const PAD = 6;
                    let left: number, top: number, w: number, h: number;
                    // For changed footprints in old view, look up by old reference
                    const fpMember = g.members[0];
                    const fpRef = useOld
                        ? (fpMember?.old_item?.reference ?? fpMember?.old_item?.uuid ?? fpMember?.item.reference ?? "")
                        : (fpMember?.item.reference ?? fpMember?.item.uuid ?? "");
                    const fpBBox = g.category === "components"
                        ? findFootprint?.(fpRef)?.bbox ?? null
                        : null;
                    if (fpBBox) {
                        const tl = toContainerPt(fpBBox.x, fpBBox.y);
                        const br = toContainerPt(fpBBox.x + fpBBox.w, fpBBox.y + fpBBox.h);
                        left = Math.min(tl.x, br.x) - PAD;
                        top  = Math.min(tl.y, br.y) - PAD;
                        w    = Math.abs(br.x - tl.x) + PAD * 2;
                        h    = Math.abs(br.y - tl.y) + PAD * 2;
                    } else {
                        const tl = toContainerPt(activeBbox.minX, activeBbox.minY);
                        const br = toContainerPt(activeBbox.maxX, activeBbox.maxY);
                        left = Math.min(tl.x, br.x) - SCREEN_PAD;
                        top  = Math.min(tl.y, br.y) - SCREEN_PAD;
                        w    = Math.abs(br.x - tl.x) + SCREEN_PAD * 2;
                        h    = Math.abs(br.y - tl.y) + SCREEN_PAD * 2;
                    }
                    const vis  = left + w > 0 && left < containerRect.width && top + h > 0 && top < containerRect.height;
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
            return anyVisible || groups.length === 0;
        } catch { return false; }
    }, [viewerRef, containerRef, getBoardEl, groups, showing]);

    // Stub ref — filled in after updateSvgMembers is defined below. tick calls
    // through this ref so the RAF loop stays stable when svgGroups changes.

    const updateSvgMembersRef = useRef<() => void>(() => {});

    const tick = useCallback(() => {
        const done = updatePositions();
        updateSvgMembersRef.current();
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

    useEffect(() => {
        if (kickRef) kickRef.current = kick;
        return () => { if (kickRef) kickRef.current = null; };
    }, [kick, kickRef]);

    useEffect(() => {
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

    useEffect(() => { kick(OVERLAY_FRAMES.LOAD); }, [groups, kick]);

    // Hook into kicanvas's on_viewport_change so the overlay refreshes whenever
    // the camera moves — including the post-load auto-fit, which doesn't emit
    // a DOM panzoom event and would otherwise leave boxes stranded at stale
    // coordinates until the user interacts.
    useEffect(() => {
        let stopped = false;
        const tryHook = () => {
            if (stopped) return;
            const host = viewerRef.current;
            const inner = host ? (getBoardEl(host) as (BoardEl & { viewer?: { on_viewport_change?: () => void; __overlayKickHooked?: boolean } }) | null)?.viewer : null;
            if (!inner || typeof inner.on_viewport_change !== "function") {
                window.setTimeout(tryHook, 200);
                return;
            }
            if (inner.__overlayKickHooked) return;
            const orig = inner.on_viewport_change.bind(inner);
            inner.on_viewport_change = function () {
                orig();
                kick(OVERLAY_FRAMES.VIEWPORT);
            };
            inner.__overlayKickHooked = true;
        };
        tryHook();
        return () => { stopped = true; };
    }, [viewerRef, getBoardEl, kick]);

    // Groups rendered as individual SVG geometries (net tracks + vias)
    // vs. groups still using a bbox div (footprints, gr_* graphics)
    const svgGroups     = groups.filter(g => !g.polygonPoints && g.category === "nets");
    const boxGroups     = groups.filter(g => !g.polygonPoints && g.category !== "nets");
    // Zones use a striped fill polygon. Text items use a plain border polygon
    // (no fill pattern — the text is readable through it).
    const polygonGroups = groups.filter(g => g.polygonPoints && g.category === "zones");
    const textPolyGroups = groups.filter(g => g.polygonPoints && g.category !== "zones");

    const memberSvgRefs = useRef<Map<string, SVGElement>>(new Map());

    const updateSvgMembers = useCallback((): void => {
        const viewer = viewerRef.current;
        const container = containerRef.current;
        if (!viewer || !container) return;
        try {
            const containerRect = container.getBoundingClientRect();
            if (!containerRect.width) return;
            const viewerRect = viewer.getBoundingClientRect();
            const dx = viewerRect.left - containerRect.left;
            const dy = viewerRect.top  - containerRect.top;
            const toScreen = viewer.getScreenLocation
                ? (wx: number, wy: number) => {
                    const s = viewer.getScreenLocation(wx, wy);
                    return s ? { x: s.x + dx, y: s.y + dy } : null;
                  }
                : null;
            if (!toScreen) return;

            for (const g of svgGroups) {
                for (let mi = 0; mi < g.members.length; mi++) {
                    const key     = `${g.id}:${mi}`;
                    const keyBase = `${key}:base`;
                    const el      = memberSvgRefs.current.get(key);
                    const baseEl  = memberSvgRefs.current.get(keyBase);
                    if (!el) continue;
                    const m = g.members[mi];
                    // Per-member visibility: a net group can mix `added` + `removed`
                    // segments (a rerouted trace). Hide members that don't belong to
                    // the version currently shown so the overlay doesn't render both
                    // the old and new traces in the same view.
                    if (m.kind === "added"   && showing === "old") {
                        el.setAttribute("display", "none");
                        baseEl?.setAttribute("display", "none");
                        continue;
                    }
                    if (m.kind === "removed" && showing === "new") {
                        el.setAttribute("display", "none");
                        baseEl?.setAttribute("display", "none");
                        continue;
                    }
                    // For changed members, show geometry of the currently-shown version.
                    const item = (m.kind === "changed" && showing === "old" && m.old_item) ? m.old_item : m.item;

                    if (item.type === "via") {
                        // Render via as a small rect (bounding box) — circles read poorly.
                        const c = toScreen(item.x, item.y);
                        if (!c) {
                            el.setAttribute("display", "none");
                            baseEl?.setAttribute("display", "none");
                            continue;
                        }
                        const r_mm = (item.size ?? 0.8) / 2;
                        const edge = toScreen(item.x + r_mm, item.y);
                        const r_px = edge ? Math.max(5, Math.abs(edge.x - c.x)) : 6;
                        // Bbox padding so the outline sits outside the via copper
                        const pad = 2;
                        const side = (r_px + pad) * 2;
                        el.setAttribute("x", String(c.x - r_px - pad));
                        el.setAttribute("y", String(c.y - r_px - pad));
                        el.setAttribute("width",  String(side));
                        el.setAttribute("height", String(side));
                        el.removeAttribute("display");
                    } else {
                        const hasStartEnd =
                            item.start_x != null && item.start_y != null &&
                            item.end_x   != null && item.end_y   != null;
                        if (!hasStartEnd) {
                            el.setAttribute("display", "none");
                            baseEl?.setAttribute("display", "none");
                            continue;
                        }
                        const p1 = toScreen(item.start_x!, item.start_y!);
                        const p2 = toScreen(item.end_x!,   item.end_y!);
                        if (!p1 || !p2) {
                            el.setAttribute("display", "none");
                            baseEl?.setAttribute("display", "none");
                            continue;
                        }
                        const w_mm  = (item.width ?? 0.2) / 2;
                        const edgePt = toScreen(item.start_x! + w_mm, item.start_y!);
                        const sw    = edgePt ? Math.max(2, Math.abs(edgePt.x - p1.x) * 2) : 3;
                        // Solid black outline (continuous, rounded) + dashed translucent
                        // colored top. Dash size scales with on-screen track width.
                        const swTop  = sw + 3;
                        const swBase = sw + 6;
                        // Fit a whole number of dashes so one lands exactly on each
                        // end of the line. With dasharray [dashLen, dashGap] the
                        // pattern is dash,gap,dash,…; to end on a dash the line must
                        // hold n dashes and (n-1) gaps:
                        //   lineLen = n*dashLen + (n-1)*dashGap
                        // We keep the desired dash:gap ratio and solve for the
                        // scale that makes this exact.
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const lineLen = Math.hypot(dx, dy) || 1;
                        const wantLen = Math.max(10, sw * 3.5);
                        const wantGap = Math.max(8,  sw * 2.5);
                        // n = number of dashes; pick the count closest to the
                        // desired density, at least 1.
                        const n = Math.max(1, Math.round((lineLen + wantGap) / (wantLen + wantGap)));
                        // lineLen = n*dashLen + (n-1)*dashGap, holding dashGap/dashLen = wantGap/wantLen.
                        const gapRatio = wantGap / wantLen;
                        const dashLen = lineLen / (n + (n - 1) * gapRatio);
                        const dashGap = dashLen * gapRatio;
                        if (baseEl) {
                            baseEl.setAttribute("x1", String(p1.x));
                            baseEl.setAttribute("y1", String(p1.y));
                            baseEl.setAttribute("x2", String(p2.x));
                            baseEl.setAttribute("y2", String(p2.y));
                            baseEl.setAttribute("stroke-width", String(swBase));
                            baseEl.removeAttribute("stroke-dasharray");
                            baseEl.removeAttribute("display");
                        }
                        el.setAttribute("x1", String(p1.x));
                        el.setAttribute("y1", String(p1.y));
                        el.setAttribute("x2", String(p2.x));
                        el.setAttribute("y2", String(p2.y));
                        el.setAttribute("stroke-width", String(swTop));
                        el.setAttribute("stroke-dasharray", `${dashLen} ${dashGap}`);
                        el.removeAttribute("stroke-dashoffset");
                        el.removeAttribute("display");
                    }
                }
            }
        } catch { /* viewer transiently unavailable */ }
    }, [viewerRef, containerRef, svgGroups, showing]);

    useEffect(() => { updateSvgMembersRef.current = updateSvgMembers; }, [updateSvgMembers]);
    // Kick immediately when groups or the shown version change so visibility
    // and geometry update before the next user interaction.
    useEffect(() => { kick(OVERLAY_FRAMES.GROUP_CHANGE); }, [svgGroups, showing, kick]);

    return (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
            <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                <defs>
                    {/* One pattern per zone group — patternTransform is updated each
                        frame in updatePositions so stripes pan with the polygon. */}
                    {polygonGroups.map((g) => {
                        const color = KIND_COLOR[g.kind];
                        return (
                            <pattern
                                key={g.id}
                                id={`zs-${g.id}`}
                                ref={(node) => {
                                    if (node) patternRefs.current.set(g.id, node);
                                    else patternRefs.current.delete(g.id);
                                }}
                                patternUnits="userSpaceOnUse"
                                width="14" height="14"
                                patternTransform={`rotate(${stripeRotation[g.kind]})`}
                            >
                                <rect width="14" height="14" fill="transparent" />
                                <line x1="0" y1="0" x2="0" y2="14"
                                    stroke={color} strokeWidth="3" strokeOpacity="0.85" />
                            </pattern>
                        );
                    })}
                </defs>

                {/* Zone polygons — striped fill with screen blend so items inside remain visible */}
                {polygonGroups.map((g) => {
                    const color = KIND_COLOR[g.kind];
                    const isActive = activeIds.has(g.id);
                    return (
                        <polygon
                            key={g.id}
                            ref={(node) => {
                                if (node) polyRefs.current.set(g.id, node as SVGPolygonElement);
                                else polyRefs.current.delete(g.id);
                            }}
                            style={{
                                display: "none",
                                cursor: "pointer",
                                pointerEvents: "stroke",
                                mixBlendMode: "screen",
                            }}
                            fill={`url(#zs-${g.id})`}
                            stroke={color}
                            strokeWidth={isActive ? 4 : 3}
                            strokeOpacity={isActive ? 1 : 0.85}
                            filter={isActive ? `drop-shadow(0 0 4px ${color})` : undefined}
                            onClick={() => onGroupClick(g)}
                            onWheel={forwardWheel}
                        />
                    );
                })}

                {/* Text items (gr_text / fp_text) — tight rotated border, no fill pattern */}
                {textPolyGroups.map((g) => {
                    const color = KIND_COLOR[g.kind];
                    const isActive = activeIds.has(g.id);
                    return (
                        <polygon
                            key={g.id}
                            ref={(node) => {
                                if (node) polyRefs.current.set(g.id, node as SVGPolygonElement);
                                else polyRefs.current.delete(g.id);
                            }}
                            style={{ display: "none", cursor: "pointer", pointerEvents: "stroke" }}
                            fill={`${color}22`}
                            stroke={color}
                            strokeWidth={isActive ? 3 : 2}
                            strokeOpacity={isActive ? 1 : 0.9}
                            filter={isActive ? `drop-shadow(0 0 4px ${color})` : undefined}
                            onClick={() => onGroupClick(g)}
                            onWheel={forwardWheel}
                        />
                    );
                })}

                {/* Net groups wrapped in one translucent layer: members render
                    OPAQUE, then a single group-opacity flattens + fades the whole
                    layer once. This stops overlapping/touching traces from
                    compounding into darker patches. */}
                <g opacity={0.78}>
                {svgGroups.map((g) => {
                    const color = KIND_COLOR[g.kind];
                    const isActive = activeIds.has(g.id);
                    const filter = isActive ? `drop-shadow(0 0 3px ${color})` : undefined;
                    return g.members.map((dm, mi) => {
                        const key     = `${g.id}:${mi}`;
                        const keyBase = `${key}:base`;
                        const item = dm.item as PcbItem;
                        const isVia = item.type === "via";
                        if (isVia) {
                            return (
                                <rect
                                    key={key}
                                    ref={(node) => {
                                        if (node) memberSvgRefs.current.set(key, node);
                                        else memberSvgRefs.current.delete(key);
                                    }}
                                    display="none"
                                    x="0" y="0" width="0" height="0"
                                    rx="2" ry="2"
                                    fill={`${color}1A`}
                                    stroke={color}
                                    strokeWidth={isActive ? 2.5 : 2}
                                    strokeOpacity={isActive ? 1 : 0.9}
                                    filter={filter}
                                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                                    onClick={() => onGroupClick(g)}
                                    onWheel={forwardWheel}
                                />
                            );
                        }
                        return (
                            <g key={key} style={{ cursor: "pointer", pointerEvents: "stroke" }} onClick={() => onGroupClick(g)} onWheel={forwardWheel}>
                                {/* Solid black outline — opacity 0 (kept for future restyling). */}
                                <line
                                    ref={(node) => {
                                        if (node) memberSvgRefs.current.set(keyBase, node);
                                        else memberSvgRefs.current.delete(keyBase);
                                    }}
                                    display="none"
                                    x1="0" y1="0" x2="0" y2="0"
                                    stroke="#000"
                                    strokeOpacity="0"
                                    strokeLinecap="round"
                                />
                                {/* Color on top — dashed zebra when idle, solid outline when selected.
                                    updateSvgMembers writes/clears stroke-dasharray based on isActive. */}
                                <line
                                    ref={(node) => {
                                        if (node) memberSvgRefs.current.set(key, node);
                                        else memberSvgRefs.current.delete(key);
                                    }}
                                    display="none"
                                    x1="0" y1="0" x2="0" y2="0"
                                    data-active={isActive ? "1" : "0"}
                                    stroke={color}
                                    strokeOpacity={1}
                                    strokeLinecap="round"
                                    filter={isActive ? `drop-shadow(0 0 3px ${color})` : undefined}
                                />
                            </g>
                        );
                    });
                })}
                </g>
            </svg>

            {/* Div boxes for footprints and graphics — bbox is accurate for these */}
            {boxGroups.map((g) => {
                const color = KIND_COLOR[g.kind];
                const isActive = activeIds.has(g.id);
                const HIT = 6;
                return (
                    <div
                        key={g.id}
                        ref={(node) => {
                            if (node) boxRefs.current.set(g.id, node);
                            else boxRefs.current.delete(g.id);
                        }}
                        className="absolute pointer-events-none"
                        style={{
                            display: "none",
                            border: `2px solid ${color}`,
                            borderRadius: 3,
                            backgroundColor: `${color}1A`,
                            outline: "1.5px solid rgba(0,0,0,0.7)",
                            outlineOffset: "1px",
                            boxShadow: isActive
                                ? `0 0 0 3px ${color}99, 0 0 8px 2px ${color}66`
                                : `0 0 0 1.5px rgba(0,0,0,0.5)`,
                        }}
                    >
                        {(["top", "right", "bottom", "left"] as const).map((side) => (
                            <div
                                key={side}
                                onClick={(e) => { e.stopPropagation(); onGroupClick(g); }}
                                onWheel={forwardWheel}
                                className="absolute pointer-events-auto cursor-pointer"
                                style={{
                                    top:    side === "bottom" ? "auto" : -HIT / 2,
                                    bottom: side === "top"    ? "auto" : -HIT / 2,
                                    left:   side === "right"  ? "auto" : -HIT / 2,
                                    right:  side === "left"   ? "auto" : -HIT / 2,
                                    height: side === "top" || side === "bottom" ? HIT : "auto",
                                    width:  side === "left" || side === "right" ? HIT : "auto",
                                }}
                            />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Vec2   = { x: number; y: number; set: (x: number, y: number) => void };
type Camera = { center: Vec2; zoom: number; bbox: unknown };
type InnerViewer = {
    viewport?: { camera?: Camera };
    draw?: () => void;
    renderer?: { ctx2d?: unknown; gl?: unknown };
};
type BoardEl = HTMLElement & { viewer?: InnerViewer };

function GroupRow({ g, isActive, onClick }: {
    g: GroupedMarker;
    isActive: boolean;
    onClick: (g: GroupedMarker) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = !!g.childGroups?.length;
    return (
        <div>
            <div className={`flex items-center text-xs transition-colors hover:bg-muted/60 ${isActive ? "bg-muted" : ""}`}>
                <button
                    onClick={() => onClick(g)}
                    className="flex-1 text-left flex items-center gap-2 px-3 py-1.5 min-w-0"
                >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: KIND_COLOR[g.kind] }} />
                    <span className="text-white font-medium truncate">{g.label}</span>
                </button>
                {hasChildren && (
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="px-2 py-1.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                        title={expanded ? "Collapse" : "Show structural items"}
                    >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                )}
            </div>
            {hasChildren && expanded && (
                <div className="ml-5 border-l border-border/50 pl-2 mb-0.5">
                    {g.childGroups!.map((child, ci) => (
                        <div key={ci} className="flex items-center gap-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: KIND_COLOR[child.kind] }} />
                            <span className="truncate">{child.label}</span>
                            <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">{child.members.length}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function PcbDiffViewer({
    projectId,
    commit1,
    commit2,
    onClose,
    embedded = false,
    onCrossProbe,
    crossProbeTarget,
    focusItemId,
    singleCommit = false,
    active = true,
}: PcbDiffViewerProps) {
    const [data, setData] = useState<PcbDiffData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showing, setShowing] = useState<"new" | "old">("new");
    const [activeGroup, setActiveGroup] = useState<GroupedMarker | null>(null);

    // Parsing backend used to compute the diff: in-house ("native") or
    // kicad_monkey ("monkey"). Changing it refetches the diff.
    const parser = (() => { try { return localStorage.getItem("kicad-prism:diff:parser") === "monkey" ? "monkey" : "native"; } catch { return "native"; } })() as "native" | "monkey";

    const [showOverlay, setShowOverlay] = useState(true);
    const [showAdded, setShowAdded] = useState(true);
    const [showRemoved, setShowRemoved] = useState(true);
    const [showChanged, setShowChanged] = useState(true);
    const [hiddenCategories, setHiddenCategories] = useState<Set<GroupCategory>>(new Set());

    const toggleCategory = useCallback((cat: GroupCategory) => {
        setHiddenCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
        });
    }, []);

    const newViewerRef = useRef<ECadViewerElement | null>(null);
    const oldViewerRef = useRef<ECadViewerElement | null>(null);
    const viewerRef = showing === "new" ? newViewerRef : oldViewerRef;
    const overlayKickRef = useRef<((frames?: number) => void) | null>(null);
    const viewerContainerRef = useRef<HTMLDivElement | null>(null);

    const boardElCache = useRef<WeakMap<ECadViewerElement, BoardEl>>(new WeakMap());

    const getBoardEl = useCallback((host: ECadViewerElement): BoardEl | null => {
        // Cache entry is valid only if the viewer is still ALIVE — i.e. its
        // renderer hasn't been disposed (WebGL2Renderer.dispose() sets gl =
        // void 0). React StrictMode (and any future unmount/remount cycle of
        // the kc-board-viewer inside the shadow DOM) can leave us with a
        // cached dead reference while a fresh kc-board-viewer paints alongside.
        const cached = boardElCache.current.get(host);
        const cachedInner = cached?.viewer as (BoardEl["viewer"] & { renderer?: { gl?: unknown } }) | undefined;
        if (cached && cachedInner?.viewport?.camera && cachedInner?.renderer?.gl) return cached;
        // Cache miss or stale — re-walk and prefer the live viewer.
        const walk = (root: ShadowRoot | Element): BoardEl | null => {
            const sr = (root as HTMLElement).shadowRoot;
            const searchRoot = sr ?? root;
            const candidates = Array.from((searchRoot as ShadowRoot).querySelectorAll?.("kc-board-viewer") ?? []) as BoardEl[];
            for (const el of candidates) {
                const v = el?.viewer as (BoardEl["viewer"] & { renderer?: { gl?: unknown } }) | undefined;
                if (v?.viewport?.camera && v?.renderer?.gl) return el;
            }
            for (const child of (searchRoot as ShadowRoot).querySelectorAll?.("*") ?? []) {
                if ((child as HTMLElement).shadowRoot) {
                    const f = walk(child as HTMLElement);
                    if (f) return f;
                }
            }
            // Fall back to any candidate (even disposed) so callers that don't
            // need gl (e.g. overlay positioning via worldToScreen) still work.
            return candidates[0] ?? null;
        };
        const result = host.shadowRoot ? walk(host) : null;
        const resultInner = result?.viewer as (BoardEl["viewer"] & { renderer?: { gl?: unknown } }) | undefined;
        if (resultInner?.viewport?.camera && resultInner?.renderer?.gl) {
            boardElCache.current.set(host, result!);
        }
        return result;
    }, []);

    const getCamera = useCallback((host: ECadViewerElement): Camera | null => {
        return getBoardEl(host)?.viewer?.viewport?.camera ?? null;
    }, [getBoardEl]);

    const safeDraw = useCallback((host: ECadViewerElement) => {
        const inner = getBoardEl(host)?.viewer;
        if (inner?.renderer?.gl) inner.draw?.();
    }, [getBoardEl]);

    // PCB-only click hit-testing fixes (layer-visibility map + pad-priority).
    // Re-applies whenever the diff payload changes (new viewer instances).
    useBoardClickFix({ viewerRefs: [newViewerRef, oldViewerRef], rebindKey: data });

    // Impose a camera position on the active viewer until user interacts.
    const imposeCamRef = useRef<{ zoom: number; cx: number; cy: number } | null>(null);

    const showingRef = useRef(showing);
    useEffect(() => { showingRef.current = showing; }, [showing]);

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

    const handleToggle = useCallback((next: "new" | "old") => {
        if (next === showing) return;
        const fromRef = showing === "new" ? newViewerRef : oldViewerRef;
        const toRef   = showing === "new" ? oldViewerRef : newViewerRef;
        const cam = fromRef.current ? getCamera(fromRef.current) : null;
        if (cam) {
            const state = { zoom: cam.zoom, cx: cam.center.x, cy: cam.center.y };
            imposeCamRef.current = state;
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

    const [activeBoard, setActiveBoard] = useState<string>("");

    const viewerRefsArr = useRef([newViewerRef, oldViewerRef]).current;
    const { detail: selectedDetail, clear: clearSelectedDetail } = useEcadInfoPanel({
        containerRef: viewerContainerRef,
        viewerRefs: viewerRefsArr,
    });

    useEffect(() => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ commit1, commit2, parser });
        try {
            if (localStorage.getItem("kicad-prism:diff:track-net-names") === "true") {
                params.set("track_net_names", "true");
            }
        } catch { /* ignore */ }
        // include_content=false: the diff payload carries only the change list
        // + rel_path; board files are lazy-fetched separately from the
        // cacheable per-commit file endpoint (see the board-content effect).
        params.set("include_content", "false");
        fetch(`/api/projects/${projectId}/pcb-diff?${params}`)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<PcbDiffData>;
            })
            .then((d) => {
                setData(d);
                if (d.boards.length > 0) setActiveBoard(d.boards[0].filename);
                setLoading(false);
            })
            .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : "Failed to load diff");
                setLoading(false);
            });
    }, [projectId, commit1, commit2, parser]);

    // Lazy-fetched board file contents, keyed `${side}:${filename}`. Populated
    // from the cacheable /commits/{hash}/file endpoint so each board file is
    // downloaded (gzipped) at most once per commit and cached by the browser.
    const [boardContent, setBoardContent] = useState<Record<string, string>>({});

    useEffect(() => {
        setBoardContent({});
    }, [commit1, commit2]);

    useEffect(() => {
        if (!data) return;
        const controller = new AbortController();
        const fetchSide = async (side: "new" | "old", commit: string, board: BoardData) => {
            const key = `${side}:${board.filename}`;
            const url = `/api/projects/${projectId}/commits/${commit}/file?path=${encodeURIComponent(board.rel_path)}`;
            const r = await fetch(url, { signal: controller.signal });
            if (!r.ok) return;
            const text = await r.text();
            setBoardContent(prev => (prev[key] !== undefined ? prev : { ...prev, [key]: text }));
        };
        for (const board of data.boards) {
            if (board.has_new) void fetchSide("new", data.commit1, board).catch(() => {});
            if (board.has_old) void fetchSide("old", data.commit2, board).catch(() => {});
        }
        return () => controller.abort();
    }, [data, projectId]);

    const activeBoardData = data?.boards.find(b => b.filename === activeBoard) ?? null;

    // KiCad-style hotkeys: zoom, fit, redraw, board nav, close.
    const cycleBoard = useCallback((delta: 1 | -1) => {
        const boards = data?.boards;
        if (!boards || boards.length === 0) return;
        const idx = boards.findIndex(b => b.filename === activeBoard);
        const next = boards[((idx === -1 ? 0 : idx) + delta + boards.length) % boards.length];
        if (next) setActiveBoard(next.filename);
    }, [data, activeBoard]);
    useViewerHotkeys({
        containerRef: viewerContainerRef,
        viewerRefs: viewerRefsArr,
        onNextSheet: () => cycleBoard(1),
        onPrevSheet: () => cycleBoard(-1),
        onClose,
    });

    const rawMarkers: DiffMarker[] = [];
    if (activeBoardData) {
        for (const item of activeBoardData.diff.added)
            rawMarkers.push({ kind: "added", item });
        for (const item of activeBoardData.diff.removed)
            rawMarkers.push({ kind: "removed", item });
        for (const { item, old_item, changes } of activeBoardData.diff.changed)
            rawMarkers.push({ kind: "changed", item, old_item, changes });
    }
    const allGroups = groupMarkers(rawMarkers);

    const visibleGroups = !showOverlay ? [] : allGroups.flatMap((g) => {
        if (hiddenCategories.has(g.category as GroupCategory)) return [];
        if (g.kind === "added"   && !showAdded)   return [];
        if (g.kind === "removed" && !showRemoved)  return [];
        if (g.kind === "changed" && !showChanged)  return [];
        if (!singleCommit) {
            if (g.kind === "added"   && showing !== "new") return [];
            if (g.kind === "removed" && showing !== "old") return [];
        }
        // Net groups: expand to per-segment overlay groups so each segment gets
        // its own tight bbox instead of one merged rect covering the whole net.
        if (g.overlayGroups) {
            return g.overlayGroups.filter(og => {
                if (og.kind === "added"   && !showAdded)   return false;
                if (og.kind === "removed" && !showRemoved)  return false;
                if (og.kind === "changed" && !showChanged)  return false;
                if (!singleCommit) {
                    if (og.kind === "added"   && showing !== "new") return false;
                    if (og.kind === "removed" && showing !== "old") return false;
                }
                return true;
            });
        }
        return [g];
    });

    const totalChanges = allGroups.length;

    const boardChangeCounts = data
        ? Object.fromEntries(data.boards.map(b => [
            b.filename,
            b.diff.added.length + b.diff.removed.length + b.diff.changed.length,
          ]))
        : {};

    // Readiness signals — both hosts must reach a mounted+loaded state before
    // we can drive their cameras. Keyed on commit pair so a new diff re-arms.
    // Probe: inner kc-board-viewer reachable with a live camera == ready.
    const newViewerKey = data ? `pcb-diff-new-${data.commit1}-${data.commit2}` : "pcb-diff-new-pending";
    const oldViewerKey = data ? `pcb-diff-old-${data.commit1}-${data.commit2}` : "pcb-diff-old-pending";
    // Readiness requires: camera present, WebGL context up, AND the canvas
    // is actually sized to its container. Without the canvas-size check we
    // can fire focus while the canvas is still at its default 300x150 — the
    // bbox setter computes zoom against that small viewport, and once the
    // SizeObserver fires later and resizes the canvas, the locked zoom
    // displays the component at the wrong scale (looks un-zoomed).
    const boardReadyProbe = useCallback(
        (host: ECadViewerElement) => {
            const inner = getBoardEl(host)?.viewer as {
                viewport?: { camera?: { viewport_size?: { x?: number; y?: number } } };
                renderer?: { gl?: unknown; canvas?: HTMLCanvasElement };
            } | undefined;
            if (!inner?.viewport?.camera || !inner?.renderer?.gl) return false;
            // viewport_size mirrors canvas.clientWidth/clientHeight via the
            // SizeObserver; zero or default values mean the layout hasn't
            // settled. Require both > the default 300x150 OR at least non-zero
            // and matching the canvas client size.
            const vp = inner.viewport.camera.viewport_size;
            const canvas = inner.renderer.canvas;
            if (!vp || !canvas) return false;
            const cw = canvas.clientWidth;
            const ch = canvas.clientHeight;
            // Real layout: client size is non-zero and viewport_size matches.
            return cw > 0 && ch > 0 && vp.x === cw && vp.y === ch;
        },
        [getBoardEl],
    );
    const { ready: newReady } = useViewerReadiness({ host: newViewerRef, viewerKey: newViewerKey, probe: boardReadyProbe });
    const { ready: oldReady } = useViewerReadiness({ host: oldViewerRef, viewerKey: oldViewerKey, probe: boardReadyProbe });

    // Resolve the focus item synchronously from data. Returns null until data
    // is available or the uuid can't be found on any board. Memoized so the
    // focus effect's deps don't churn every render.
    const focusTarget = useMemo<{ board: string; uuid: string; side: "new" | "old" } | null>(() => {
        if (!data || !focusItemId) return null;
        for (const board of data.boards) {
            const inAdded   = board.diff.added.some(i => i.uuid === focusItemId);
            const inRemoved = board.diff.removed.some(i => i.uuid === focusItemId);
            const inChanged = board.diff.changed.some(c => c.item.uuid === focusItemId);
            if (!inAdded && !inRemoved && !inChanged) continue;
            const side: "new" | "old" = singleCommit
                ? "new"
                : inRemoved && !inAdded && !inChanged ? "old"
                : "new";
            return { board: board.filename, uuid: focusItemId, side };
        }
        return null;
    }, [data, focusItemId, singleCommit]);

    // Zoom the named side's viewer to the group's bbox and lock the camera
    // there. Caller MUST guarantee the viewer is ready (camera mounted, host
    // load event fired) — see useViewerReadiness. If you're tempted to add a
    // retry here, fix the caller's readiness contract instead.
    const zoomToGroupOn = useCallback((g: GroupedMarker, target: "new" | "old") => {
        const ref = target === "new" ? newViewerRef : oldViewerRef;
        const viewer = ref.current;
        if (!viewer) return;
        const camera = getCamera(viewer);
        if (!camera) return;
        const pad = 10;
        // Drop any existing impose so the bbox math runs against the camera's
        // own settle. Re-engage after the viewer has recomputed zoom/center.
        imposeCamRef.current = null;
        camera.bbox = {
            x: g.bboxMinX - pad, y: g.bboxMinY - pad,
            w: (g.bboxMaxX - g.bboxMinX) + pad * 2,
            h: (g.bboxMaxY - g.bboxMinY) + pad * 2,
        };
        safeDraw(viewer);
        // The bbox setter schedules the zoom/center resolution for the next
        // paint — reading camera.zoom/center *now* gives stale values (often
        // zoom=1, which is what made the toggle look "miniscule"). Wait one
        // rAF, then sample the resolved camera and lock it.
        requestAnimationFrame(() => {
            const cam = getCamera(viewer);
            if (!cam) return;
            imposeCamRef.current = {
                zoom: cam.zoom,
                cx: cam.center.x,
                cy: cam.center.y,
            };
        });
        overlayKickRef.current?.(OVERLAY_FRAMES.ZOOM_TO);
    }, [getCamera, safeDraw]);

    const handleGroupClick = useCallback((g: GroupedMarker) => {
        // If this is a per-segment overlay sub-group, resolve to the parent net group.
        const resolved = allGroups.find(p => p.overlayGroups?.some(og => og.id === g.id)) ?? g;
        setActiveGroup(prev => prev?.id === resolved.id ? null : resolved);
        // In single-commit mode always stay on "new" — the old board isn't
        // shown so there's nowhere to toggle to.
        const targetSide: "new" | "old" = singleCommit
            ? "new"
            : g.kind === "added"   ? "new"
            : g.kind === "removed" ? "old"
            : showing;
        if (targetSide !== showing) {
            // handleToggle pre-writes the from-viewer's camera into the target
            // viewer and sets impose, so the swap is seamless. After the React
            // render flips visibility, run the zoom on the (now-active) viewer.
            handleToggle(targetSide);
            requestAnimationFrame(() => zoomToGroupOn(g, targetSide));
        } else {
            zoomToGroupOn(g, targetSide);
        }
    }, [zoomToGroupOn, showing, handleToggle, singleCommit]);

    // Focus flow — strictly event-driven, no timers. Fires exactly once per
    // focusItemId when all prerequisites converge:
    //   1. focusTarget is resolved (data is fetched and the uuid is found).
    //   2. activeBoard matches the target board (we drive setActiveBoard if not).
    //   3. The target side's viewer host has finished loading (readiness ready).
    //   4. The group is present in allGroups for the current render.
    // Any state change above re-evaluates the gate; the gate flips true exactly
    // once and we fire. No polling.
    const focusFiredRef = useRef<string | null>(null);
    useEffect(() => {
        if (!focusTarget) return;
        if (focusFiredRef.current === focusTarget.uuid) return;
        if (focusTarget.board !== activeBoard) {
            setActiveBoard(focusTarget.board);
            return;
        }
        const sideReady = focusTarget.side === "new" ? newReady : oldReady;
        if (!sideReady) return;
        const group = allGroups.find(g => g.members.some(m => m.item.uuid === focusTarget.uuid));
        if (!group) return;
        focusFiredRef.current = focusTarget.uuid;
        handleGroupClick(group);
    }, [focusTarget, activeBoard, newReady, oldReady, allGroups, handleGroupClick]);

    // Diagnostic safety net (option C): if everything except readiness is in
    // place after 8s of waiting, log which signal is missing. No best-effort
    // click — we don't want to fire against a viewer that genuinely isn't ready.
    useEffect(() => {
        if (!focusTarget) return;
        if (focusFiredRef.current === focusTarget.uuid) return;
        const t = window.setTimeout(() => {
            if (focusFiredRef.current === focusTarget.uuid) return;

            console.warn("[pcb-diff] focus stalled — target:", focusTarget,
                "activeBoard:", activeBoard,
                "newReady:", newReady, "oldReady:", oldReady,
                "groupFound:", allGroups.some(g => g.members.some(m => m.item.uuid === focusTarget.uuid)));
        }, 8000);
        return () => window.clearTimeout(t);
    }, [focusTarget, activeBoard, newReady, oldReady, allGroups]);

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

    // Navigate to a reference when cross-probed from the schematic / BOM viewer.
    // Gated on (a) the tab being active (canvas visible & sized) and
    // (b) the side-of-interest being ready (camera + GL context live).
    // The shared runner retries up to ~1.4s, cancelling stale retries when
    // a newer probe arrives.
    const crossProbeRunner = useCrossProbeRunner();
    const crossProbeFiredSeqRef = useRef<number>(-1);
    useEffect(() => {
        if (!crossProbeTarget || !active) return;
        if (crossProbeTarget.seq === crossProbeFiredSeqRef.current) return;
        const sideReady = showing === "new" ? newReady : oldReady;
        if (!sideReady) return;
        const viewer = (showing === "new" ? newViewerRef : oldViewerRef).current;
        crossProbeFiredSeqRef.current = crossProbeTarget.seq;
        crossProbeRunner.run(viewer, "SCH", "PCB", crossProbeTarget.ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crossProbeTarget, active, newReady, oldReady, showing]);

    return (
        <div className={embedded ? "h-full bg-background flex flex-col" : "fixed inset-0 z-50 bg-background flex flex-col"}>
            {!embedded && (
                <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold">Interactive PCB Diff</h2>
                        <p className="text-xs text-muted-foreground font-mono">
                            {commit2.slice(0, 7)} → {commit1.slice(0, 7)}
                        </p>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">

                {/* ── Left sidebar ── */}
                <div className="w-56 shrink-0 border-r flex flex-col bg-background overflow-hidden">

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
                                    added:   allGroups.filter((group) => group.kind === "added").length,
                                    removed: allGroups.filter((group) => group.kind === "removed").length,
                                    changed: allGroups.filter((group) => group.kind === "changed").length,
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

                    {data && data.boards.length > 1 && (
                        <div className="px-3 pb-2 shrink-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Boards</p>
                            <div className="space-y-0.5">
                                {data.boards.map((board) => {
                                    const count = boardChangeCounts[board.filename] ?? 0;
                                    const isActive = board.filename === activeBoard;
                                    const boardStatus = !board.has_old ? "added" : !board.has_new ? "removed" : null;
                                    return (
                                        <button
                                            key={board.filename}
                                            onClick={() => { setActiveBoard(board.filename); setActiveGroup(null); }}
                                            className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"}`}
                                        >
                                            {boardStatus && (
                                                <span
                                                    className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded leading-none"
                                                    style={{
                                                        backgroundColor: `${KIND_COLOR[boardStatus]}22`,
                                                        color: KIND_COLOR[boardStatus],
                                                        border: `1px solid ${KIND_COLOR[boardStatus]}66`,
                                                    }}
                                                >
                                                    {boardStatus === "added" ? "+" : "−"}
                                                </span>
                                            )}
                                            <span className="truncate flex-1">{board.filename.replace(/\.kicad_pcb$/, "")}</span>
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

                    <div className="flex-1 overflow-y-auto py-2">
                        {!data && !loading && (
                            <p className="text-xs text-muted-foreground px-4 py-2">No data</p>
                        )}
                        {data && totalChanges === 0 && (
                            <p className="text-xs text-muted-foreground px-4 py-4 text-center">No PCB changes detected</p>
                        )}
                        {data && (
                            (["components", "nets", "zones", "graphics"] as GroupCategory[]).map((cat) => {
                                const groups = allGroups.filter(g => g.category === cat);
                                if (groups.length === 0) return null;
                                const total = groups.reduce((sum, group) => sum + group.members.length, 0);
                                const hidden = hiddenCategories.has(cat);
                                return (
                                    <div key={cat} className="mb-2">
                                        <div className="text-[10px] uppercase tracking-wider px-3 py-1 sticky top-0 bg-background font-medium flex items-center gap-2 text-white">
                                            <span>{CATEGORY_META[cat].label}</span>
                                            <span className="font-mono text-[10px] opacity-70">{total}</span>
                                            <button
                                                onClick={() => toggleCategory(cat)}
                                                className="ml-auto opacity-50 hover:opacity-100 transition-opacity"
                                                title={hidden ? "Show highlights" : "Hide highlights"}
                                            >
                                                {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                            </button>
                                        </div>
                                        {groups.map((g) => (
                                            <GroupRow
                                                key={g.id}
                                                g={g}
                                                isActive={activeGroup?.id === g.id}
                                                onClick={handleGroupClick}
                                            />
                                        ))}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {activeGroup && (
                        <div className="border-t shrink-0 max-h-64 overflow-y-auto">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                                <span className="text-xs font-semibold" style={{ color: KIND_COLOR[activeGroup.kind] }}>
                                    {KIND_LABEL[activeGroup.kind]}
                                </span>
                                <button onClick={() => setActiveGroup(null)} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="px-3 py-2 space-y-1 text-xs">
                                {activeGroup.members.map((m, i) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-medium shrink-0" style={{ color: KIND_COLOR[m.kind] }}>
                                                {KIND_PREFIX[m.kind]}
                                            </span>
                                            <span className="font-medium">{itemLabel(m.item)}</span>
                                            <span className="ml-auto text-muted-foreground uppercase tracking-wider text-[10px]">{KIND_LABEL[m.kind]}</span>
                                        </div>
                                        {m.changes && Object.entries(m.changes).map(([field, { old: ov, new: nv }]) => (
                                            <div key={field} className="ml-3 rounded border bg-muted/30 p-1.5 space-y-1">
                                                <p className="font-medium text-muted-foreground">{fieldLabel(field)}</p>
                                                <div className="flex items-center gap-1 font-mono text-[11px]">
                                                    <span className="text-red-500 line-through truncate max-w-[80px]">{formatFieldValue(field, ov)}</span>
                                                    <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                                    <span className="text-green-500 truncate max-w-[80px]">{formatFieldValue(field, nv)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                {activeGroup.childGroups && activeGroup.childGroups.length > 0 && (
                                    <div className="pt-1 border-t border-border/50 space-y-0.5">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground pb-0.5">Structural</p>
                                        {activeGroup.childGroups.map((child, ci) => (
                                            <div key={ci} className="flex items-center gap-1.5">
                                                <span className="font-medium shrink-0" style={{ color: KIND_COLOR[child.kind] }}>
                                                    {KIND_PREFIX[child.kind]}
                                                </span>
                                                <span className="text-muted-foreground truncate">{child.label}</span>
                                                <span className="ml-auto font-mono text-[10px] opacity-60">{child.members.length}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Viewer area ── */}
                <div ref={viewerContainerRef} className="flex-1 relative overflow-hidden" style={{ isolation: "isolate" }}>
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-40">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Parsing PCB diff…</p>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center z-40">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <AlertCircle className="h-8 w-8 text-destructive" />
                                <p className="text-sm text-destructive">{error}</p>
                                <p className="text-xs text-muted-foreground">No PCB file found for this project/commit pair.</p>
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
                                    viewerKey={`pcb-diff-new-${data.commit1}-${data.commit2}`}
                                    files={data.boards
                                        .filter(b => boardContent[`new:${b.filename}`] !== undefined)
                                        .map(b => ({ filename: b.filename, content: boardContent[`new:${b.filename}`] }))}
                                    viewerRef={newViewerRef}
                                />
                            </div>
                            <div
                                className="absolute inset-0"
                                style={{ opacity: showing === "old" ? 1 : 0, pointerEvents: showing === "old" ? "auto" : "none" }}
                            >
                                <EcadViewerHost
                                    viewerKey={`pcb-diff-old-${data.commit1}-${data.commit2}`}
                                    files={data.boards
                                        .filter(b => boardContent[`old:${b.filename}`] !== undefined)
                                        .map(b => ({ filename: b.filename, content: boardContent[`old:${b.filename}`] }))}
                                    viewerRef={oldViewerRef}
                                />
                            </div>
                            <DiffOverlay
                                groups={visibleGroups}
                                viewerRef={viewerRef}
                                containerRef={viewerContainerRef}
                                getBoardEl={getBoardEl}
                                onGroupClick={handleGroupClick}
                                activeIds={activeGroup
                                    ? new Set([activeGroup.id, ...(activeGroup.overlayGroups?.map(og => og.id) ?? [])])
                                    : new Set<string>()}
                                showing={showing}
                                kickRef={overlayKickRef}
                            />
                            {activeBoardData && (
                                (showing === "new" && !activeBoardData.has_new) ||
                                (showing === "old" && !activeBoardData.has_old)
                            ) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-30 pointer-events-none">
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        {showing === "new" ? (
                                            <>
                                                <span className="text-2xl font-bold" style={{ color: KIND_COLOR.removed }}>−</span>
                                                <p className="text-sm font-medium">Board removed</p>
                                                <p className="text-xs text-muted-foreground">This board does not exist in the new version</p>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-2xl font-bold" style={{ color: KIND_COLOR.added }}>+</span>
                                                <p className="text-sm font-medium">Board added</p>
                                                <p className="text-xs text-muted-foreground">This board does not exist in the old version</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {totalChanges === 0 && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/90 border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow z-30">
                                    No PCB changes detected between these commits
                                </div>
                            )}
                            <EcadInfoPanel detail={selectedDetail} onClose={clearSelectedDetail} />
                            <HotkeysLegend
                                entries={[
                                    ...COMMON_HOTKEYS,
                                    ...(data.boards.length > 1
                                        ? [{ keys: ["PgUp", "PgDn"], label: "Previous / next board" }]
                                        : []),
                                    { keys: ["Esc"], label: "Close" },
                                ]}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
