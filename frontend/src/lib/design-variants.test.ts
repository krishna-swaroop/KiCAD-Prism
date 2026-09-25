/**
 * VAR-11: the frontend derives effective component state and physical
 * classification from the immutable index. The assembly fixtures below are an
 * extract of the oracle fixture (`backend/tests/fixtures/design_variants/
 * expected/oracle.json`); reference-level expectations are copied verbatim
 * from that file.
 */
import { describe, expect, it } from "vitest";

import {
    assemblyProjectionState,
    physicalVisibility,
    projectAssemblyState,
    type FootprintInventoryEntry,
} from "./design-variants";
import type {
    AssemblyState,
    AssemblyVariantState,
    PhysicalVisibility,
    PrismSemanticIndex,
    SemanticComponent,
} from "@/types/prism-selection";

function component(
    reference: string,
    extra: Partial<SemanticComponent> = {},
): SemanticComponent {
    const value = extra.value ?? "";
    const footprint = extra.footprint ?? "";
    return {
        componentUid: extra.componentUid ?? `cmp:${reference}`,
        reference,
        value,
        footprint,
        fields: {
            Value: value,
            DNP: "No",
            "In BOM": "Yes",
            Footprint: footprint,
            ...(extra.fields ?? {}),
        },
        schematicRefs: extra.schematicRefs,
        pcbRefs: extra.pcbRefs ?? [],
    };
}

const Q1_SOT23 = "5a220ef8-f143-59ec-941e-de3da0b7105e";
const Q1_SOT89 = "8bdd2fcb-5aff-5a3a-a6e2-96f479a3fb83";

