import { describe, expect, it } from "vitest";

import {
    checkCapabilities,
    effectiveFieldValue,
    isFieldSet,
    sectionProgress,
    specProgress,
    type CapabilityRow,
    type SpecFieldDef,
    type SpecSectionDef,
} from "./manufacturing";

const field = (key: string, extra: Partial<SpecFieldDef> = {}): SpecFieldDef => ({
    key,
    label: key,
    type: "text",
    options: [],
    default: null,
    when: null,
    ...extra,
});

describe("spec completeness", () => {
    it("prefers a stored value, falls back to the default, and treats blanks as unset", () => {
        const f = field("a", { default: "x" });
        expect(effectiveFieldValue(f, { a: "y" })).toBe("y");
        expect(effectiveFieldValue(f, {})).toBe("x");
        expect(isFieldSet(f, {})).toBe(true);
        expect(isFieldSet(field("b"), {})).toBe(false);
        expect(isFieldSet(field("b"), { b: "" })).toBe(false);
        // A stored zero or false is a real value.
        expect(isFieldSet(field("c", { type: "int" }), { c: 0 })).toBe(true);
        expect(isFieldSet(field("d", { type: "bool" }), { d: false })).toBe(true);
    });

    it("counts only visible fields", () => {
        const section: SpecSectionDef = {
            title: "S",
            optional: false,
            when: null,
            fields: [
                field("mat", { default: "Flex" }),
                field("inner", { when: { key: "mat", op: "=", values: ["FR-4"] } }),
                field("x"),
            ],
        };
        expect(sectionProgress(section, {})).toEqual({ set: 1, total: 2 });
        expect(sectionProgress(section, { mat: "FR-4", inner: "2" })).toEqual({ set: 2, total: 3 });
    });

    it("skips gated-off sections and optional sections that are switched off", () => {
        const sections: SpecSectionDef[] = [
            { title: "Base", optional: false, when: null, fields: [field("a", { default: 1 }), field("b")] },
            { title: "Extra", optional: true, when: null, fields: [field("c")] },
            { title: "Hidden", optional: false, when: { key: "a", op: "=", values: ["9"] }, fields: [field("d")] },
        ];
        expect(specProgress(sections, {}, new Set())).toEqual({ set: 1, total: 2 });
        expect(specProgress(sections, {}, new Set(["Extra"]))).toEqual({ set: 1, total: 3 });
    });
});

describe("checkCapabilities", () => {
    const rows: CapabilityRow[] = [
        { key: "track", label: "Track", unit: "mm", kicad: true, value: 0.1 },
        { key: "via", label: "Via", unit: "mm", kicad: true, value: 0.25 },
        { key: "drill", label: "Drill", unit: "mm", kicad: true, value: 0.2 },
        { key: "custom", label: "Custom", kicad: false, value: 5 },
        { key: "noMin", label: "No min", kicad: true },
    ];

    it("flags rules where the board is below the minimum and counts what it compared", () => {
        const { findings, compared } = checkCapabilities(rows, { track: 0.09, via: 0.25, custom: 1, noMin: 1 });
        expect(findings.map((f) => f.row.key)).toEqual(["track"]);
        expect(findings[0].board).toBe(0.09);
        // track and via compare; drill has no board value, custom is not KiCad-tracked, noMin has no minimum.
        expect(compared).toBe(2);
    });

    it("ignores unreadable board values and a missing board", () => {
        expect(checkCapabilities(rows, null)).toEqual({ findings: [], compared: 0 });
        const result = checkCapabilities(rows, { track: "n/a", via: true, drill: "" });
        expect(result).toEqual({ findings: [], compared: 0 });
    });

    it("accepts numeric strings from the board", () => {
        expect(checkCapabilities(rows, { drill: "0.15" }).findings.map((f) => f.row.key)).toEqual(["drill"]);
    });
});
