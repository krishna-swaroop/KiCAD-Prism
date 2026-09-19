/**
 * Host-side multi-net highlight state (contract C1, Prism side).
 *
 * Pure shaping only: the highlighted-net collection, the mapping from viewer
 * selection details to revision-scoped {@link ScopedNetRef}s, revision
 * clearing and echo suppression. The Visualizer owns the imperative viewer
 * calls; this module owns what the collection is and what the viewer's answer
 * means for it.
 */

import { schematicPageHint } from "@/lib/prism-selection";
import type {
    EcadSemanticSelectionDetail,
    HighlightChangeDetail,
    HighlightContext,
    HighlightUnresolvedReason,
    ScopedNetRef,
} from "@/types/ecad-viewer";
import type {
    PrismSelection,
    PrismSemanticIndex,
    SemanticSchematicRef,
} from "@/types/prism-selection";

/** Stable producer identity for every request Prism sends. */
export const REVIEW_HIGHLIGHT_ORIGIN = "prism-selection";

/** Gesture intents the highlight controller accepts; replace stays inspection. */
export type HighlightIntent = "add" | "toggle";

/** How many recently issued request ids are remembered for echo suppression. */
const ISSUED_REQUEST_ID_LIMIT = 32;

/**
 * A rejection the reviewer should see: either Prism could not turn the
 * gesture into a complete reference, or the viewer refused it. `ref` is absent
 * when the gesture itself could not produce one.
 */
export interface HighlightNotice {
    /** Dedupe key: the ref key when a ref exists, otherwise a label key. */
    key: string;
    /** Short label shown beside the reason. */
    label: string;
    reason: HighlightUnresolvedReason;
    /** Human-readable explanation; never a raw enum. */
    message: string;
    ref?: ScopedNetRef;
}

export interface ReviewHighlightState {
    /** Ordered, duplicate-free; insertion order is the chip order. */
    refs: readonly ScopedNetRef[];
    notices: readonly HighlightNotice[];
    /** Request ids this host issued; the viewer's echo of them is ignored. */
    issuedRequestIds: readonly string[];
    /** Element revision keys the refs were collected against, per context. */
    revisionKeys: Readonly<Record<HighlightContext, string | null>>;
}

export function createReviewHighlightState(): ReviewHighlightState {
    return {
        refs: [],
        notices: [],
        issuedRequestIds: [],
        revisionKeys: { PCB: null, SCH: null },
    };
}

/**
 * Collapse key, identical to the viewer's: `(context, documentKey,
 * occurrencePath ?? '', netKey)`. Kept local so Prism does not import the
 * bundle's internals.
 */
export function highlightRefKey(ref: ScopedNetRef): string {
    return [ref.context, ref.documentKey, ref.occurrencePath ?? "", ref.netKey]
        .map((part) => encodeURIComponent(part))
        .join("\u0000");
}

export function dedupeHighlightRefs(
    refs: readonly ScopedNetRef[],
): ScopedNetRef[] {
    const seen = new Set<string>();
    const unique: ScopedNetRef[] = [];
    for (const ref of refs) {
        const key = highlightRefKey(ref);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(ref);
    }
    return unique;
}

export function applyHighlightIntent(
    refs: readonly ScopedNetRef[],
    ref: ScopedNetRef,
    intent: HighlightIntent,
): readonly ScopedNetRef[] {
    const key = highlightRefKey(ref);
    const present = refs.some((candidate) => highlightRefKey(candidate) === key);
    if (intent === "add") {
        return present ? refs : [...refs, ref];
    }
    return present
        ? refs.filter((candidate) => highlightRefKey(candidate) !== key)
        : [...refs, ref];
}

export function removeHighlightRef(
    refs: readonly ScopedNetRef[],
    ref: ScopedNetRef,
): readonly ScopedNetRef[] {
    const key = highlightRefKey(ref);
    const next = refs.filter((candidate) => highlightRefKey(candidate) !== key);
    return next.length === refs.length ? refs : next;
}

/**
 * Split one context's refs by `documentKey`. A viewer request carries exactly
 * one document, so every re-projection or replay needs one request per
 * document. Insertion order is preserved.
 */
