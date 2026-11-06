import type { CommentContext, CommentLocation } from "@/types/comments";
import type { ECadViewerElement, EcadSemanticSelectionDetail } from "@/types/ecad-viewer";

/**
 * The project viewer's interaction modes: which tab is open, comment mode,
 * the comment draft, the selected comment and the right rail, and the rules
 * between them -- the Esc order, the C key, comment ⇄ measure exclusion and
 * which element a mode reaches on which tab.
 *
 * Inset and measure mode live in the <ecad-viewer> elements (they take I and
 * Cmd/Ctrl+Shift+M themselves, and turn each other off); this module only
 * decides when the host asks them to give up Escape or stop measuring.
 * React holds the state with `useReducer`; visualizer.tsx feeds it keys,
 * clicks and viewer events and applies `elementModes` to each element.
 */

/** Toolbar order is also the shortcut order: 1 through 6 select the nth tab. */
export const VIEWER_TABS = ["sch", "pcb", "3d", "bom", "stackup", "assembly"] as const;
export type VisualizerTab = (typeof VIEWER_TABS)[number];
export type ViewerRightRailTab = "selection" | "comments";
type ViewerElementKind = "sch" | "pcb";

/** Read only when the comment submits, never on screen. */
interface PendingCommentElement {
    elementId?: string;
    elementRef?: string;
    elementType?: string;
    relativePoint?: [number, number];
}

export interface CommentDraft {
    context: CommentContext;
    location: CommentLocation;
    element: PendingCommentElement | null;
}

export interface ViewerModes {
    tab: VisualizerTab;
    commentMode: boolean;
    /** The open comment form; null when closed. */
    draft: CommentDraft | null;
    selectedCommentId: string | null;
    rightRail: ViewerRightRailTab | null;
    /**
     * Views mounted so far; once mounted a view stays mounted. The board
     * mounts on its first visit (its parse runs on the main thread) or when
     * schematic insets need it; the 3D tab on its first visit (3D or stackup)
     * or when a PCB inset asks for the 3D board.
     */
    mounted: { pcb: boolean; "3d": boolean };
}

export type ViewerModeInput =
    | { type: "tab"; tab: VisualizerTab }
    /** Escape that no element consumed. */
    | { type: "escape" }
    /** C on a CAD tab, with the viewer's last selection. */
    | { type: "comment-key"; selection: EcadSemanticSelectionDetail | null }
    | { type: "toggle-comment-mode" }
    /** The board element's `ecad-viewer:measure-mode` event. */
    | { type: "measure-mode"; on: boolean }
    /** An element's `ecad-viewer:comment-area` event. */
    | { type: "comment-area"; context: CommentContext; location: CommentLocation }
    | { type: "close-draft" }
    | { type: "select-comment"; id: string | null }
    | { type: "comment-deleted"; id: string }
    | { type: "rail"; tab: ViewerRightRailTab | null }
    | { type: "toggle-rail"; tab: ViewerRightRailTab }
    /** Whether the selection inspector has something for the active view. */
    | { type: "inspector"; hasContent: boolean }
    /** A view needed in the background: insets turned on, or the 3D board for an inset. */
    | { type: "mount"; view: "pcb" | "3d" };

function mountTab(mounted: ViewerModes["mounted"], tab: VisualizerTab): ViewerModes["mounted"] {
    if (tab === "pcb" && !mounted.pcb) return { ...mounted, pcb: true };
    if ((tab === "3d" || tab === "stackup") && !mounted["3d"]) return { ...mounted, "3d": true };
    return mounted;
}

/** Opens on the tab a caller asked for (`?tab=`), else the schematic. */
export function initialViewerModes(requestedTab: string | null): ViewerModes {
    const tab = VIEWER_TABS.find((candidate) => candidate === requestedTab) ?? "sch";
    return {
        tab, commentMode: false, draft: null, selectedCommentId: null, rightRail: null,
        mounted: mountTab({ pcb: false, "3d": false }, tab),
    };
}

function isCadTab(tab: VisualizerTab): tab is ViewerElementKind {
    return tab === "sch" || tab === "pcb";
}

