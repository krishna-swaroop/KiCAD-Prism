import { useCallback, useReducer } from "react";

import type { RowEdits } from "./library-import-remediation-grid";

/**
 * Edit history for the import remediation grid: the pending edits plus the
 * undo/redo stacks, moved through one pure reducer so a single dispatch
 * transitions all three coherently. The previous implementation nested
 * setState calls inside updater callbacks, which React may invoke more than
 * once — duplicating history entries under StrictMode.
 *
 * Behavior contract (preserved from the original implementation):
 * - commit pushes the prior edits onto the undo stack (capped at 50) and
 *   clears the redo stack; a no-op commit changes nothing.
 * - undo/redo swap the top of one stack with the current edits and are
 *   no-ops on empty stacks.
 * - replaceEdits rewrites the edits WITHOUT touching history (used when
 *   accepted rows drop out of the pending set).
 * - reset wipes edits and both stacks (used after saving drafts).
 */

export interface EditHistoryState {
    edits: RowEdits;
    undoStack: RowEdits[];
    redoStack: RowEdits[];
}

export type EditHistoryAction =
    | { type: "commit"; update: (current: RowEdits) => RowEdits }
    | { type: "replace"; update: (current: RowEdits) => RowEdits }
    | { type: "reset" }
    | { type: "undo" }
    | { type: "redo" };

const EDIT_HISTORY_LIMIT = 50;

export const emptyEditHistory: EditHistoryState = {
    edits: {},
    undoStack: [],
    redoStack: [],
};

export function editHistoryReducer(
    state: EditHistoryState,
    action: EditHistoryAction,
): EditHistoryState {
    switch (action.type) {
        case "commit": {
            const next = action.update(state.edits);
            if (next === state.edits) return state;
            return {
                edits: next,
                undoStack: [
                    ...state.undoStack.slice(-(EDIT_HISTORY_LIMIT - 1)),
                    state.edits,
                ],
                redoStack: [],
            };
        }
        case "replace": {
            const next = action.update(state.edits);
            return next === state.edits ? state : { ...state, edits: next };
        }
        case "reset":
            return state === emptyEditHistory ? state : emptyEditHistory;
        case "undo": {
            const previous = state.undoStack[state.undoStack.length - 1];
            if (!previous) return state;
            return {
                edits: previous,
                undoStack: state.undoStack.slice(0, -1),
                redoStack: [...state.redoStack, state.edits],
            };
        }
        case "redo": {
            const next = state.redoStack[state.redoStack.length - 1];
            if (!next) return state;
            return {
                edits: next,
                undoStack: [...state.undoStack, state.edits],
                redoStack: state.redoStack.slice(0, -1),
            };
        }
    }
}

export function useEditHistory() {
    const [state, dispatch] = useReducer(editHistoryReducer, emptyEditHistory);

    const commitEdits = useCallback(
        (update: (current: RowEdits) => RowEdits) =>
            dispatch({ type: "commit", update }),
        [],
    );
    const replaceEdits = useCallback(
        (update: (current: RowEdits) => RowEdits) =>
            dispatch({ type: "replace", update }),
        [],
    );
    const resetHistory = useCallback(() => dispatch({ type: "reset" }), []);
    const undo = useCallback(() => dispatch({ type: "undo" }), []);
    const redo = useCallback(() => dispatch({ type: "redo" }), []);

    return { ...state, commitEdits, replaceEdits, resetHistory, undo, redo };
}
