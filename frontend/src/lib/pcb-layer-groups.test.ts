import { describe, expect, it } from "vitest";

import type { EcadPcbLayerState } from "@/types/ecad-viewer";
import { classifyPcbLayer, groupPcbLayers, pcbVisibleSide } from "./pcb-layer-groups";

const layer = (name: string, visible = true, userName?: string): EcadPcbLayerState => ({
    name,
    ...(userName ? { userName } : {}),
    color: "#000",
    visible,
    highlighted: false,
});

describe("classifyPcbLayer", () => {
    it.each([
        ["F.Cu", "copper", "Top"],
        ["In3.Cu", "copper", "Inner 3"],
        ["B.Cu", "copper", "Bottom"],
        ["F.Mask", "mask", "Top"],
        ["B.Paste", "paste", "Bottom"],
        ["F.SilkS", "silkscreen", "Top"],
        ["B.Adhes", "adhesive", "Bottom"],
        ["Edge.Cuts", "mechanical", "Board outline"],
        ["F.CrtYd", "mechanical", "Top courtyard"],
        ["B.Fab", "fabrication", "Bottom"],
        ["Dwgs.User", "documentation", "Drawings"],
        ["User.7", "documentation", "User 7"],
        ["Rescue", "other", "Rescue"],
    ])("%s is %s / %s", (name, group, label) => {
        expect(classifyPcbLayer(name)).toEqual([group, label]);
    });
});

describe("groupPcbLayers", () => {
    it("groups in physical order, keeps the viewer's order inside a group, and drops empty groups", () => {
        const groups = groupPcbLayers([
            layer("F.Cu"),
            layer("In1.Cu"),
            layer("B.Cu"),
            layer("F.SilkS"),
            layer("F.Mask"),
            layer("Edge.Cuts"),
        ]);
        expect(groups.map((group) => group.id)).toEqual(["copper", "mask", "silkscreen", "mechanical"]);
        expect(groups[0]!.layers.map((row) => row.label)).toEqual(["Top", "Inner 1", "Bottom"]);
    });

    it("keeps the canonical name as the key and prefers the board's own layer name", () => {
        const [docs] = groupPcbLayers([layer("User.9", true, "Assembly notes")]);
        expect(docs!.layers[0]).toMatchObject({
            label: "Assembly notes",
            canonical: "User.9",
            layer: { name: "User.9" },
        });
    });

    it("shows no second name when the label already is the KiCad name", () => {
        const [other] = groupPcbLayers([layer("Rescue")]);
        expect(other!.layers[0]!.canonical).toBeNull();
    });
});

describe("pcbVisibleSide", () => {
    it("reads one side, ignoring the board outline", () => {
        expect(pcbVisibleSide([layer("F.Cu"), layer("F.SilkS"), layer("B.Cu", false), layer("Edge.Cuts")])).toBe("top");
        expect(pcbVisibleSide([layer("F.Cu", false), layer("B.Cu"), layer("Edge.Cuts")])).toBe("bottom");
    });

    it("is neither for a mixed or empty view", () => {
        expect(pcbVisibleSide([layer("F.Cu"), layer("B.Cu")])).toBeNull();
        expect(pcbVisibleSide([layer("In1.Cu")])).toBeNull();
        expect(pcbVisibleSide([layer("Edge.Cuts")])).toBeNull();
    });
});