function oracleLike(): PrismSemanticIndex {
    const components: SemanticComponent[] = [
        component("R1", {
            value: "10k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "10k", DNP: "No", "In BOM": "Yes", MPN: "R1-BASE" },
            pcbRefs: [{ footprintUuid: "ec3880bf-62c2-5c41-a50f-6381596c30ef" }],
        }),
        component("R2", {
            value: "22k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "22k", DNP: "Yes", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: "4b298f09-2eff-5fd1-982c-b1eb072ccbe8" }],
        }),
        component("R3", {
            value: "33k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "33k", DNP: "No", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: "2073849d-13a1-5c6f-b6f4-5f6b0e7f001f" }],
        }),
        component("R4", {
            value: "1k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "1k", DNP: "No", "In BOM": "Yes", MPN: "R4-BASE" },
            pcbRefs: [{ footprintUuid: "3557800a-6a99-56d7-bd1f-6b1cf8abec66" }],
        }),
        component("C1", {
            value: "1uF",
            footprint: "Capacitor_SMD:C_0603_1608Metric",
            fields: {
                Value: "1uF",
                DNP: "No",
                "In BOM": "Yes",
                MPN: "X-1",
                Note: 'He said "hi"',
            },
            pcbRefs: [{ footprintUuid: "78868d5e-e525-51b9-adcc-94b26de45321" }],
        }),
        component("U1", {
            value: "DualAmp",
            footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
            fields: { Value: "DualAmp", DNP: "No", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: "f137ce95-5350-58e0-8833-623a61e2ba70" }],
        }),
        component("Q1", {
            value: "BC847",
            footprint: "Package_TO_SOT_SMD:SOT-23",
            fields: { Value: "BC847", DNP: "No", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: Q1_SOT23 }, { footprintUuid: Q1_SOT89 }],
        }),
        component("R9", {
            value: "1k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "1k", DNP: "No", "In BOM": "Yes" },
        }),
        component("U2", {
            value: "DualAmp",
            footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
            fields: { Value: "DualAmp", DNP: "No", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: "b6537e7e-dfe7-5c02-8e83-0f273a34b98b" }],
        }),
        component("R12", {
            value: "1k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "1k", DNP: "No", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: "5296bb19-4455-52ba-9eab-2f8aff8fe095" }],
        }),
        component("R6", {
            value: "1k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "1k", DNP: "No", "In BOM": "Yes" },
            pcbRefs: [{ footprintUuid: "79e10a17-6c02-57db-aeca-8858a552f276" }],
        }),
        component("R7", {
            value: "1k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "1k", DNP: "No", "In BOM": "Yes", MPN: "CH-BASE" },
            pcbRefs: [{ footprintUuid: "5332fc15-1d56-5263-98d2-33033b43605e" }],
        }),
        component("R8", {
            value: "1k",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            fields: { Value: "1k", DNP: "No", "In BOM": "Yes", MPN: "CH-BASE" },
            pcbRefs: [{ footprintUuid: "705904d1-297c-5955-ae0e-d36895ea5be4" }],
        }),
    ];

    const lite: AssemblyVariantState = {
        name: "Lite",
        occurrences: {},
        components: {
            "cmp:R1": { dnp: true },
            "cmp:R2": { dnp: false },
            "cmp:R3": { excludeFromBom: true, excludeFromPosFiles: true },
            "cmp:R4": { fields: { MPN: "R4-LITE" } },
            "cmp:C1": { fields: { Value: "100nF", MPN: "X-LITE" } },
            "cmp:U1": { dnp: true },
            "cmp:Q1": {
                fields: {
                    Footprint: "Package_TO_SOT_SMD:SOT-89-3",
                    Value: "BCX56",
                },
            },
            "cmp:R9": { excludeFromSim: true },
            "cmp:U2": { dnp: true },
            "cmp:R12": { dnp: true },
            "cmp:R6": { dnp: true },
            "cmp:R7": { fields: { MPN: "A-LITE" } },
            "cmp:R8": { dnp: true },
        },
        footprints: {
            "ec3880bf-62c2-5c41-a50f-6381596c30ef": { dnp: true },
            "4b298f09-2eff-5fd1-982c-b1eb072ccbe8": { dnp: false },
            "f137ce95-5350-58e0-8833-623a61e2ba70": { dnp: true },
            [Q1_SOT23]: { dnp: true },
            [Q1_SOT89]: { dnp: false },
            "b6537e7e-dfe7-5c02-8e83-0f273a34b98b": { dnp: true },
            "5296bb19-4455-52ba-9eab-2f8aff8fe095": { dnp: true },
            "79e10a17-6c02-57db-aeca-8858a552f276": { dnp: true },
            "705904d1-297c-5955-ae0e-d36895ea5be4": { dnp: true },
            "5332fc15-1d56-5263-98d2-33033b43605e": {
                fields: { MPN: "A-LITE" },
            },
        },
    };
    const pro: AssemblyVariantState = {
        name: "Pro",
        occurrences: {},
        components: {
            "cmp:C1": { fields: { MPN: "" } },
            "cmp:R9": { excludeFromBoard: true },
            "cmp:U2": { excludeFromBom: true },
            "cmp:R12": { excludeFromBom: true },
            "cmp:R6": { excludeFromBom: true },
        },
        footprints: {},
    };
    const unused: AssemblyVariantState = {
        name: "Unused",
        occurrences: {},
        components: {},
        footprints: {},
    };
    const pcbOnly: AssemblyVariantState = {
        name: "PcbOnly",
        occurrences: {},
        components: {},
        footprints: {
            "72e28d8a-fadf-5e02-8a20-c37d1e474754": { dnp: true },
        },
    };

    const assembly: AssemblyState = {
        schema: "prism.assembly_state_a0",
        footprintInventory: INVENTORY,
        catalog: [
            {
                name: "Lite",
                description: "Cost-reduced build",
                sources: ["project", "pcb", "schematic", "footprint"],
            },
            { name: "Pro", description: null, sources: ["project", "pcb"] },
            { name: "Unused", description: null, sources: ["project"] },
            { name: "BoardOnly", description: null, sources: ["pcb"] },
            { name: "PcbOnly", description: null, sources: ["footprint"] },
        ],
        default: {
            occurrences: {},
            components: { "cmp:R2": { dnp: true } },
            footprints: {
                "4b298f09-2eff-5fd1-982c-b1eb072ccbe8": {
                    reference: "R2",
                    componentUid: "cmp:R2",
                    dnp: true,
                },
                [Q1_SOT89]: {
                    reference: "Q1",
                    componentUid: "cmp:Q1",
                    dnp: true,
                },
            },
        },
        variants: [lite, pro, unused, pcbOnly],
        diagnostics: [
            {
                code: "duplicate-reference-footprints",
                severity: "warning",
                message: "fixture",
                reference: "Q1",
                footprintUuids: [Q1_SOT23, Q1_SOT89],
            },
        ],
    };

    return {
        schema: "prism.semantic_index_a0",
        sourceRevisionKey: "rev",
        components,
        nets: [],
        terminals: [],
        indexes: {},
        assembly,
    };
}