export function groupHighlightRefsByDocument(
    refs: readonly ScopedNetRef[],
    context: HighlightContext,
): ScopedNetRef[][] {
    const groups = new Map<string, ScopedNetRef[]>();
    for (const ref of refs) {
        if (ref.context !== context) continue;
        const group = groups.get(ref.documentKey);
        if (group) group.push(ref);
        else groups.set(ref.documentKey, [ref]);
    }
    return Array.from(groups.values());
}

function noticeForUnresolved(
    entry: { ref: ScopedNetRef; reason: HighlightUnresolvedReason },
): HighlightNotice {
    return {
        key: highlightRefKey(entry.ref),
        label: entry.ref.netKey || "Net",
        reason: entry.reason,
        message: unresolvedMessage(entry.reason, entry.ref.netKey),
        ref: entry.ref,
    };
}

/** Human-readable explanation for a viewer-reported rejection. */
export function unresolvedMessage(
    reason: HighlightUnresolvedReason,
    label: string,
): string {
    const name = label ? `"${label}"` : "This net";
    switch (reason) {
        case "revision-mismatch":
            return `${name} belongs to a different revision; reopen it in the current revision.`;
        case "document-mismatch":
            return `${name} is not part of the document loaded in this viewer.`;
        case "unknown-net":
            return `${name} could not be found in the loaded revision.`;
        case "ambiguous-occurrence":
            return `${name} appears in more than one sheet occurrence and cannot be resolved to one.`;
        case "unsupported-context":
            return `${name} cannot be highlighted in this view.`;
    }
}

/**
 * Build a viewer request for one intent. The request's revision and document
 * are the reference's own: a host ref is only valid inside the revision the
 * viewer loaded it from.
 */
export function highlightRequestForRef(
    ref: ScopedNetRef,
    operation: "add" | "toggle" | "remove",
    requestId: string,
): {
    revisionKey: string;
    documentKey: string;
    operation: "add" | "toggle" | "remove";
    nets: readonly ScopedNetRef[];
    origin: string;
    requestId: string;
} {
    return {
        revisionKey: ref.revisionKey,
        documentKey: ref.documentKey,
        operation,
        nets: [ref],
        origin: REVIEW_HIGHLIGHT_ORIGIN,
        requestId,
    };
}

// ---------------------------------------------------------------------------
// Mapping: viewer selection detail -> revision-scoped ScopedNetRef.
// ---------------------------------------------------------------------------

export interface HighlightMappingInput {
    context: HighlightContext;
    detail: EcadSemanticSelectionDetail;
    /** Normalized Prism selection for the same gesture, when it mapped. */
    selection?: PrismSelection | null;
    semanticIndex?: PrismSemanticIndex | null;
    /** Element revision key (`replaceSources` revisionKey) for this viewer. */
    revisionKey: string | null;
    /** Exact filenames loaded into the viewer. */
    documentKeys?: readonly string[];
}

export type HighlightMappingResult =
    | { ok: true; ref: ScopedNetRef }
    | {
          ok: false;
          reason: HighlightUnresolvedReason;
          message: string;
          label: string;
      };

const NON_NET_ITEM_TYPES = new Set([
    "footprint",
    "symbol",
    "sheet",
    "wire",
    "junction",
    "no-connect",
    // A schematic pin detail names its parent symbol and number, not a net.
    "pin",
]);

function isSchematicDocument(value: string | undefined): value is string {
    return Boolean(value && /\.kicad_sch$/i.test(value));
}

function isBoardDocument(value: string | undefined): value is string {
    return Boolean(value && /\.kicad_pcb$/i.test(value));
}

/**
 * Split an ecad-viewer project path (`filename:sheet_path`) or a bare
 * schematic filename into its document and occurrence parts. A project path
 * without a leading `/` occurrence is treated as a bare filename; anything
 * else is not a document identity.
 */
export function parseSchematicProjectPath(value: string): {
    documentKey: string | null;
    occurrencePath?: string;
} {
    const trimmed = value.trim();
    if (!trimmed) return { documentKey: null };
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
        const documentKey = trimmed.slice(0, colon);
        const suffix = trimmed.slice(colon + 1);
        if (isSchematicDocument(documentKey) && suffix.startsWith("/")) {
            return { documentKey, occurrencePath: suffix };
        }
        return { documentKey: isSchematicDocument(documentKey) ? documentKey : null };
    }
    return { documentKey: isSchematicDocument(trimmed) ? trimmed : null };
}

