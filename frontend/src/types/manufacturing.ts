export interface Manufacturer {
    id: string;
    name: string;
    contact: string;
    website: string;
    notes: string;
    created_at: string;
    updated_at: string;
    /** How many processes it has (the directory list only). */
    process_count?: number;
    /** How many projects have it attached (the directory list only). */
    project_count?: number;
    /** The projects that have it attached (the directory list only). */
    projects?: { id: string; name: string }[];
}

/** One PCB rule / manufacturer-capability field (the KiCad rule set). Each is a
 *  manufacturer minimum, stored as a single number (mm). */
export interface PcbRuleField {
    key: string;
    label: string;
    type: "number" | "int";
    unit?: string;
}

/** Display metadata for a custom capability KiCad does not track. */
export interface CapabilityMeta {
    label: string;
    unit?: string;
}

/** One capability row for display: a KiCad-tracked rule field or a custom entry. */
export interface CapabilityRow {
    key: string;
    label: string;
    unit?: string;
    /** True when KiCad can extract this from the board (a PCB_RULE_FIELDS key). */
    kicad: boolean;
    /** The manufacturer minimum, if set. */
    value?: number;
}

/**
 * Merge the KiCad-tracked rule fields with a template's custom capabilities into
 * one ordered display list: tracked fields first (in their canonical order),
 * then custom entries. Used by both the capability editor and the project view.
 */
export function mergeCapabilityRows(
    ruleFields: PcbRuleField[],
    capabilities: Record<string, number>,
    meta: Record<string, CapabilityMeta> = {},
): CapabilityRow[] {
    const trackedKeys = new Set(ruleFields.map((f) => f.key));
    const tracked: CapabilityRow[] = ruleFields.map((f) => ({
        key: f.key,
        label: f.label,
        unit: f.unit,
        kicad: true,
        value: capabilities[f.key],
    }));
    // Custom capabilities: every key with a value or a label that KiCad does not track, once each.
    const custom: CapabilityRow[] = [];
    const seen = new Set<string>();
    for (const key of [...Object.keys(capabilities), ...Object.keys(meta)]) {
        if (seen.has(key) || trackedKeys.has(key)) continue;
        seen.add(key);
        custom.push({
            key,
            label: meta[key]?.label ?? key,
            unit: meta[key]?.unit,
            kicad: false,
            value: capabilities[key],
        });
    }
    return [...tracked, ...custom];
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
    /** Label/unit for the linked template's custom (non KiCad-tracked) capabilities. */
    template_capability_meta?: Record<string, CapabilityMeta>;
    /** The linked template's editable capability .config text. */
    template_capability_config?: string;
    name: string;
    spec_config: string;
    specs: Record<string, unknown>;
    source: Record<string, string>;
    active_sections: string[];
    updated_at: string | null;
    updated_by: string;
}

export type RunStatus = "draft" | "ordered" | "in_production" | "received" | "closed" | "cancelled";

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
    /** Defects still open (the list view); `defects` carries them all in the detail view. */
    open_defect_count?: number;
    /** All defects by severity (the list view). */
    defect_severity_counts?: Partial<Record<DefectSeverity, number>>;
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
    /** Why it was resolved, or the reason it was accepted as-is. */
    resolution_note?: string;
    /** Who resolved or accepted it. */
    resolved_by?: string;
    evidence: EvidenceDescriptor[];
    logged_by: string;
    created_at: string;
    resolved_at: string | null;
}

// The run lifecycle, in order: the stages shown on the progress bar. A cancelled run is
// not one of them (see ALL_RUN_STATUSES).
export const RUN_STATUSES: RunStatus[] = ["draft", "ordered", "in_production", "received", "closed"];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
    draft: "Draft",
    ordered: "Ordered",
    in_production: "In production",
    received: "Received",
    closed: "Closed",
    cancelled: "Cancelled",
};

/** Every status a run can have: the lifecycle, then cancelled. */
export const ALL_RUN_STATUSES: RunStatus[] = [...RUN_STATUSES, "cancelled"];

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
    /** Unit of a numeric field, split from its label by the backend (e.g. "mm"). */
    unit?: string;
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
    /** Fabrication capabilities for this method, keyed by PcbRuleField.key or a
        custom key (see capability_meta). Derived from capability_config. */
    capabilities: Record<string, number>;
    /** Label/unit for custom (non KiCad-tracked) capability keys. */
    capability_meta?: Record<string, CapabilityMeta>;
    /** Editable .config text for the capabilities; the source of truth. */
    capability_config?: string;
    /** How many projects' specs use this process (from the list). */
    project_count?: number;
    created_at: string;
    updated_at: string;
}

/** The value a field shows: the stored one, else the schema's declared default. */
export function effectiveFieldValue(field: SpecFieldDef, values: Record<string, unknown>): unknown {
    const stored = values[field.key];
    return stored === undefined || stored === null ? field.default : stored;
}

/** Whether a field has a value to show (a default counts, a blank does not). */
export function isFieldSet(field: SpecFieldDef, values: Record<string, unknown>): boolean {
    const value = effectiveFieldValue(field, values);
    return value !== undefined && value !== null && value !== "";
}

/** The fields of a section that are in play: those whose gate holds. */
export function visibleFields(section: SpecSectionDef, values: Record<string, unknown>): SpecFieldDef[] {
    return section.fields.filter((f) => evaluateCondition(f.when, values));
}

export interface SpecProgress {
    set: number;
    total: number;
}

/** How many of a section's visible fields have a value. */
export function sectionProgress(section: SpecSectionDef, values: Record<string, unknown>): SpecProgress {
    const fields = visibleFields(section, values);
    return { set: fields.filter((f) => isFieldSet(f, values)).length, total: fields.length };
}

/** Progress over every section in play (gate met, optional ones switched on). */
export function specProgress(
    sections: SpecSectionDef[],
    values: Record<string, unknown>,
    activeSections: Set<string>,
): SpecProgress {
    let set = 0;
    let total = 0;
    for (const section of sections) {
        if (!evaluateCondition(section.when, values)) continue;
        if (section.optional && !activeSections.has(section.title)) continue;
        const progress = sectionProgress(section, values);
        set += progress.set;
        total += progress.total;
    }
    return { set, total };
}

export interface CapabilityFinding {
    row: CapabilityRow;
    board: number;
}

export interface CapabilityCheckResult {
    /** Rows where the board's value is below the process minimum. */
    findings: CapabilityFinding[];
    /** Rows that had both a minimum and a board value to compare. */
    compared: number;
}

/**
 * Compare the board's extracted rules with a process's minimums. Display only:
 * a row counts when it has a minimum and a numeric board value, and is a finding
 * when the board is below that minimum. Nothing here blocks anything.
 */
export function checkCapabilities(
    rows: CapabilityRow[],
    boardRules: Record<string, unknown> | null,
): CapabilityCheckResult {
    const findings: CapabilityFinding[] = [];
    let compared = 0;
    if (!boardRules) return { findings, compared };
    for (const row of rows) {
        if (!row.kicad || row.value === undefined) continue;
        const raw = boardRules[row.key];
        if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") continue;
        const board = Number(raw);
        if (!Number.isFinite(board)) continue;
        compared += 1;
        if (board < row.value) findings.push({ row, board });
    }
    return { findings, compared };
}
