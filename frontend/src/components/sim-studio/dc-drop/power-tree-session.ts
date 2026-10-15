import * as api from "../api";
import type { PrismSemanticIndex } from "@/types/prism-selection";

import type { SetupRecord, SimSetup } from "../types";

import { BoardIndex } from "./board-index";
import { NO_CANDIDATES, type Candidates } from "./candidates";
import { asLayout, autoArrange, emptyLayout, mergeInferred, type CanvasLayout, type TreeState } from "./power-tree-model";
import { withSetting } from "./settings";

export type StudioTab = "setup" | "results";

/**
 * Reads and writes one setup's power tree: the setup document (guarded by its
 * ETag) and the canvas layout beside it. Only what changed is written, so
 * moving a node never bumps the setup's revision.
 */

export interface TreeRecord {
    record: SetupRecord;
    layout: CanvasLayout;
}

export async function loadTree(projectId: string, setupId: string): Promise<TreeRecord> {
    const [record, layout] = await Promise.all([api.readSetup(projectId, setupId), api.readLayout(projectId, setupId)]);
    return { record, layout: asLayout(layout) };
}

export async function saveTree(projectId: string, current: TreeRecord, next: TreeState): Promise<TreeRecord> {
    const setupId = current.record.setup_id;
    const setupChanged = JSON.stringify(next.setup) !== JSON.stringify(current.record.setup);
    const layoutChanged = JSON.stringify(next.layout) !== JSON.stringify(current.layout);
    const record = setupChanged
        ? await api.replaceSetup(projectId, setupId, current.record.etag, next.setup)
        : current.record;
    if (layoutChanged) await api.writeLayout(projectId, setupId, next.layout);
    return { record, layout: next.layout };
}

const indexes = new Map<string, Promise<PrismSemanticIndex>>();

/** The board's design index at a commit (about 4 MB on large boards), fetched once per page for every user. */
export function semanticIndexFor(projectId: string, commit?: string): Promise<PrismSemanticIndex> {
    const key = `${projectId}@${commit ?? ""}`;
    let index = indexes.get(key);
    if (!index) {
        index = api.readSemanticIndex(projectId, commit);
        index.catch(() => indexes.delete(key));
        indexes.set(key, index);
    }
    return index;
}

const boards = new Map<string, Promise<BoardIndex>>();

/** The board's pads and parts at a commit, fetched once per page. */
export function boardIndex(projectId: string, commit?: string): Promise<BoardIndex> {
    const key = `${projectId}@${commit ?? ""}`;
    let board = boards.get(key);
    if (!board) {
        board = semanticIndexFor(projectId, commit).then((index) => new BoardIndex(index));
        board.catch(() => boards.delete(key));
        boards.set(key, board);
    }
    return board;
}

const offers = new Map<string, Promise<Candidates>>();

/** What the canvas offers per element kind for a revision (the power-tree candidates), fetched once a page. */
export function candidatesFor(projectId: string, commit?: string): Promise<Candidates> {
    const key = `${projectId}@${commit ?? ""}`;
    let found = offers.get(key);
    if (!found) {
        found = api.readPowerTree(projectId, commit).then((tree) => tree.candidates ?? NO_CANDIDATES);
        found.catch(() => offers.delete(key));
        offers.set(key, found);
    }
    return found;
}

/** A new setup as the canvas expects one: adaptive mesh on, and blank or the inferred tree. */
export async function createSetup(projectId: string, name: string, seed: "inferred" | "blank", commit?: string): Promise<TreeRecord> {
    const record = await api.draftSetup(projectId, "dc-drop", name, commit);
    let setup: SimSetup = withSetting(record.setup, "mesh", "adaptive", true);
    let state: TreeState = { setup, layout: emptyLayout() };
    if (seed === "inferred") {
        state = autoArrange(mergeInferred(state, await api.readPowerTree(projectId, commit), "replace"));
    } else {
        setup = { ...setup, rails: [], analyses: setup.analyses.map((analysis) => ({ ...analysis, rails: [] })) };
        state = { setup, layout: emptyLayout() };
    }
    return saveTree(projectId, { record, layout: emptyLayout() }, state);
}