const INVENTORY: FootprintInventoryEntry[] = [
    { uuid: "ec3880bf-62c2-5c41-a50f-6381596c30ef", reference: "R1", componentUid: "cmp:R1" },
    { uuid: "4b298f09-2eff-5fd1-982c-b1eb072ccbe8", reference: "R2", componentUid: "cmp:R2" },
    { uuid: "2073849d-13a1-5c6f-b6f4-5f6b0e7f001f", reference: "R3", componentUid: "cmp:R3" },
    { uuid: "3557800a-6a99-56d7-bd1f-6b1cf8abec66", reference: "R4", componentUid: "cmp:R4" },
    { uuid: "78868d5e-e525-51b9-adcc-94b26de45321", reference: "C1", componentUid: "cmp:C1" },
    { uuid: "f137ce95-5350-58e0-8833-623a61e2ba70", reference: "U1", componentUid: "cmp:U1" },
    { uuid: Q1_SOT23, reference: "Q1", componentUid: "cmp:Q1" },
    { uuid: Q1_SOT89, reference: "Q1", componentUid: "cmp:Q1" },
    { uuid: "b6537e7e-dfe7-5c02-8e83-0f273a34b98b", reference: "U2", componentUid: "cmp:U2" },
    { uuid: "5296bb19-4455-52ba-9eab-2f8aff8fe095", reference: "R12", componentUid: "cmp:R12" },
    { uuid: "79e10a17-6c02-57db-aeca-8858a552f276", reference: "R6", componentUid: "cmp:R6" },
    { uuid: "5332fc15-1d56-5263-98d2-33033b43605e", reference: "R7", componentUid: "cmp:R7" },
    { uuid: "705904d1-297c-5955-ae0e-d36895ea5be4", reference: "R8", componentUid: "cmp:R8" },
    { uuid: "72e28d8a-fadf-5e02-8a20-c37d1e474754", reference: "J9", componentUid: null },
];

function byReference(
    components: SemanticComponent[],
): Record<string, SemanticComponent> {
    return Object.fromEntries(
        components.map((component) => [component.reference, component]),
    );
}

describe("assemblyProjectionState", () => {
    it("distinguishes unavailable, default, applied and missing", () => {
        const index = oracleLike();
        expect(assemblyProjectionState(index, null)).toBe("default");
        expect(assemblyProjectionState(index, "Lite")).toBe("applied");
        expect(assemblyProjectionState(index, "Nope")).toBe("missing");
        expect(
            assemblyProjectionState({ ...index, assembly: undefined }, "Lite"),
        ).toBe("unavailable");
    });
});