function selectionNetName(selection: PrismSelection | null | undefined): string | undefined {
    return selection && selection.kind !== "component" ? selection.netName : undefined;
}

function selectionNetCode(selection: PrismSelection | null | undefined): number | undefined {
    return selection && selection.kind !== "component" ? selection.netCode : undefined;
}

function semanticNetForSelection(
    selection: PrismSelection | null | undefined,
    semanticIndex: PrismSemanticIndex | null | undefined,
): { schematicRefs?: SemanticSchematicRef[] } | undefined {
    if (!selection || selection.kind === "component" || !semanticIndex) return undefined;
    if (selection.netUid) {
        const byUid = semanticIndex.nets.find(
            (net) => net.netUid === selection.netUid,
        );
        if (byUid) return byUid;
    }
    const name = selection.netName;
    if (!name) return undefined;
    const index = semanticIndex.indexes.netByName?.[name];
    return index === undefined ? undefined : semanticIndex.nets[index];
}

interface SchematicIdentity {
    documentKey: string;
    occurrencePath?: string;
}

function identitiesFromSemanticRefs(
    refs: readonly SemanticSchematicRef[] | undefined,
): SchematicIdentity[] {
    if (!refs?.length) return [];
    const identities: SchematicIdentity[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
        const hint = schematicPageHint(ref);
        const parsed = hint ? parseSchematicProjectPath(hint) : { documentKey: null as string | null };
        if (!parsed.documentKey) continue;
        const key = `${parsed.documentKey}\u0000${parsed.occurrencePath ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        identities.push({
            documentKey: parsed.documentKey,
            occurrencePath: parsed.occurrencePath,
        });
    }
    return identities;
}

function mappingFailure(
    reason: HighlightUnresolvedReason,
    message: string,
    label: string,
): HighlightMappingResult {
    return { ok: false, reason, message, label };
}

/** Mapping input whose revision key was validated as present. */
type ScopedMappingInput = HighlightMappingInput & { revisionKey: string };

function mapPcbSelection(input: ScopedMappingInput): HighlightMappingResult {
    const { detail, selection, revisionKey, documentKeys } = input;
    const netKey = (selectionNetName(selection) || detail.net || "").trim();
    if (!netKey) {
        if (NON_NET_ITEM_TYPES.has(detail.itemType)) {
            return mappingFailure(
                "unsupported-context",
                "Shift-click a track, pad, via, or zone to add its net to the highlight set.",
                detail.itemType,
            );
        }
        return mappingFailure(
            "unknown-net",
            "This board selection does not name a net to highlight.",
            detail.itemType,
        );
    }
    const candidates = [detail.page, detail.filename, selection?.anchor?.page];
    const named = candidates.find(isBoardDocument);
    const loadedBoards = (documentKeys ?? []).filter(isBoardDocument);
    const documentKey = named
        ?? (loadedBoards.length === 1 ? loadedBoards[0]! : undefined);
    if (!documentKey) {
        return mappingFailure(
            "document-mismatch",
            `The board document for this selection is not loaded (${detail.page || "unknown document"}).`,
            netKey,
        );
    }
    if (documentKeys?.length && !documentKeys.includes(documentKey)) {
        return mappingFailure(
            "document-mismatch",
            `The board document "${documentKey}" is not loaded in this viewer.`,
            netKey,
        );
    }
    return {
        ok: true,
        ref: {
            revisionKey,
            documentKey,
            context: "PCB",
            netKey,
            netCode: detail.netCode ?? selectionNetCode(selection),
        },
    };
}

function mapSchematicSelection(input: ScopedMappingInput): HighlightMappingResult {
    const { detail, selection, semanticIndex, revisionKey, documentKeys } = input;
    const netKey = (selectionNetName(selection) || detail.net || "").trim();
    if (!netKey) {
        if (NON_NET_ITEM_TYPES.has(detail.itemType)) {
            return mappingFailure(
                "unsupported-context",
                "Shift-click a schematic net label to add it to the highlight set.",
                detail.itemType,
            );
        }
        return mappingFailure(
            "unknown-net",
            "This schematic selection does not name a net to highlight.",
            detail.itemType,
        );
    }

    const semanticNet = semanticNetForSelection(selection, semanticIndex);
    const semanticIdentities = identitiesFromSemanticRefs(semanticNet?.schematicRefs);

    const rawPage = detail.page || detail.sheet
        || selection?.anchor?.page || selection?.anchor?.sheet;
    let documentKey: string | null = null;
    let occurrencePath: string | undefined;
    if (rawPage) {
        const parsed = parseSchematicProjectPath(rawPage);
        documentKey = parsed.documentKey;
        occurrencePath = parsed.occurrencePath;
    }

    if (!documentKey) {
        if (semanticIdentities.length > 1) {
            return mappingFailure(
                "ambiguous-occurrence",
                `"${netKey}" appears in more than one schematic occurrence and cannot be resolved to one.`,
                netKey,
            );
        }
        const identity = semanticIdentities[0];
        if (identity) {
            documentKey = identity.documentKey;
            occurrencePath = identity.occurrencePath;
        }
    }

    if (!documentKey) {
        return mappingFailure(
            "document-mismatch",
            `"${netKey}" is not attached to a schematic document loaded in this viewer.`,
            netKey,
        );
    }
    if (documentKeys?.length && !documentKeys.includes(documentKey)) {
        return mappingFailure(
            "document-mismatch",
            `The schematic document "${documentKey}" is not loaded in this viewer.`,
            netKey,
        );
    }

    if (!occurrencePath && semanticIdentities.length > 0) {
        const forDocument = semanticIdentities.filter(
            (identity) => identity.documentKey === documentKey,
        );
        if (forDocument.length > 1) {
            return mappingFailure(
                "ambiguous-occurrence",
                `"${documentKey}" is instantiated more than once; "${netKey}" cannot be resolved to one occurrence.`,
                netKey,
            );
        }
        if (forDocument.length === 1) {
            occurrencePath = forDocument[0]!.occurrencePath;
        }
    }

    return {
        ok: true,
        ref: {
            revisionKey,
            documentKey,
            context: "SCH",
            netKey,
            occurrencePath,
        },
    };
}

/**
 * Turn one viewer selection gesture into the exact reference the viewer needs.
 * Anything incomplete is an explicit unresolved result with a reason a
 * reviewer can read; Prism never guesses a document or an occurrence.
 */
export function mapSelectionToHighlightRef(
    input: HighlightMappingInput,
): HighlightMappingResult {
    const revisionKey = input.revisionKey;
    if (!revisionKey) {
        return mappingFailure(
            "revision-mismatch",
            "The viewer has not loaded a revision yet.",
            input.detail.net || input.detail.itemType,
        );
    }
    const scoped: ScopedMappingInput = { ...input, revisionKey };
    return input.context === "PCB"
        ? mapPcbSelection(scoped)
        : mapSchematicSelection(scoped);
}

// ---------------------------------------------------------------------------
// Reducer: collection, notices, revision pruning, echo suppression.
// ---------------------------------------------------------------------------

export type ReviewHighlightAction =
    | {
          type: "intent";
          ref: ScopedNetRef;
          intent: HighlightIntent;
          requestId: string;
      }
    | { type: "remove"; ref: ScopedNetRef; requestId: string }
    | { type: "clear" }
    | { type: "issued"; requestId: string }
    | { type: "notice"; notice: HighlightNotice }
    | { type: "viewer-change"; context: HighlightContext; detail: HighlightChangeDetail }
    | {
          type: "revision";
          revisionKeys: Readonly<Record<HighlightContext, string | null>>;
      };

function recordRequestId(
    issued: readonly string[],
    requestId: string,
): string[] {
    if (!requestId) return [...issued];
    const next = [...issued.filter((id) => id !== requestId), requestId];
    return next.length > ISSUED_REQUEST_ID_LIMIT
        ? next.slice(next.length - ISSUED_REQUEST_ID_LIMIT)
        : next;
}

function withoutNotice(
    notices: readonly HighlightNotice[],
    key: string,
): HighlightNotice[] {
    return notices.filter((notice) => notice.key !== key);
}

function withNotice(
    notices: readonly HighlightNotice[],
    notice: HighlightNotice,
): HighlightNotice[] {
    return [...withoutNotice(notices, notice.key), notice];
}

/**
 * Whether a `highlight-change` event is the element echoing a request Prism
 * just issued. Echoes must not be re-applied as user actions.
 */
export function shouldIgnoreHighlightEcho(
    state: ReviewHighlightState,
    detail: HighlightChangeDetail,
): boolean {
    return (
        detail.origin === REVIEW_HIGHLIGHT_ORIGIN
        && Boolean(detail.requestId)
        && state.issuedRequestIds.includes(detail.requestId)
    );
}

/** Replace the host collection for one context with the viewer's effective set. */
function adoptViewerSet(
    state: ReviewHighlightState,
    context: HighlightContext,
    detail: HighlightChangeDetail,
): ReviewHighlightState {
    const others = state.refs.filter((ref) => ref.context !== context);
    const refs = dedupeHighlightRefs([...others, ...detail.nets]);
    return {
        ...state,
        refs,
        revisionKeys: { ...state.revisionKeys, [context]: detail.revisionKey },
    };
}

export function reviewHighlightReducer(
    state: ReviewHighlightState,
    action: ReviewHighlightAction,
): ReviewHighlightState {
    switch (action.type) {
        case "intent": {
            const refs = applyHighlightIntent(state.refs, action.ref, action.intent);
            return {
                ...state,
                refs,
                notices: withoutNotice(state.notices, highlightRefKey(action.ref)),
                issuedRequestIds: recordRequestId(state.issuedRequestIds, action.requestId),
                revisionKeys: {
                    ...state.revisionKeys,
                    [action.ref.context]: action.ref.revisionKey,
                },
            };
        }
        case "remove": {
            const refs = removeHighlightRef(state.refs, action.ref);
            return {
                ...state,
                refs,
                notices: withoutNotice(state.notices, highlightRefKey(action.ref)),
                issuedRequestIds: recordRequestId(state.issuedRequestIds, action.requestId),
            };
        }
        case "clear":
            return {
                ...state,
                refs: [],
                notices: [],
            };
        case "issued":
            // A host request that does not mutate the collection (a
            // re-projection after clearSelection): remember its id so the
            // element's echo is ignored like any other host request.
            return {
                ...state,
                issuedRequestIds: recordRequestId(state.issuedRequestIds, action.requestId),
            };
        case "notice":
            return {
                ...state,
                // A ref the viewer rejected is not a member of the set.
                refs: action.notice.ref
                    ? removeHighlightRef(state.refs, action.notice.ref)
                    : state.refs,
                notices: withNotice(state.notices, action.notice),
            };
        case "viewer-change": {
            if (shouldIgnoreHighlightEcho(state, action.detail)) return state;
            if (action.detail.cause === "revision-reset") {
                return {
                    ...state,
                    refs: state.refs.filter(
                        (ref) => ref.context !== action.context,
                    ),
                    notices: [],
                    issuedRequestIds: [],
                };
            }
            return adoptViewerSet(state, action.context, action.detail);
        }
        case "revision": {
            const keysChanged =
                state.revisionKeys.PCB !== action.revisionKeys.PCB
                || state.revisionKeys.SCH !== action.revisionKeys.SCH;
            const refs = state.refs.filter(
                (ref) => ref.revisionKey === action.revisionKeys[ref.context],
            );
            if (!keysChanged && refs.length === state.refs.length) return state;
            return {
                ...state,
                refs,
                // A rejection from the previous revision says nothing about
                // this one; stale notices must not survive the switch.
                notices: [],
                revisionKeys: action.revisionKeys,
            };
        }
    }
}

/** A notice for a mapping failure that never reached a viewer. */
export function noticeForMappingFailure(
    result: Extract<HighlightMappingResult, { ok: false }>,
): HighlightNotice {
    return {
        key: `unmapped\u0000${result.reason}\u0000${result.label}`,
        label: result.label,
        reason: result.reason,
        message: result.message,
    };
}

/** A notice for a viewer-reported unresolved reference. */
export function noticeForViewerUnresolved(
    entry: { ref: ScopedNetRef; reason: HighlightUnresolvedReason },
): HighlightNotice {
    return noticeForUnresolved(entry);
}
