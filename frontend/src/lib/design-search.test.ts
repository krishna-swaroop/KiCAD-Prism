import { describe, expect, it } from "vitest";

import {
    searchDesignEntities,
    selectionFromDesignSearchHit,
} from "./design-search";
import type { PrismSemanticIndex, SemanticComponent, SemanticNet } from "@/types/prism-selection";

function index(components: SemanticComponent[], nets: SemanticNet[]): PrismSemanticIndex {
    return {
        schema: "prism.semantic_index_a0",
        sourceRevisionKey: "rev",
        components,
        nets,
        terminals: [],
        indexes: {},
    };
}

function component(partial: Partial<SemanticComponent> & { reference: string }): SemanticComponent {
    return {
        componentUid: partial.componentUid ?? `cmp:${partial.reference}`,
        value: partial.value,
        footprint: partial.footprint,
        fields: partial.fields,
        schematicRefs: partial.schematicRefs,
        pcbRefs: partial.pcbRefs,
        ...partial,
        reference: partial.reference,
    };
}

function net(partial: Partial<SemanticNet> & { name: string }): SemanticNet {
    return {
        netUid: partial.netUid ?? `net:${partial.name}`,
        netClass: partial.netClass,
        schematicRefs: partial.schematicRefs,
        ...partial,
        name: partial.name,
    };
}

describe("searchDesignEntities", () => {
    const board = index(
        [
            component({
                reference: "R12",
                value: "10k",
                footprint: "R_0402",
                fields: { "Manufacturer Part Number": "RC0402FR-0710KL" },
                schematicRefs: [{ page: "power.kicad_sch" }],
            }),
            component({
                reference: "R120",
                value: "10k",
                footprint: "R_0603",
                schematicRefs: [{ page: "io.kicad_sch" }],
            }),
            component({ reference: "C4", value: "100n", footprint: "C_0402" }),
        ],
        [
            net({ name: "GND", netClass: "Power" }),
            net({ name: "GNDA", netClass: "Analog" }),
            net({ name: "I2C_SDA", netClass: "Default" }),
        ],
    );

    it("returns nothing for an empty query", () => {
        expect(searchDesignEntities(board, "  ")).toEqual([]);
        expect(searchDesignEntities(null, "R12")).toEqual([]);
    });

    it("lists each matching instance as its own component row", () => {
        const hits = searchDesignEntities(board, "10k");
        expect(hits.filter((hit) => hit.kind === "component").map((hit) => hit.title)).toEqual(["R12", "R120"]);
    });

    it("ranks an exact designator ahead of a prefix", () => {
        const titles = searchDesignEntities(board, "r12").map((hit) => hit.title);
        expect(titles[0]).toBe("R12");
        expect(titles).toContain("R120");
    });

    it("matches footprint and MPN fields", () => {
        expect(searchDesignEntities(board, "0402").map((hit) => hit.title).sort()).toEqual(["C4", "R12"]);
        expect(searchDesignEntities(board, "RC0402").map((hit) => hit.title)).toEqual(["R12"]);
    });

    it("keeps nets grouped after components and matches net class", () => {
        const hits = searchDesignEntities(board, "gnd");
        expect(hits.map((hit) => `${hit.kind}:${hit.title}`)).toEqual([
            "net:GND",
            "net:GNDA",
        ]);
        expect(searchDesignEntities(board, "analog").map((hit) => hit.title)).toEqual(["GNDA"]);
    });

    it("fuzzy-matches net names the way workspace search matches projects", () => {
        expect(searchDesignEntities(board, "i2c sda").map((hit) => hit.title)).toEqual(["I2C_SDA"]);
        expect(searchDesignEntities(board, "i2csda").map((hit) => hit.title)).toEqual(["I2C_SDA"]);
        expect(searchDesignEntities(board, "gnda").map((hit) => hit.title)[0]).toBe("GNDA");
    });

    it("omits the sheet name when the instance is on the current page", () => {
        const onPower = searchDesignEntities(board, "R12", { currentPage: "power.kicad_sch" })[0];
        expect(onPower.subtitle).toBe("10k · R_0402");
        const elsewhere = searchDesignEntities(board, "R12", { currentPage: "io.kicad_sch" })[0];
        expect(elsewhere.subtitle).toContain("power.kicad_sch");
    });
});

describe("selectionFromDesignSearchHit", () => {
    it("builds a component selection from the hit", () => {
        const hit = searchDesignEntities(
            index([component({ reference: "U1", schematicRefs: [{ symbolUuid: "sym-1", page: "root.kicad_sch" }] })], []),
            "U1",
        )[0];
        expect(selectionFromDesignSearchHit(hit, "PCB")).toMatchObject({
            kind: "component",
            sourceContext: "PCB",
            reference: "U1",
            uuid: "sym-1",
        });
    });

    it("builds a net selection from the hit", () => {
        const hit = searchDesignEntities(index([], [net({ name: "GND", netCode: 0 })]), "GND")[0];
        expect(selectionFromDesignSearchHit(hit, "SCH")).toMatchObject({
            kind: "net",
            sourceContext: "SCH",
            netName: "GND",
            netCode: 0,
        });
    });
});