describe("projectAssemblyState", () => {
    it("returns the same index and array for the default and unknown names", () => {
        const index = oracleLike();
        for (const name of [null, "Nope"]) {
            const projection = projectAssemblyState(index, name);
            expect(projection.index).toBe(index);
            expect(projection.components).toBe(index.components);
        }
    });

    it("applies Lite overrides without mutating the base index", () => {
        const index = oracleLike();
        const before = JSON.stringify(index.components);
        const { components } = projectAssemblyState(index, "Lite");
        const effective = byReference(components);

        expect(effective.R1!.fields!["DNP"]).toBe("Yes");
        expect(effective.R2!.fields!["DNP"]).toBe("No");
        expect(effective.R3!.fields!["In BOM"]).toBe("No");
        expect(effective.R3!.fields!["DNP"]).toBe("No");
        expect(effective.C1!.value).toBe("100nF");
        expect(effective.C1!.fields!["Value"]).toBe("100nF");
        expect(effective.C1!.fields!["MPN"]).toBe("X-LITE");
        expect(effective.Q1!.value).toBe("BCX56");
        expect(effective.Q1!.footprint).toBe("Package_TO_SOT_SMD:SOT-89-3");
        expect(effective.Q1!.fields!["Footprint"]).toBe(
            "Package_TO_SOT_SMD:SOT-89-3",
        );
        expect(effective.R7!.fields!["MPN"]).toBe("A-LITE");
        expect(effective.U2!.fields!["DNP"]).toBe("Yes");
        // R9's only override is simulation exclusion, which the projection
        // does not surface: its object identity is preserved.
        expect(components[7]).toBe(index.components[7]);
        expect(JSON.stringify(index.components)).toBe(before);
    });

    it("keeps array order, connectivity and lookup identity", () => {
        const index = oracleLike();
        const { components } = projectAssemblyState(index, "Pro");
        expect(components.map((c) => c.reference)).toEqual(
            index.components.map((c) => c.reference),
        );
        expect(components[0]!.pcbRefs).toBe(index.components[0]!.pcbRefs);
        expect(components[0]!.schematicRefs).toBe(
            index.components[0]!.schematicRefs,
        );
    });

    it("explicit empty field values and per-variant exclusion survive", () => {
        const index = oracleLike();
        const pro = byReference(projectAssemblyState(index, "Pro").components);
        expect(pro.C1!.fields!["MPN"]).toBe("");
        expect(pro.R9!.fields!["DNP"]).toBe("No");
        expect(pro.R9!.fields!["In BOM"]).toBe("Yes");
    });

    it("A -> B -> default never stacks or mutates", () => {
        const index = oracleLike();
        projectAssemblyState(index, "Lite");
        projectAssemblyState(index, "Pro");
        const back = projectAssemblyState(index, null);
        expect(back.components).toBe(index.components);
        const lite = byReference(
            projectAssemblyState(index, "Lite").components,
        );
        // B's empty MPN must not leak into A.
        expect(lite.C1!.fields!["MPN"]).toBe("X-LITE");
        expect(lite.C1!.value).toBe("100nF");
        expect(byReference(index.components).C1!.value).toBe("1uF");
    });

    it("a variant with no overrides keeps every component object", () => {
        const index = oracleLike();
        const { components } = projectAssemblyState(index, "Unused");
        expect(components).toBe(index.components);
    });
});

describe("physicalVisibility", () => {
    const expectedDefault: Record<string, PhysicalVisibility> = {
        R1: "visible",
        R2: "hidden",
        R3: "visible",
        R4: "visible",
        C1: "visible",
        U1: "visible",
        Q1: "ambiguous",
        R9: "absent",
        U2: "visible",
        R12: "visible",
        R6: "visible",
        R7: "visible",
        R8: "visible",
        J9: "visible",
    };

    it("matches the oracle fixture's default classification", () => {
        expect(physicalVisibility(oracleLike(), null)).toEqual(
            expectedDefault,
        );
    });

    it("matches the Lite classification and keeps Q1 ambiguous", () => {
        const visibility = physicalVisibility(oracleLike(), "Lite");
        expect(visibility).toEqual({
            ...expectedDefault,
            R1: "hidden",
            R2: "visible",
            U1: "hidden",
            Q1: "ambiguous",
            U2: "hidden",
            R12: "hidden",
            R6: "hidden",
            R7: "visible",
            R8: "hidden",
        });
    });

    it("matches Pro and the footprint-only PcbOnly variant", () => {
        const index = oracleLike();
        expect(physicalVisibility(index, "Pro")).toEqual(
            expectedDefault,
        );
        expect(physicalVisibility(index, "PcbOnly")).toEqual({
            ...expectedDefault,
            J9: "hidden",
        });
    });

    it("never guesses a reference-level DNP for duplicate footprints", () => {
        // The full inventory exposes both alternates, including neutral flags.
        const index = oracleLike();
        for (const name of [null, "Lite", "Pro"]) {
            expect(physicalVisibility(index, name).Q1).toBe("ambiguous");
        }
    });

    it("is stable for unknown names (default classification) and absent components", () => {
        const index = oracleLike();
        expect(physicalVisibility(index, "Nope")).toEqual(
            expectedDefault,
        );
        expect(physicalVisibility(index, null).R9).toBe("absent");
    });
});


describe("PCB-only physical identity", () => {
    it("hides an orphan footprint whose default flags are all neutral", () => {
        const index = oracleLike();
        index.assembly!.footprintInventory = [{ uuid: "orphan", reference: "H1" }];
        index.assembly!.variants.push({name: "NoMount", occurrences: {}, components: {}, footprints: {orphan: {dnp: true}}});
        expect(physicalVisibility(index, null).H1).toBe("visible");
        expect(physicalVisibility(index, "NoMount").H1).toBe("hidden");
        expect(physicalVisibility(index, null).H1).toBe("visible");
    });
});
