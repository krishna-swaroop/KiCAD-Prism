import * as api from "../api";
import type { SetupRecord, SimSetup } from "../types";

import { BoardIndex } from "./board-index";
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

const boards = new Map<string, Promise<BoardIndex>>();

/** The board's pads and parts at a commit, fetched once per page. */
export function boardIndex(projectId: string, commit?: string): Promise<BoardIndex> {
    const key = `${projectId}@${commit ?? ""}`;
    let board = boards.get(key);
    if (!board) {
        board = api.readSemanticIndex(projectId, commit).then((index) => new BoardIndex(index));
        board.catch(() => boards.delete(key));
        boards.set(key, board);
    }
    return board;
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
