import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
    editHistoryReducer,
    emptyEditHistory,
    useEditHistory,
    type EditHistoryState,
} from "./use-edit-history";
import type { RowEdits } from "./library-import-remediation-grid";

/**
 * Characterization tests for the remediation-grid edit history. These pin the
 * behavior contract the old nested-setState implementation provided before it
 * was replaced with a pure reducer:
 * - commit snapshots prior edits onto undo (capped at 50) and clears redo
 * - undo/redo are symmetric no-ops on empty stacks
 * - replaceEdits rewrites edits without touching history
 * - reset wipes everything
 */

const setField = (value: string) => (current: RowEdits): RowEdits => ({
    ...current,
    R1: { metadata: { ...current.R1?.metadata, package_name: value } },
});

afterEach(() => {
    cleanup();
});

describe("editHistoryReducer", () => {
    it("commit applies the update and pushes prior edits onto the undo stack", () => {
        const base: EditHistoryState = { ...emptyEditHistory, edits: { R0: { metadata: {} } } };
        const next = editHistoryReducer(base, { type: "commit", update: setField("v1") });

        expect(Object.keys(next.edits)).toContain("R1");
        expect(next.undoStack).toEqual([base.edits]);
        expect(next.redoStack).toEqual([]);
    });

    it("a no-op commit returns the same state object", () => {
        const base: EditHistoryState = { ...emptyEditHistory, edits: { R1: { metadata: {} } } };
        const next = editHistoryReducer(base, { type: "commit", update: (current) => current });

        expect(next).toBe(base);
    });

    it("undo and redo round-trip the exact previous snapshot", () => {
        const first = editHistoryReducer(emptyEditHistory, { type: "commit", update: setField("v1") });
        const second = editHistoryReducer(first, { type: "commit", update: setField("v2") });

        const undone = editHistoryReducer(second, { type: "undo" });
        expect(undone.edits).toBe(first.edits);
        expect(undone.redoStack).toEqual([second.edits]);

        const redone = editHistoryReducer(undone, { type: "redo" });
        expect(redone.edits).toBe(second.edits);
        // Redo pushes the undone edits back, so the stack matches the state
        // before the undo rather than shrinking to `first.undoStack`.
        expect(redone.undoStack).toEqual(second.undoStack);
        expect(redone.redoStack).toEqual([]);
    });

    it("undo on an empty stack is a no-op", () => {
        expect(editHistoryReducer(emptyEditHistory, { type: "undo" })).toBe(emptyEditHistory);
        expect(editHistoryReducer(emptyEditHistory, { type: "redo" })).toBe(emptyEditHistory);
    });

    it("caps the undo stack at 50 entries", () => {
        let current = emptyEditHistory;
        for (let index = 0; index < 60; index += 1) {
            current = editHistoryReducer(current, { type: "commit", update: setField(`v${index}`) });
        }
        expect(current.undoStack.length).toBe(50);
    });

    it("replaceEdits rewrites edits without touching history", () => {
        const committed = editHistoryReducer(emptyEditHistory, { type: "commit", update: setField("v1") });
        const pruned = editHistoryReducer(committed, {
            type: "replace",
            update: (current) => {
                const next = { ...current };
                delete next.R1;
                return next;
            },
        });

        expect(pruned.edits).toEqual({});
        // History still holds the pre-prune snapshot, exactly as the original
        // implementation did when accepted rows dropped out of the grid.
        expect(pruned.undoStack).toEqual(committed.undoStack);
        expect(pruned.redoStack).toEqual([]);
    });

    it("reset wipes edits and both stacks", () => {
        const committed = editHistoryReducer(emptyEditHistory, { type: "commit", update: setField("v1") });
        expect(editHistoryReducer(committed, { type: "reset" })).toBe(emptyEditHistory);
    });
});

describe("useEditHistory under StrictMode", () => {
    // The original implementation performed history bookkeeping inside state
    // updater callbacks. StrictMode invokes updaters twice in development,
    // which would push duplicate undo entries; the reducer makes that hazard
    // unreachable by construction.
    it("one commit produces exactly one undo entry", () => {
        const { result } = renderHook(() => useEditHistory(), { wrapper: StrictMode });

        act(() => result.current.commitEdits(setField("v1")));
        act(() => result.current.commitEdits(setField("v2")));

        expect(result.current.undoStack.length).toBe(2);
        expect(result.current.edits.R1.metadata.package_name).toBe("v2");

        act(() => result.current.undo());
        expect(result.current.edits.R1.metadata.package_name).toBe("v1");

        act(() => result.current.redo());
        expect(result.current.edits.R1.metadata.package_name).toBe("v2");
    });
});
