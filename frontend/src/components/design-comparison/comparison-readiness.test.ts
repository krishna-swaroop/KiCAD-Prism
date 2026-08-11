import { describe, expect, it } from "vitest";
import { comparisonDomainStatus } from "./comparison-readiness";
import type { DesignCompareReadiness, DesignCompareResult } from "./types";

function resultWithDomains(
    domains: DesignCompareReadiness["domains"],
): DesignCompareResult {
    return {
        base: "base",
        head: "head",
        diagnostics: [],
        files: { base: [], head: [] },
        document_diff: {
            schema: "prism.kicad_project_diff_v1",
            provider: "prism-semantic",
            project: { documents: [] },
            navigation: {},
            diagnostics: [],
        },
        schematic: {
            pages: [],
            changes: [],
            groups: [],
            summary: { added: 0, removed: 0, changed: 0 },
        },
        pcb: {
            changes: [],
            groups: [],
            summary: { added: 0, removed: 0, changed: 0 },
            route_metrics: { base: {}, compare: {} },
        },
        bom: {
            changes: [],
            fields: [],
            summary: { added: 0, removed: 0, changed: 0 },
        },
        stackup: { base: [], head: [], changed: false, present: false },
        readiness: {
            stage: "initial-ready",
            domains,
        },
    };
}

describe("comparisonDomainStatus", () => {
    it("keeps Schematic and BOM usable while PCB and Stackup build", () => {
        const result = resultWithDomains({
            schematic: "ready",
            bom: "ready",
            pcb: "building",
            stackup: "building", fabrication: "ready",
        });

        expect(comparisonDomainStatus(result, "schematic")).toBe("ready");
        expect(comparisonDomainStatus(result, "bom")).toBe("ready");
        expect(comparisonDomainStatus(result, "pcb")).toBe("building");
        expect(comparisonDomainStatus(result, "stackup")).toBe("building");
    });

    it("treats legacy results without readiness metadata as fully ready", () => {
        expect(comparisonDomainStatus(null, "pcb")).toBe("ready");
        const legacy = resultWithDomains({
            schematic: "ready",
            bom: "ready",
            pcb: "ready",
            stackup: "ready", fabrication: "ready",
        });
        delete legacy.readiness;
        expect(comparisonDomainStatus(legacy, "stackup")).toBe("ready");
    });

    it("exposes a background-stage failure without hiding initial domains", () => {
        const result = resultWithDomains({
            schematic: "ready",
            bom: "ready",
            pcb: "failed",
            stackup: "failed", fabrication: "ready",
        });

        expect(comparisonDomainStatus(result, "schematic")).toBe("ready");
        expect(comparisonDomainStatus(result, "pcb")).toBe("failed");
    });
});
