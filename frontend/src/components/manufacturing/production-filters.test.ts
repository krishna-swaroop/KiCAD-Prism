import { describe, expect, it } from "vitest";

import {
    DEFAULT_FILTERS,
    applyFilters,
    boardName,
    filtersFromParams,
    filtersToParams,
    groupRuns,
    isActiveStatus,
    statusCounts,
} from "./production-filters";
import { makeRun } from "./test-fixtures";

const RUNS = [
    makeRun({ id: "a", job_number: "JOB-0001", status: "draft", updated_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }),
    makeRun({ id: "b", job_number: "JOB-0002", status: "in_production", manufacturer_name: "Beta Fab", open_defect_count: 2, updated_at: "2026-03-01T00:00:00Z", created_at: "2026-02-01T00:00:00Z" }),
    makeRun({ id: "c", job_number: "JOB-0003", status: "closed", project_name: "Radio", updated_at: "2026-02-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }),
    makeRun({ id: "d", job_number: "JOB-0004", status: "received", release_tag: "v1.2", updated_at: "2026-01-15T00:00:00Z", created_at: "2026-01-15T00:00:00Z" }),
    makeRun({ id: "e", job_number: "JOB-0005", status: "cancelled", updated_at: "2026-04-01T00:00:00Z", created_at: "2026-04-01T00:00:00Z" }),
];

const ids = (runs: { id: string }[]) => runs.map((r) => r.id);

describe("applyFilters", () => {
    it("defaults to the active runs, newest update first, leaving out closed and cancelled", () => {
        expect(ids(applyFilters(RUNS, DEFAULT_FILTERS))).toEqual(["b", "d", "a"]);
    });

    it("filters by one status, or shows everything including cancelled", () => {
        expect(ids(applyFilters(RUNS, { ...DEFAULT_FILTERS, status: "closed" }))).toEqual(["c"]);
        expect(ids(applyFilters(RUNS, { ...DEFAULT_FILTERS, status: "cancelled" }))).toEqual(["e"]);
        expect(ids(applyFilters(RUNS, { ...DEFAULT_FILTERS, status: "all" }))).toHaveLength(5);
    });

    it("searches job, project, manufacturer, process and release, ignoring case", () => {
        const all = { ...DEFAULT_FILTERS, status: "all" as const };
        expect(ids(applyFilters(RUNS, { ...all, query: "job-0003" }))).toEqual(["c"]);
        expect(ids(applyFilters(RUNS, { ...all, query: "RADIO" }))).toEqual(["c"]);
        expect(ids(applyFilters(RUNS, { ...all, query: "beta" }))).toEqual(["b"]);
        expect(ids(applyFilters(RUNS, { ...all, query: "v1.2" }))).toEqual(["d"]);
        expect(ids(applyFilters(RUNS, { ...all, query: "standard" }))).toHaveLength(5);
        expect(ids(applyFilters(RUNS, { ...all, query: "nothing" }))).toEqual([]);
    });

    it("can keep only runs with open defects", () => {
        expect(ids(applyFilters(RUNS, { ...DEFAULT_FILTERS, status: "all", openDefectsOnly: true }))).toEqual(["b"]);
    });

    it("sorts by creation or job number", () => {
        const all = { ...DEFAULT_FILTERS, status: "all" as const };
        expect(ids(applyFilters(RUNS, { ...all, sort: "created" }))).toEqual(["e", "c", "b", "d", "a"]);
        expect(ids(applyFilters(RUNS, { ...all, sort: "job" }))).toEqual(["e", "d", "c", "b", "a"]);
    });

    it("does not reorder the input", () => {
        const copy = [...RUNS];
        applyFilters(RUNS, { ...DEFAULT_FILTERS, sort: "job" });
        expect(RUNS).toEqual(copy);
    });
});

describe("statusCounts", () => {
    it("counts each status, the active total and all", () => {
        const counts = statusCounts(RUNS, { query: "", openDefectsOnly: false });
        expect(counts).toMatchObject({
            all: 5, active: 3, draft: 1, ordered: 0, in_production: 1, received: 1, closed: 1, cancelled: 1,
        });
    });

    it("honours search and the defects toggle but not the status filter", () => {
        expect(statusCounts(RUNS, { query: "beta", openDefectsOnly: false })).toMatchObject({ all: 1, in_production: 1, draft: 0 });
        expect(statusCounts(RUNS, { query: "", openDefectsOnly: true })).toMatchObject({ all: 1, active: 1 });
    });
});

describe("groupRuns", () => {
    it("returns one unlabelled group when not grouping", () => {
        expect(groupRuns(RUNS, "none")).toEqual([{ key: "all", label: "", runs: RUNS }]);
    });

    it("groups by project A to Z, by manufacturer, and by date newest first", () => {
        expect(groupRuns(RUNS, "project").map((g) => g.label)).toEqual(["Board One", "Radio"]);
        expect(groupRuns(RUNS, "manufacturer").map((g) => g.label)).toEqual(["Acme Fab", "Beta Fab"]);
        const byDate = groupRuns(RUNS, "date").map((g) => g.key);
        expect(byDate).toEqual([...byDate].sort().reverse());
    });
});

describe("isActiveStatus", () => {
    it("is true only for runs still going", () => {
        expect(["draft", "ordered", "in_production", "received"].every((s) => isActiveStatus(s as never))).toBe(true);
        expect(isActiveStatus("closed")).toBe(false);
        expect(isActiveStatus("cancelled")).toBe(false);
    });
});

describe("boardName", () => {
    it("prefers the pcb file name, then the sub-path, then a dash", () => {
        expect(boardName(makeRun({ pcb_rel: "boards/radio.kicad_pcb" }))).toBe("radio");
        expect(boardName(makeRun({ pcb_rel: null, relative_path: "sub/board" }))).toBe("sub/board");
        expect(boardName(makeRun({ pcb_rel: null, relative_path: "." }))).toBe("—");
    });
});

describe("URL round trip", () => {
    it("leaves defaults out of the query", () => {
        expect(filtersToParams(new URLSearchParams("section=manufacturing"), DEFAULT_FILTERS).toString()).toBe(
            "section=manufacturing",
        );
    });

    it("writes and reads every filter, keeping unrelated params", () => {
        const filters = { status: "closed" as const, query: " rf ", openDefectsOnly: true, group: "project" as const, sort: "job" as const };
        const params = filtersToParams(new URLSearchParams("section=manufacturing&run=r1"), filters);
        expect(params.get("section")).toBe("manufacturing");
        expect(params.get("run")).toBe("r1");
        expect(filtersFromParams(params)).toEqual({ ...filters, query: "rf" });
    });

    it("round trips the cancelled filter", () => {
        const params = filtersToParams(new URLSearchParams(), { ...DEFAULT_FILTERS, status: "cancelled" });
        expect(params.get("status")).toBe("cancelled");
        expect(filtersFromParams(params).status).toBe("cancelled");
    });

    it("ignores unknown values", () => {
        expect(filtersFromParams(new URLSearchParams("status=bogus&group=x&sort=y"))).toEqual(DEFAULT_FILTERS);
    });
});
