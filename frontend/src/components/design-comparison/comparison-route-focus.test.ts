import { describe, expect, it } from "vitest";
import {
    focusVisibleLayers,
    routeFocusForChanges,
} from "./comparison-route-focus";
import type { ChangeItem } from "./types";

function routingChange(overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: "change-1",
        kind: "changed",
        domain: "pcb",
        category: "nets",
        classification: "primary",
        label: "USB_DP",
        object_kind: "track",
        net: "USB_DP",
        reasons: ["content-changed"],
        base_item: { source_id: "a", layers: ["F.Cu"] },
        compare_item: { source_id: "a", layers: ["F.Cu"] },
        ...overrides,
    };
}

describe("routing layer focus", () => {
    it("derives each revision's copper independently", () => {
        const focus = routeFocusForChanges([
            routingChange({
                base_item: { source_id: "a", layers: ["F.Cu"] },
                compare_item: { source_id: "a", layers: ["B.Cu"] },
                reasons: ["layer-changed"],
            }),
        ]);

        expect(focus).toEqual({
            net: "USB_DP",
            viaOnly: false,
            reference: ["F.Cu"],
            comparison: ["B.Cu"],
        });
    });

    it("ignores via spans while a track or arc defines the route", () => {
        const focus = routeFocusForChanges([
            routingChange({ id: "t", object_kind: "track" }),
            routingChange({
                id: "a",
                object_kind: "arc",
                base_item: { source_id: "b", layers: ["F.Cu"] },
                compare_item: { source_id: "b", layers: ["F.Cu"] },
            }),
            routingChange({
                id: "v",
                object_kind: "via",
                base_item: { source_id: "c", layers: ["F.Cu", "In2.Cu"] },
                compare_item: { source_id: "c", layers: ["F.Cu", "In2.Cu"] },
            }),
        ]);

        expect(focus?.reference).toEqual(["F.Cu"]);
        expect(focus?.comparison).toEqual(["F.Cu"]);
        expect(focus?.viaOnly).toBe(false);
    });

    it("uses via endpoints only when the change is via-only", () => {
        const focus = routeFocusForChanges([
            routingChange({
                id: "v",
                object_kind: "via",
                base_item: { source_id: "c", layers: ["F.Cu", "In1.Cu"] },
                compare_item: { source_id: "c", layers: ["F.Cu", "B.Cu"] },
            }),
        ]);

        expect(focus?.viaOnly).toBe(true);
        expect(focus?.reference).toEqual(["F.Cu", "In1.Cu"]);
        expect(focus?.comparison).toEqual(["B.Cu", "F.Cu"]);
    });

    it("normalizes the parser's segment and arc_segment kinds", () => {
        const focus = routeFocusForChanges([
            routingChange({ object_kind: "segment" }),
            routingChange({ id: "b", object_kind: "arc_segment" }),
        ]);

        expect(focus?.reference).toEqual(["F.Cu"]);
    });

    it("falls back to the routed revision for a wholly removed route", () => {
        const focus = routeFocusForChanges([
            routingChange({
                kind: "removed",
                base_item: { source_id: "a", layers: ["In1.Cu"] },
                compare_item: null,
            }),
        ]);

        expect(focus?.reference).toEqual(["In1.Cu"]);
        expect(focus?.comparison).toEqual(["In1.Cu"]);
    });

    it("reads a single layer field when no layer list is present", () => {
        const focus = routeFocusForChanges([
            routingChange({
                base_item: { source_id: "a", layer: "F.Cu" },
                compare_item: { source_id: "a", layer: "B.Cu" },
            }),
        ]);

        expect(focus?.reference).toEqual(["F.Cu"]);
        expect(focus?.comparison).toEqual(["B.Cu"]);
    });

    it("keeps non-copper layers out of the focus", () => {
        const focus = routeFocusForChanges([
            routingChange({
                base_item: { source_id: "a", layers: ["F.Cu", "F.Mask"] },
                compare_item: { source_id: "a", layers: ["F.Cu", "F.Mask"] },
            }),
        ]);

        expect(focus?.reference).toEqual(["F.Cu"]);
    });

    it("does not focus a mixed or non-routing selection", () => {
        expect(routeFocusForChanges([])).toBeNull();
        expect(
            routeFocusForChanges([routingChange({ object_kind: "footprint" })]),
        ).toBeNull();
        expect(
            routeFocusForChanges([
                routingChange(),
                routingChange({ id: "p", object_kind: "pad" }),
            ]),
        ).toBeNull();
        expect(
            routeFocusForChanges([
                routingChange({ domain: "schematic", object_kind: "track" }),
            ]),
        ).toBeNull();
    });

    it("does not focus when no copper layer could be resolved", () => {
        expect(
            routeFocusForChanges([
                routingChange({ base_item: null, compare_item: null }),
            ]),
        ).toBeNull();
    });

    it("keeps the board outline visible alongside the focused copper", () => {
        const focus = routeFocusForChanges([
            routingChange({
                base_item: { source_id: "a", layers: ["F.Cu"] },
                compare_item: { source_id: "a", layers: ["B.Cu"] },
            }),
        ])!;

        expect(focusVisibleLayers(focus, "reference")).toEqual([
            "F.Cu",
            "Edge.Cuts",
        ]);
        expect(focusVisibleLayers(focus, "comparison")).toEqual([
            "B.Cu",
            "Edge.Cuts",
        ]);
        expect(focusVisibleLayers(focus, "both")).toEqual([
            "B.Cu",
            "F.Cu",
            "Edge.Cuts",
        ]);
    });

    it("borrows layer context for a removed route the backend shapes as empty", () => {
        // The existing null-`compare_item` case is not the shape the backend
        // actually sends: a removed track carries a compare item with an empty
        // layer list. Both must reach the same fallback, or the compare pane is
        // stripped to the board outline and proves nothing.
        const focus = routeFocusForChanges([
            routingChange({
                kind: "removed",
                reasons: ["object-removed"],
                base_item: { source_id: "a", layers: ["F.Cu"] },
                compare_item: { source_id: "a", layers: [] },
            }),
            routingChange({
                id: "change-2",
                kind: "removed",
                reasons: ["object-removed"],
                base_item: { source_id: "b", layers: ["B.Cu"] },
                compare_item: { source_id: "b", layers: [] },
            }),
        ])!;

        expect(focus.reference).toEqual(["B.Cu", "F.Cu"]);
        expect(focus.comparison).toEqual(["B.Cu", "F.Cu"]);
        expect(focusVisibleLayers(focus, "comparison"))
            .toEqual(["B.Cu", "F.Cu", "Edge.Cuts"]);
    });
});