/** Comment mode, its button and C exist on the schematic and the board. */
export function commentModeAvailable(tab: VisualizerTab, canComment: boolean): boolean {
    return canComment && isCadTab(tab);
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Element comments use marker-at-center only; the item box is not an area. */
function draftFromSelection(
    context: CommentContext,
    selection: EcadSemanticSelectionDetail & { x: number; y: number },
): CommentDraft {
    const bounds = selection.bounds;
    return {
        context,
        location: { x: selection.x, y: selection.y, layer: selection.layer ?? "", page: selection.page },
        element: {
            elementId: selection.uuid,
            elementRef: selection.reference,
            elementType: selection.itemType,
            relativePoint: bounds && bounds[2] > 0 && bounds[3] > 0
                ? [clamp01((selection.x - bounds[0]) / bounds[2]), clamp01((selection.y - bounds[1]) / bounds[3])]
                : undefined,
        },
    };
}

export function viewerModesReducer(state: ViewerModes, input: ViewerModeInput): ViewerModes {
    switch (input.type) {
        case "tab":
            return state.tab === input.tab ? state : { ...state, tab: input.tab, mounted: mountTab(state.mounted, input.tab) };
        case "escape":
            return { ...state, commentMode: false, draft: null, selectedCommentId: null, rightRail: null };
        case "comment-key": {
            if (!isCadTab(state.tab)) return state;
            const selection = input.selection;
            if (selection && selection.x !== undefined && selection.y !== undefined) {
                const context = state.tab === "sch" ? "SCH" : "PCB";
                return {
                    ...state,
                    commentMode: false,
                    draft: draftFromSelection(context, { ...selection, x: selection.x, y: selection.y }),
                };
            }
            // No selected point: C toggles commenting mode.
            return { ...state, commentMode: !state.commentMode };
        }
        case "toggle-comment-mode":
            return { ...state, commentMode: !state.commentMode };
        case "measure-mode":
            // One click mode at a time on the board.
            return input.on && state.commentMode ? { ...state, commentMode: false } : state;
        case "comment-area":
            return {
                ...state,
                commentMode: false,
                draft: { context: input.context, location: input.location, element: null },
            };
        case "close-draft":
            return state.draft ? { ...state, draft: null } : state;
        case "select-comment":
            return state.selectedCommentId === input.id ? state : { ...state, selectedCommentId: input.id };
        case "comment-deleted":
            return state.selectedCommentId === input.id ? { ...state, selectedCommentId: null } : state;
        case "rail":
            return state.rightRail === input.tab ? state : { ...state, rightRail: input.tab };
        case "toggle-rail":
            return { ...state, rightRail: state.rightRail === input.tab ? null : input.tab };
        case "inspector":
            // Content opens the selection panel; losing it closes only that
            // panel, never the comments.
            if (input.hasContent) return state.rightRail === "selection" ? state : { ...state, rightRail: "selection" };
            return state.rightRail === "selection" ? { ...state, rightRail: null } : state;
        case "mount":
            return state.mounted[input.view] ? state : { ...state, mounted: { ...state.mounted, [input.view]: true } };
    }
}

/**
 * What one element should be told: comment mode only on its own tab, and
 * the board stops measuring whenever comment mode is on.
 */
export function elementModes(state: ViewerModes, element: ViewerElementKind) {
    return {
        commentMode: state.commentMode && state.tab === element,
        endMeasure: element === "pcb" && state.commentMode,
    };
}

type EscapableElement = Partial<Pick<ECadViewerElement, "escapeInsets" | "escapeMeasure">>;

/**
 * Escape goes to the active element first: insets (the preview, then every
 * inset), then on the board measure mode (its points, then the mode). Only
 * an Escape neither consumed reaches the host's own clear.
 */
export function consumeElementEscape(tab: VisualizerTab, element: EscapableElement | null): boolean {
    if (!element || !isCadTab(tab)) return false;
    if (element.escapeInsets?.()) return true;
    return tab === "pcb" && Boolean(element.escapeMeasure?.());
}

export type ViewerKey = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

type ViewerKeyIntent =
    | { kind: "escape" }
    | { kind: "tab"; tab: VisualizerTab }
    | { kind: "comment" }
    | { kind: "schematic-page"; direction: -1 | 1 }
    | { kind: "schematic-parent" };

/** What a key means to the viewer host, in the order the host checks. */
export function viewerKeyIntent(event: ViewerKey, tab: VisualizerTab, canComment: boolean): ViewerKeyIntent | null {
    if (event.key === "Escape") return { kind: "escape" };
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    // Modifiers are excluded so the browser keeps Cmd/Ctrl+1..9.
    if (plain && !event.shiftKey) {
        const index = Number.parseInt(event.code.startsWith("Digit") ? event.code.slice(5) : event.key, 10);
        if (Number.isInteger(index) && index >= 1 && index <= VIEWER_TABS.length) {
            return { kind: "tab", tab: VIEWER_TABS[index - 1] };
        }
    }
    if (plain && commentModeAvailable(tab, canComment) && event.key.toLowerCase() === "c") return { kind: "comment" };
    if (tab !== "sch") return null;
    if (event.key === "[" || event.code === "BracketLeft") return { kind: "schematic-page", direction: -1 };
    if (event.key === "]" || event.code === "BracketRight") return { kind: "schematic-page", direction: 1 };
    if (event.altKey && (event.key === "Backspace" || event.key === "Delete")) return { kind: "schematic-parent" };
    return null;
}
