import { describe, expect, it } from "vitest";

import {
    filterLabelInstances,
    labelInstanceListLabel,
    type LabelInstanceRef,
} from "./label-instances";

function instance(
    partial: Partial<LabelInstanceRef> & { uuid: string; sheet: string },
): LabelInstanceRef {
    return {
        name: "NET",
        kind: "net",
        ...partial,
    };
}

describe("filterLabelInstances", () => {
    const mixed: LabelInstanceRef[] = [
        instance({ uuid: "g1", sheet: "power.kicad_sch", kind: "global" }),
        instance({ uuid: "g2", sheet: "mcu.kicad_sch", kind: "global" }),
        instance({ uuid: "n1", sheet: "mcu.kicad_sch", kind: "net" }),
        instance({ uuid: "n2", sheet: "io.kicad_sch", kind: "net" }),
        instance({ uuid: "h1", sheet: "mcu.kicad_sch", kind: "hierarchical" }),
    ];

    it("keeps every global label when a global label is selected", () => {
        expect(filterLabelInstances(mixed, "global-label").map((row) => row.uuid)).toEqual(["g1", "g2"]);
    });

    it("keeps net labels on every sheet when a net label is selected", () => {
        expect(filterLabelInstances(mixed, "label").map((row) => row.uuid)).toEqual(["n1", "n2"]);
    });

    it("prefers net labels for wire and search hits when both kinds have multiple instances", () => {
        expect(filterLabelInstances(mixed, "wire").map((row) => row.uuid)).toEqual(["n1", "n2"]);
        expect(filterLabelInstances(mixed, undefined).map((row) => row.uuid)).toEqual(["n1", "n2"]);
    });

    it("falls back to global labels when a net has no net-label instances", () => {
        const globalsOnly = mixed.filter((row) => row.kind === "global");
        expect(filterLabelInstances(globalsOnly, "wire").map((row) => row.uuid)).toEqual(["g1", "g2"]);
    });
});

describe("labelInstanceListLabel", () => {
    it("uses the sheet name when the label is unique on that sheet", () => {
        const instances = [
            instance({ uuid: "a", sheet: "mcu.kicad_sch" }),
            instance({ uuid: "b", sheet: "io.kicad_sch" }),
        ];
        expect(labelInstanceListLabel(instances[0], instances)).toBe("mcu.kicad_sch");
    });

    it("adds an ordinal when several labels share a sheet", () => {
        const instances = [
            instance({ uuid: "a", sheet: "mcu.kicad_sch" }),
            instance({ uuid: "b", sheet: "mcu.kicad_sch" }),
            instance({ uuid: "c", sheet: "io.kicad_sch" }),
        ];
        expect(labelInstanceListLabel(instances[0], instances)).toBe("mcu.kicad_sch · 1");
        expect(labelInstanceListLabel(instances[1], instances)).toBe("mcu.kicad_sch · 2");
        expect(labelInstanceListLabel(instances[2], instances)).toBe("io.kicad_sch");
    });
});
