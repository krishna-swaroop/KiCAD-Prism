import { describe, expect, it } from "vitest";
import { filterBomRows } from "./bom-panel";
import {
    applyOpenComparisonParams,
    applyWorkspaceComparisonParams,
    clearComparisonParams,
    readComparisonUrlState,
} from "./comparison-url";
import {
    readInitialUrlState,
} from "./design-comparison-workspace";
import { groupChanges } from "./comparison-review-groups";
import { resolveNativeSelection } from "./comparison-selection-bridge";
import {
    resolveSelectedDocument,
    resolveSideBySideFocus,
    revisionSourceKey,
    selectedChanges,
    sourceNameForDomain,
} from "./revision-sources";
import type {
    ChangeItem,
    BomDiff,
    KiCadProjectDiffBundle,
} from "./types";
import type { EcadDocumentComparisonPreparation } from "@/types/ecad-viewer";
import type { Comment } from "@/types/comments";

const change = (
    id: string,
    kind: ChangeItem["kind"],
    source: string,
): ChangeItem => ({
    id,
    kind,
    domain: "pcb",
    category: "components",
    classification: "primary",
    label: "U1",
    reference: "U1",
    semantic_id: "cmp:u1",
    source_id_base: kind === "added" ? null : source,
    source_id_compare: kind === "removed" ? null : source,
});

