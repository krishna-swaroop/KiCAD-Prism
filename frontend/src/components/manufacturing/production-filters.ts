import { ALL_RUN_STATUSES, type ManufacturingRun, type RunStatus } from "@/types/manufacturing";

/** "active" is every run still going (not closed, not cancelled); the rest are one status each. */
export type StatusFilter = "active" | RunStatus | "all";
export type GroupBy = "none" | "project" | "date" | "manufacturer";
export type SortKey = "updated" | "created" | "job";

export interface ProductionFilters {
    status: StatusFilter;
    query: string;
    /** Only runs that still have an open defect. */
    openDefectsOnly: boolean;
    group: GroupBy;
    sort: SortKey;
}

export const DEFAULT_FILTERS: ProductionFilters = {
    status: "active",
    query: "",
    openDefectsOnly: false,
    group: "none",
    sort: "updated",
};

export const GROUP_LABELS: Record<GroupBy, string> = {
    none: "No grouping",
    project: "Project",
    date: "Date",
    manufacturer: "Manufacturer",
};

export const SORT_LABELS: Record<SortKey, string> = {
    updated: "Recently updated",
    created: "Newest first",
    job: "Job number",
};

/** The board a run is for: the .kicad_pcb name, else the board's sub-path, else a dash. */
export function boardName(run: ManufacturingRun): string {
    if (run.pcb_rel) {
        const base = run.pcb_rel.split(/[\\/]/).pop() ?? run.pcb_rel;
        return base.replace(/\.kicad_pcb$/i, "");
    }
    if (run.relative_path && run.relative_path !== ".") return run.relative_path;
    return "—";
}

/** A run still in progress: neither finished nor called off. */
export function isActiveStatus(status: RunStatus): boolean {
    return status !== "closed" && status !== "cancelled";
}

function matchesStatus(run: ManufacturingRun, status: StatusFilter): boolean {
    if (status === "all") return true;
    if (status === "active") return isActiveStatus(run.status);
    return run.status === status;
}

function matchesQuery(run: ManufacturingRun, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const haystack = [
        run.job_number,
        run.project_name,
        run.project_id,
        boardName(run),
        run.manufacturer_name,
        run.spec_name,
        run.release_tag,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return haystack.includes(needle);
}

/** Counts for the status chips. They ignore the status filter itself but honour the rest. */
export function statusCounts(
    runs: ManufacturingRun[],
    filters: Pick<ProductionFilters, "query" | "openDefectsOnly">,
): Record<StatusFilter, number> {
    const counts = { active: 0, all: 0 } as Record<StatusFilter, number>;
    for (const status of ALL_RUN_STATUSES) counts[status] = 0;
    for (const run of runs) {
        if (!matchesQuery(run, filters.query)) continue;
        if (filters.openDefectsOnly && !(run.open_defect_count && run.open_defect_count > 0)) continue;
        counts.all += 1;
        counts[run.status] += 1;
        if (isActiveStatus(run.status)) counts.active += 1;
    }
    return counts;
}

const timeOf = (iso: string | undefined) => {
    const t = new Date(iso ?? "").getTime();
    return Number.isNaN(t) ? 0 : t;
};

export function applyFilters(runs: ManufacturingRun[], filters: ProductionFilters): ManufacturingRun[] {
    const kept = runs.filter(
        (run) =>
            matchesStatus(run, filters.status) &&
            matchesQuery(run, filters.query) &&
            (!filters.openDefectsOnly || (run.open_defect_count ?? 0) > 0),
    );
    return [...kept].sort((a, b) => {
        if (filters.sort === "job") return (b.job_number ?? "").localeCompare(a.job_number ?? "");
        if (filters.sort === "created") return timeOf(b.created_at) - timeOf(a.created_at);
        return timeOf(b.updated_at) - timeOf(a.updated_at);
    });
}

export interface RunGroup {
    key: string;
    label: string;
    runs: ManufacturingRun[];
}

/**
 * Split runs into labelled groups, each group keeping the runs' existing order.
 * Groups are ordered sensibly: dates newest first, names A to Z.
 */
export function groupRuns(runs: ManufacturingRun[], by: GroupBy): RunGroup[] {
    if (by === "none") return [{ key: "all", label: "", runs }];

    const keyOf = (r: ManufacturingRun): { key: string; label: string } => {
        if (by === "project") {
            const label = r.project_name || r.project_id;
            return { key: label, label };
        }
        if (by === "manufacturer") {
            const label = r.manufacturer_name || "No manufacturer";
            return { key: label, label };
        }
        // date: group by calendar day.
        const d = new Date(r.created_at);
        const key = Number.isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 10);
        const label = Number.isNaN(d.getTime()) ? "Unknown date" : d.toLocaleDateString();
        return { key, label };
    };

    const map = new Map<string, RunGroup>();
    for (const run of runs) {
        const { key, label } = keyOf(run);
        const existing = map.get(key);
        if (existing) existing.runs.push(run);
        else map.set(key, { key, label, runs: [run] });
    }
    const groups = [...map.values()];
    groups.sort((a, b) => (by === "date" ? b.key.localeCompare(a.key) : a.label.localeCompare(b.label)));
    return groups;
}

/** Read filters back from a URL query, ignoring anything unknown. */
export function filtersFromParams(params: URLSearchParams): ProductionFilters {
    const status = params.get("status");
    const group = params.get("group");
    const sort = params.get("sort");
    const valid = (v: string | null, allowed: string[]) => (v && allowed.includes(v) ? v : null);
    return {
        status: (valid(status, ["active", "all", ...ALL_RUN_STATUSES]) as StatusFilter | null) ?? DEFAULT_FILTERS.status,
        query: params.get("q") ?? "",
        openDefectsOnly: params.get("defects") === "open",
        group: (valid(group, Object.keys(GROUP_LABELS)) as GroupBy | null) ?? DEFAULT_FILTERS.group,
        sort: (valid(sort, Object.keys(SORT_LABELS)) as SortKey | null) ?? DEFAULT_FILTERS.sort,
    };
}

/** Write filters onto a query, leaving defaults out so the URL stays short. */
export function filtersToParams(params: URLSearchParams, filters: ProductionFilters): URLSearchParams {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string, isDefault: boolean) => {
        if (isDefault || !value) next.delete(key);
        else next.set(key, value);
    };
    set("status", filters.status, filters.status === DEFAULT_FILTERS.status);
    set("q", filters.query.trim(), false);
    set("defects", "open", !filters.openDefectsOnly);
    set("group", filters.group, filters.group === DEFAULT_FILTERS.group);
    set("sort", filters.sort, filters.sort === DEFAULT_FILTERS.sort);
    return next;
}
