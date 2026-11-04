import { expect, it } from "vitest";

import type { KicadLibrary } from "@/types/kicad-libraries";

import {
    STOCK_3D_PRESET,
    ago,
    describeLibrary,
    formatBytes,
    intervalLabel,
    isFetching,
    parseVariables,
    stateLine,
    updateAvailable,
} from "./library-status";

const A = "a".repeat(40);
const B = "b".repeat(40);
const NOW = Date.parse("2026-11-04T12:00:00Z");

export const base: KicadLibrary = {
    name: "lsf", kind: "git", variables: ["LSF_KICAD_LIB"], git: "https://example.org/lsf.git", ref: "main", subdir: "", path: "",
    updatePolicy: "follow", pinnedCommit: "", checkIntervalSeconds: 86400, lastCheckedAt: "2026-11-04T10:00:00Z", lastCheckError: null,
    remoteCommit: A, fetchedCommit: A, servedCommit: A, state: "ready", error: null, progress: 100, sizeBytes: null, fetchedAt: null,
    updatedBy: "", ready: true, problem: null, overriddenVariables: [], etag: '"kicad-library:lsf:1"', projectsUsing: 0,
};

it("says ready only when the server says the library serves a version", () => {
    expect(describeLibrary(base)).toEqual({ label: "Ready", variant: "success" });
    expect(describeLibrary({ ...base, ready: false, servedCommit: "" })).toEqual({ label: "Missing from disk", variant: "warning" });
});

it("says a declared library the server no longer accepts is not in use, whatever its last fetch said", () => {
    expect(describeLibrary({ ...base, ready: false, problem: "'github.com' is not an allowed repository host." }))
        .toEqual({ label: "Not in use", variant: "destructive" });
});

it("describes each stage of a fetch", () => {
    const first = { ...base, ready: false, servedCommit: "", fetchedCommit: "", progress: null };
    expect(describeLibrary({ ...first, state: "pending" }).label).toBe("Waiting to fetch");
    expect(describeLibrary({ ...first, state: "fetching" }).label).toBe("Fetching");
    expect(describeLibrary({ ...first, state: "fetching", progress: 42 }).label).toBe("Fetching 42%");
    expect(describeLibrary({ ...first, state: "failed" })).toEqual({ label: "Fetch failed", variant: "destructive" });
});

it("tells a failed update, which keeps serving, from a failed first fetch", () => {
    expect(describeLibrary({ ...base, state: "failed" })).toEqual({ label: "Update failed", variant: "warning" });
    expect(describeLibrary({ ...base, state: "fetching" }).label).toBe("Updating");
});

it("flags a pinned library whose ref moved, and not a following one", () => {
    const moved = { ...base, remoteCommit: B };
    expect(updateAvailable(moved)).toBe(true);
    expect(describeLibrary({ ...moved, updatePolicy: "pinned" })).toEqual({ label: "Update available", variant: "warning" });
    expect(describeLibrary(moved).label).toBe("Ready");
    expect(updateAvailable({ ...base, remoteCommit: "" })).toBe(false);
});

it("tells a missing folder from a pending fetch", () => {
    expect(describeLibrary({ ...base, kind: "path", git: "", ref: "", path: "lsf", ready: false, state: "pending" }).label).toBe("Folder not found");
});

it("polls only for git libraries still being fetched", () => {
    expect(isFetching({ ...base, ready: false, state: "pending" })).toBe(true);
    expect(isFetching({ ...base, state: "fetching" })).toBe(true);
    expect(isFetching(base)).toBe(false);
    expect(isFetching({ ...base, ready: false, state: "failed" })).toBe(false);
    expect(isFetching({ ...base, kind: "path", ready: false, state: "pending" })).toBe(false);
});

it("writes the state line a person reads", () => {
    expect(stateLine(base, NOW)).toBe(`Following main, at ${A.slice(0, 8)}, checked 2 hours ago`);
    expect(stateLine({ ...base, updatePolicy: "pinned", pinnedCommit: A }, NOW)).toBe(`Pinned at ${A.slice(0, 8)}, checked 2 hours ago`);
    expect(stateLine({ ...base, updatePolicy: "pinned", pinnedCommit: A, remoteCommit: B }, NOW)).toBe(
        `Pinned at ${A.slice(0, 8)}, main moved to ${B.slice(0, 8)}`,
    );
    expect(stateLine({ ...base, state: "fetching" }, NOW)).toBe(`Updating, serving ${A.slice(0, 8)}`);
    expect(stateLine({ ...base, state: "failed", remoteCommit: B }, NOW)).toBe(`Update to ${B.slice(0, 8)} failed, serving ${A.slice(0, 8)}`);
    expect(stateLine({ ...base, lastCheckError: "No answer" }, NOW)).toBe("Check failed: No answer");
    expect(stateLine({ ...base, ready: false, state: "failed", servedCommit: "" }, NOW)).toBe("Fetch failed");
    expect(stateLine({ ...base, kind: "path", path: "x" }, NOW)).toBe("Folder on the server");
});

it("says how long ago, and never for a check that did not happen", () => {
    expect(ago(null, NOW)).toBe("never");
    expect(ago("2026-11-04T11:59:40Z", NOW)).toBe("just now");
    expect(ago("2026-11-04T11:00:00Z", NOW)).toBe("1 hour ago");
    expect(ago("2026-11-01T12:00:00Z", NOW)).toBe("3 days ago");
});

it("names the check intervals", () => {
    expect([3600, 21600, 86400, 604800].map(intervalLabel)).toEqual(["Hourly", "Every 6 hours", "Daily", "Weekly"]);
});

it("formats sizes", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(10)).toBe("1 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(4.2 * 1024 ** 3)).toBe("4.2 GB");
});

it("reads variable names from free text", () => {
    expect(parseVariables("LSF_KICAD_LIB, KICAD9_3DMODEL_DIR\nLSF_KICAD_LIB")).toEqual(["LSF_KICAD_LIB", "KICAD9_3DMODEL_DIR"]);
    expect(parseVariables("${LSF_KICAD_LIB}  ${OTHER}")).toEqual(["LSF_KICAD_LIB", "OTHER"]);
    expect(parseVariables(" , ")).toEqual([]);
});

it("offers KiCad's stock 3D models as an ordinary pinned library", () => {
    expect(parseVariables(STOCK_3D_PRESET.variables ?? "")).toEqual(["KICAD10_3DMODEL_DIR", "KICAD9_3DMODEL_DIR"]);
    expect(STOCK_3D_PRESET.policy).toBe("pinned");
    expect(STOCK_3D_PRESET.git).toBe("https://gitlab.com/kicad/libraries/kicad-packages3d.git");
});