describe("semantic comparison state", () => {
    it("defensively groups connectivity records under Nets", () => {
        const groups = groupChanges([{
            ...change("net-change", "changed", "pin-1"),
            domain: "schematic",
            category: "components",
            reference: null,
            net: "/USB/USB_D_P",
            label: "/USB/USB_D_P",
            semantic_id: "net:usb-d-p",
            reasons: ["connectivity-changed"],
        }]);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.category).toBe("nets");
    });

    it("keeps net-bound zones independently grouped under Zones", () => {
        const groups = groupChanges([{
            ...change("zone-change", "changed", "zone-1"),
            category: "zones",
            object_kind: "zone",
            net: "GND",
            semantic_id: "obj:zone-1",
        }]);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.category).toBe("zones");
    });

    it("defensively treats KiCad power symbols as electrical changes", () => {
        const groups = groupChanges([{
            ...change("power-change", "changed", "power-1"),
            domain: "schematic",
            reference: "#PWR0118",
            label: "#PWR0118",
            object_kind: "symbol",
        }]);

        expect(groups[0]?.category).toBe("nets");
    });

    it("hydrates the shareable semantic URL state", () => {
        expect(readInitialUrlState(
            "?diff=pcb&item=track-1&secondary=1&layers=F.Cu,B.Cu",
        )).toEqual({
            activeTab: "pcb",
            presentationOverride: null,
            selectedChangeId: "track-1",
            showSecondary: true,
            layers: ["F.Cu", "B.Cu"],
        });
    });

    it("hydrates side-by-side presentation from the URL", () => {
        expect(readInitialUrlState(
            "?diff=sch&presentation=side-by-side&item=wire-1",
        )).toEqual({
            activeTab: "sch",
            presentationOverride: "side-by-side",
            selectedChangeId: "wire-1",
            showSecondary: false,
            layers: [],
        });
    });

    it("distinguishes automatic presentation from an explicit Composite override", () => {
        // No parameter means "follow the selected change", which is what a
        // shared link should do. An explicit `composite` is a reviewer's
        // decision and has to survive the round trip as one.
        expect(readComparisonUrlState("?diff=pcb").presentationOverride)
            .toBeNull();
        expect(readComparisonUrlState("?diff=pcb&presentation=auto")
            .presentationOverride).toBeNull();
        expect(
            readComparisonUrlState("?diff=pcb&presentation=composite"),
        ).toMatchObject({ presentationOverride: "composite" });

        const automatic = applyWorkspaceComparisonParams(
            new URLSearchParams(),
            {
                base: "aaa",
                compare: "bbb",
                activeTab: "pcb",
                presentationOverride: null,
                selectedChangeId: "via-1",
                showSecondary: false,
                visibleLayers: [],
            },
        );
        expect(automatic.get("presentation")).toBeNull();

        const manual = applyWorkspaceComparisonParams(
            automatic,
            {
                base: "aaa",
                compare: "bbb",
                activeTab: "pcb",
                presentationOverride: "composite",
                selectedChangeId: "via-1",
                showSecondary: false,
                visibleLayers: [],
            },
        );
        expect(manual.get("presentation")).toBe("composite");
    });

    it("opens and clears comparison params without dropping unrelated keys", () => {
        const opened = applyOpenComparisonParams(
            new URLSearchParams("branch=main&section=overview"),
            { base: "aaa", compare: "bbb", diff: "pcb" },
        );
        expect(opened.get("section")).toBe("history");
        expect(opened.get("branch")).toBe("main");
        expect(opened.get("base")).toBe("aaa");
        expect(opened.get("compare")).toBe("bbb");
        expect(opened.get("view")).toBe("semantic");
        expect(opened.get("diff")).toBe("pcb");

        const cleared = clearComparisonParams(opened);
        expect(cleared.get("section")).toBe("history");
        expect(cleared.get("branch")).toBe("main");
        expect(cleared.get("base")).toBeNull();
        expect(cleared.get("compare")).toBeNull();
        expect(cleared.get("view")).toBeNull();
        expect(readComparisonUrlState(cleared).base).toBeNull();
    });

    it("keeps PCB and schematic snapshots distinct at the same revision", () => {
        expect(revisionSourceKey("project", "abc123", "pcb")).toBe(
            "project:abc123:pcb",
        );
        expect(revisionSourceKey("project", "abc123", "schematic")).toBe(
            "project:abc123:schematic",
        );
    });

    it("resolves root sources and expands item or group selections", () => {
        const files = [
            { filename: "main.kicad_pro", path: "main.kicad_pro" },
            { filename: "main.kicad_sch", path: "main.kicad_sch" },
        ];
        expect(sourceNameForDomain("schematic", files)).toBe(
            "main.kicad_sch",
        );

        const first = change("first", "changed", "uuid-1");
        const second = change("second", "added", "uuid-2");
        const groups = [{ id: "group", changes: [first, second] }];
        expect(selectedChanges({ kind: "item", id: "second" }, groups))
            .toEqual([second]);
        expect(selectedChanges({ kind: "group", id: "group" }, groups))
            .toEqual([first, second]);
    });

    it("deduplicates members into one stable semantic group and counts open threads", () => {
        const comments = [{
            id: "c1",
            status: "OPEN",
            semanticItemId: "pcb:components:cmp:u1",
        }] as Comment[];
        const groups = groupChanges(
            [change("semantic", "changed", "uuid-1"), change("geometry", "changed", "uuid-1")],
            comments,
        );
        expect(groups).toHaveLength(1);
        expect(groups[0]?.id).toBe("pcb:components:cmp:u1");
        expect(groups[0]?.changes).toHaveLength(2);
        expect(groups[0]?.unresolvedCount).toBe(1);
    });

    it("resolves a selected Prism row to its native document and target", () => {
        const bundle: KiCadProjectDiffBundle = {
            schema: "prism.kicad_project_diff_v1",
            provider: "prism-semantic",
            project: {
                documents: [
                    {
                        path: "processor.kicad_sch",
                        docType: "kicad_sch",
                        changes: [],
                    },
                ],
            },
            navigation: {
                first: {
                    documentPath: "processor.kicad_sch",
                    changeId: "/uuid-1",
                },
                second: {
                    documentPath: "processor.kicad_sch",
                    changeId: "/uuid-2",
                },
            },
            diagnostics: [],
        };
        const changes = [
            { ...change("first", "changed", "uuid-1"), domain: "schematic" as const },
            { ...change("second", "changed", "uuid-2"), domain: "schematic" as const },
        ];
        const targets = new Map([
            [
                "group:net:modified:VCC",
                {
                    id: "net:modified:VCC",
                    kind: "group" as const,
                    category: "modified" as const,
                    label: "VCC",
                    memberIds: ["/uuid-1", "/uuid-2"],
                    sourceIds: ["uuid-1", "uuid-2"],
                    bounds: [10, 10, 14, 11] as [number, number, number, number],
                    sourceSide: "comparison" as const,
                    routing: false,
                    overlayLines: [],
                },
            ],
        ]);
        const preparation: EcadDocumentComparisonPreparation = {
            comparisonKey: "comparison",
            context: "SCH",
            document: bundle.project.documents[0]!,
            targets,
            diagnostics: [],
            prepareMs: 10,
            sourceCacheHit: false,
        };

        expect(resolveSelectedDocument("schematic", bundle, changes)?.path)
            .toBe("processor.kicad_sch");
        expect(resolveNativeSelection(
            preparation,
            bundle,
            { kind: "group", id: "processor-group" },
            changes,
        )).toEqual({
            kind: "changes",
            ids: ["/uuid-1", "/uuid-2"],
        });
    });

    it("resolves an explicit page child for a multi-page logical change", () => {
        const bundle: KiCadProjectDiffBundle = {
            schema: "prism.kicad_project_diff_v1",
            provider: "prism-semantic",
            project: {
                documents: [
                    { path: "one.kicad_sch", docType: "kicad_sch", changes: [] },
                    { path: "two.kicad_sch", docType: "kicad_sch", changes: [] },
                ],
            },
            navigation: {
                first: {
                    documentPath: "one.kicad_sch",
                    changeId: "/wire-one",
                    changeIds: ["/wire-one"],
                    documents: [
                        {
                            documentPath: "one.kicad_sch",
                            changeId: "/wire-one",
                            changeIds: ["/wire-one"],
                        },
                        {
                            documentPath: "two.kicad_sch",
                            changeId: "/wire-two",
                            changeIds: ["/wire-two"],
                        },
                    ],
                },
            },
            diagnostics: [],
        };
        const changes = [{
            ...change("first", "changed", "wire-one"),
            domain: "schematic" as const,
        }];
        const preparation: EcadDocumentComparisonPreparation = {
            comparisonKey: "comparison",
            context: "SCH",
            document: bundle.project.documents[1]!,
            targets: new Map(),
            diagnostics: [],
            prepareMs: 1,
            sourceCacheHit: false,
        };

        expect(
            resolveSelectedDocument(
                "schematic",
                bundle,
                changes,
                "two.kicad_sch",
            )?.path,
        ).toBe("two.kicad_sch");
        expect(resolveNativeSelection(
            preparation,
            bundle,
            {
                kind: "item",
                id: "first",
                documentPath: "two.kicad_sch",
            },
            changes,
        )).toEqual({ kind: "change", id: "/wire-two" });
    });

    it("moves both panes even when a change exists on only one side", () => {
        // Both panes show the same board in the same coordinates. Selecting an
        // addition should still travel the base pane to where it appeared, so
        // the reviewer can see what used to be there.
        expect(resolveSideBySideFocus([
            {
                ...change("added-1", "added", "uuid-new"),
                geometry: {
                    kind: "footprint",
                    bounds: [1, 2, 3, 4],
                    page: "board.kicad_pcb",
                },
            },
        ])).toEqual({
            page: "board.kicad_pcb",
            baseBounds: [1, 2, 3, 4],
            compareBounds: [1, 2, 3, 4],
            // No base-side object exists to select, only an area to look at.
            baseUuid: null,
            compareUuid: "uuid-new",
        });

        expect(resolveSideBySideFocus([
            {
                ...change("removed-1", "removed", "uuid-old"),
                oldGeometry: {
                    kind: "footprint",
                    bounds: [5, 6, 7, 8],
                },
            },
        ])).toEqual({
            page: null,
            baseBounds: [5, 6, 7, 8],
            // The deletion left a gap; the compare pane travels there to show it.
            compareBounds: [5, 6, 7, 8],
            baseUuid: "uuid-old",
            compareUuid: null,
        });

        expect(resolveSideBySideFocus([
            {
                ...change("changed-1", "changed", "uuid-same"),
                page: "root.kicad_sch",
                geometry: {
                    kind: "symbol",
                    bounds: [10, 10, 2, 2],
                },
                oldGeometry: {
                    kind: "symbol",
                    bounds: [0, 0, 2, 2],
                },
            },
        ])).toEqual({
            page: "root.kicad_sch",
            baseBounds: [0, 0, 2, 2],
            compareBounds: [10, 10, 2, 2],
            baseUuid: "uuid-same",
            compareUuid: "uuid-same",
        });
    });
});

describe("BOM filters", () => {
    const bom: BomDiff = {
        summary: { added: 1, removed: 0, changed: 0 },
        fields: ["Reference", "Value", "Tolerance"],
        changes: [
            {
                ref: "R1",
                status: "added",
                new: { Reference: "R1", Value: "10k", Tolerance: "1%" },
            },
            {
                ref: "R2",
                status: "unchanged",
                old: { Reference: "R2", Value: "1k", Tolerance: "5%" },
                new: { Reference: "R2", Value: "1k", Tolerance: "5%" },
            },
        ],
    };

    it("combines status, unchanged, search, and engineering-field filters", () => {
        const statuses = new Set<"added" | "removed" | "changed">(["added"]);
        expect(filterBomRows(bom, statuses, false, "", "Tolerance", "")).toHaveLength(1);
        expect(filterBomRows(bom, statuses, true, "R2", "Tolerance", "5%"))
            .toEqual([bom.changes[1]]);
        expect(filterBomRows(bom, statuses, true, "", "Tolerance", "0.1%"))
            .toHaveLength(0);
    });
});
