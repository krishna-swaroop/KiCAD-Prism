import { describe, expect, it } from "vitest";

import { partitionViewerSources } from "./visualizer";

/**
 * Which sources go in the first batch.
 *
 * The viewer resolves text variables while painting, so a `.kicad_pro` that
 * arrives after the document it belongs to forces a full repaint of the scene
 * -- roughly two seconds on a large board. The split used to be positional
 * (`sources[0]` first, everything else appended), which put the project file
 * in the append batch on every board open even though it had already been
 * fetched.
 */

const src = (filename: string) => ({ filename, content: "" });

describe("partitionViewerSources", () => {
    it("keeps the project file in the first batch", () => {
        const { rootBatch, appended } = partitionViewerSources([
            src("board.kicad_pcb"),
            src("board.kicad_pro"),
        ]);

        expect(rootBatch.map((s) => s.filename)).to.deep.equal([
            "board.kicad_pcb",
            "board.kicad_pro",
        ]);
        expect(appended).to.deep.equal([]);
    });

    it("still appends everything else", () => {
        // Subsheets are the reason the append path exists: they are numerous,
        // and loading them up front is what the first batch is meant to avoid.
        const { rootBatch, appended } = partitionViewerSources([
            src("root.kicad_sch"),
            src("root.kicad_pro"),
            src("sub1.kicad_sch"),
            src("sub2.kicad_sch"),
        ]);

        expect(rootBatch.map((s) => s.filename)).to.deep.equal([
            "root.kicad_sch",
            "root.kicad_pro",
        ]);
        expect(appended.map((s) => s.filename)).to.deep.equal([
            "sub1.kicad_sch",
            "sub2.kicad_sch",
        ]);
    });

    it("leaves the root alone when no project file is present", () => {
        const { rootBatch, appended } = partitionViewerSources([
            src("board.kicad_pcb"),
            src("sub.kicad_sch"),
        ]);

        expect(rootBatch.map((s) => s.filename)).to.deep.equal([
            "board.kicad_pcb",
        ]);
        expect(appended.map((s) => s.filename)).to.deep.equal(["sub.kicad_sch"]);
    });

    it("never promotes a project file into the root slot", () => {
        // The first entry is the document to draw. A project file arriving
        // first would mean there is nothing to draw, and must not be treated
        // as the root document.
        const { rootBatch } = partitionViewerSources([src("board.kicad_pro")]);

        expect(rootBatch.map((s) => s.filename)).to.deep.equal([
            "board.kicad_pro",
        ]);
    });

    it("handles an empty list", () => {
        expect(partitionViewerSources([])).to.deep.equal({
            rootBatch: [],
            appended: [],
        });
    });
});
