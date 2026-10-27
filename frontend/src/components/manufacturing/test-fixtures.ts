import type { ManufacturingRun, RunDefect } from "@/types/manufacturing";

/** A production with sensible defaults; override what a test cares about. */
export function makeRun(overrides: Partial<ManufacturingRun> = {}): ManufacturingRun {
    return {
        id: "run_1",
        job_number: "JOB-2026-0001",
        project_id: "p1",
        project_name: "Board One",
        manufacturer_id: "m1",
        manufacturer_name: "Acme Fab",
        spec_name: "Standard",
        commit_sha: "",
        release_tag: "",
        quantity_ordered: 100,
        quantity_good: 90,
        status: "received",
        notes: "",
        spec_snapshot: {},
        created_by: "designer@x",
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z",
        defects: [],
        ...overrides,
    };
}

export function makeDefect(overrides: Partial<RunDefect> = {}): RunDefect {
    return {
        id: "def_1",
        run_id: "run_1",
        category: "soldering",
        severity: "major",
        quantity_affected: 5,
        description: "cold joints",
        status: "open",
        resolution_note: "",
        resolved_by: "",
        evidence: [],
        logged_by: "qa@x",
        created_at: "2026-01-03T00:00:00Z",
        resolved_at: null,
        ...overrides,
    };
}
