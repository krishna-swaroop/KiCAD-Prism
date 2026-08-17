export interface Manufacturer {
    id: string;
    name: string;
    contact: string;
    website: string;
    notes: string;
    created_at: string;
    updated_at: string;
}

/** One PCB rule / manufacturer-capability field (the KiCad rule set). Each is a
 *  manufacturer minimum, stored as a single number (mm). */
export interface PcbRuleField {
    key: string;
    label: string;
    type: "number" | "int";
    unit?: string;
}

export interface BoardSpec {
    project_id: string;
    specs: Record<string, unknown>;
    source: Record<string, string>;
    active_sections: string[];
    updated_at: string | null;
    updated_by: string;
}

/** A manufacturer attached to a project (from the global directory). */
export interface ProjectManufacturer extends Manufacturer {
    attached_at: string;
}

/** A named fabrication spec scoped to one project + manufacturer. */
export interface ProjectSpec {
    id: string;
    project_id: string;
    manufacturer_id: string;
    manufacturer_name?: string;
    /** The template this spec was built from, if any. */
    template_id?: string | null;
    template_name?: string | null;
    /** The linked template's capabilities, read live (from getProjectSpec). */
    template_capabilities?: Record<string, number>;
    name: string;
    spec_config: string;
    specs: Record<string, unknown>;
    source: Record<string, string>;
    active_sections: string[];
    updated_at: string | null;
    updated_by: string;
}

export type RunStatus = "draft" | "ordered" | "in_production" | "received" | "closed";

export interface ManufacturingRun {
    id: string;
    /** Human-readable job number, e.g. "JOB-2026-0042". */
    job_number?: string | null;
    project_id: string;
    project_name?: string;
    relative_path?: string;
    /** The project's board file, e.g. "satnogs-comms.kicad_pcb". */
    pcb_rel?: string | null;
    manufacturer_id: string | null;
    manufacturer_name?: string | null;
    spec_id?: string | null;
    spec_name?: string | null;
    commit_sha: string;
    release_tag: string;
    quantity_ordered: number;
    quantity_good: number;
    status: RunStatus;
    notes: string;
    spec_snapshot: Record<string, unknown>;
    created_by: string;
    created_at: string;
    updated_at: string;
    defect_count?: number;
    defects?: RunDefect[];
}

export type DefectSeverity = "aesthetic" | "minor" | "major" | "critical";
export type DefectStatus = "open" | "resolved" | "accepted";

export interface EvidenceDescriptor {
    kind: "photo" | "report";
    filename: string;
    digest: string;
    media_type: string;
    size: number;
}

export interface RunDefect {
    id: string;
    run_id: string;
    category: string;
    severity: DefectSeverity;
    quantity_affected: number;
    description: string;
    status: DefectStatus;
    evidence: EvidenceDescriptor[];
    logged_by: string;
    created_at: string;
    resolved_at: string | null;
}

// The run lifecycle, in order, for status pickers and timelines.
export const RUN_STATUSES: RunStatus[] = ["draft", "ordered", "in_production", "received", "closed"];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
    draft: "Draft",
    ordered: "Ordered",
    in_production: "In production",
    received: "Received",
    closed: "Closed",
};

export const DEFECT_CATEGORIES: { value: string; label: string }[] = [
    { value: "soldering", label: "Soldering / assembly" },
    { value: "open_circuit", label: "Open circuit" },
    { value: "short_circuit", label: "Short circuit" },
    { value: "missing_component", label: "Missing component" },
    { value: "wrong_component", label: "Wrong component" },
    { value: "misalignment", label: "Misalignment" },
    { value: "solder_mask", label: "Solder-mask defect" },
    { value: "silkscreen", label: "Silkscreen defect" },
    { value: "drill_plating", label: "Drill / plating defect" },
    { value: "warping", label: "Warping" },
    { value: "contamination", label: "Contamination" },
    { value: "mechanical_damage", label: "Mechanical damage" },
    { value: "other", label: "Other" },
];

export function defectCategoryLabel(value: string): string {
    return DEFECT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// The board-spec form is generated from a user-defined schema (.config), parsed by
// the backend into these shapes. `type` mirrors the config's field types.
export type SpecFieldType = "text" | "int" | "number" | "bool" | "choice";

export type SpecConditionOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "in";

export interface SpecCondition {
    key: string;
    op: SpecConditionOp;
    values: string[];
}

export interface SpecFieldDef {
    key: string;
    label: string;
    type: SpecFieldType;
    options: string[];
    default: unknown;
    /** Show this field only when the condition holds; null = always. */
    when: SpecCondition | null;
}

export interface SpecSectionDef {
    title: string;
    /** Optional sections (written [+Name]) are off until toggled on. */
    optional: boolean;
    /** Show this section only when the condition holds; null = always. */
    when: SpecCondition | null;
    fields: SpecFieldDef[];
}

/**
 * Evaluate a gate against the current form values. Missing/unset values compare
 * as absent, so a gate on an unfilled field is simply not satisfied (except `!=`,
 * where absent is "not equal" and so passes).
 */
export function evaluateCondition(
    condition: SpecCondition | null | undefined,
    values: Record<string, unknown>,
): boolean {
    if (!condition) return true;
    const raw = values[condition.key];
    const actual = raw === undefined || raw === null ? "" : String(raw);
    const targets = condition.values;

    switch (condition.op) {
        case "=":
            return actual === targets[0];
        case "!=":
            return actual !== targets[0];
        case "in":
            return targets.includes(actual);
        case ">":
        case "<":
        case ">=":
        case "<=": {
            const a = Number(actual);
            const b = Number(targets[0]);
            if (Number.isNaN(a) || Number.isNaN(b)) return false;
            if (condition.op === ">") return a > b;
            if (condition.op === "<") return a < b;
            if (condition.op === ">=") return a >= b;
            return a <= b;
        }
        default:
            return true;
    }
}

export interface ParsedSpecConfig {
    sections: SpecSectionDef[];
    errors: string[];
}

export interface SpecTemplate {
    id: string;
    manufacturer_id: string;
    manufacturer_name?: string;
    name: string;
    spec_config: string;
    /** Fabrication capabilities for this method, keyed by PcbRuleField.key. */
    capabilities: Record<string, number>;
    created_at: string;
    updated_at: string;
}

// Keys the board extractor can fill, so the form can show a "from board" hint on
// matching fields and the Extract button knows which values to expect.
export const EXTRACTABLE_KEYS = new Set<string>([
    "layer_count",
    "board_thickness_mm",
    "board_width_mm",
    "board_height_mm",
    "surface_finish",
    "castellated",
    "edge_plating",
]);
