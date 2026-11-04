import type { KicadLibrary, UpdatePolicy } from "@/types/kicad-libraries";

export interface LibraryStatus {
    label: string;
    variant: "success" | "warning" | "destructive" | "outline";
}

const SHORT = 8;

/** Values a new library starts with: a variable a board names, or KiCad's stock 3D models. */
export interface LibraryPreset {
    name?: string;
    variables?: string;
    git?: string;
    policy?: UpdatePolicy;
    /** What to tell the administrator before saving. */
    note?: string;
}

/** The stock 3D models are an ordinary library, added after the server is running. */
export const STOCK_3D_VARIABLES = ["KICAD10_3DMODEL_DIR", "KICAD9_3DMODEL_DIR"];
export const STOCK_3D_PRESET: LibraryPreset = {
    name: "kicad-packages3d",
    variables: STOCK_3D_VARIABLES.join(", "),
    git: "https://gitlab.com/kicad/libraries/kicad-packages3d.git",
    policy: "pinned",
    note: "Several gigabytes. Choose the tag that matches the KiCad in your image (for example 10.0.4), and update both together.",
};

export function shortCommit(commit: string): string {
    return commit.slice(0, SHORT);
}

/** A git library the server is still working on: worth polling for. */
export function isFetching(library: KicadLibrary): boolean {
    return library.kind === "git" && (library.state === "fetching" || (!library.ready && library.state === "pending"));
}

/** The remote moved past what is served: an update waits for a follow library's next fetch, or an admin's choice. */
export function updateAvailable(library: KicadLibrary): boolean {
    return library.kind === "git" && library.remoteCommit !== "" && library.servedCommit !== "" && library.remoteCommit !== library.servedCommit;
}

/** What the badge says. The server's `ready` decides, not the fetch's last report. */
export function describeLibrary(library: KicadLibrary): LibraryStatus {
    if (library.problem) return { label: "Not in use", variant: "destructive" };
    if (library.state === "failed") {
        return library.ready ? { label: "Update failed", variant: "warning" } : { label: "Fetch failed", variant: "destructive" };
    }
    if (library.state === "fetching") {
        const label = library.progress === null ? "Fetching" : `Fetching ${library.progress}%`;
        return { label: library.ready ? "Updating" : label, variant: "outline" };
    }
    if (library.ready) {
        return updateAvailable(library) && library.updatePolicy === "pinned"
            ? { label: "Update available", variant: "warning" }
            : { label: "Ready", variant: "success" };
    }
    if (library.kind === "path") return { label: "Folder not found", variant: "warning" };
    if (library.state === "ready") return { label: "Missing from disk", variant: "warning" };
    return { label: "Waiting to fetch", variant: "outline" };
}

const UNITS: [string, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];

/** "2 hours ago", for a time the server recorded. */
export function ago(iso: string | null, now: number = Date.now()): string {
    if (!iso) return "never";
    const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    for (const [unit, size] of UNITS) {
        if (seconds >= size) {
            const count = Math.floor(seconds / size);
            return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
        }
    }
    return "just now";
}

export function intervalLabel(seconds: number): string {
    if (seconds % 604800 === 0) return seconds === 604800 ? "Weekly" : `Every ${seconds / 604800} weeks`;
    if (seconds % 86400 === 0) return seconds === 86400 ? "Daily" : `Every ${seconds / 86400} days`;
    if (seconds % 3600 === 0) return seconds === 3600 ? "Hourly" : `Every ${seconds / 3600} hours`;
    return `Every ${seconds} seconds`;
}

/** One line on where the library stands: what it follows or is pinned at, and the last check. */
export function stateLine(library: KicadLibrary, now: number = Date.now()): string {
    if (library.kind === "path") return library.ready ? "Folder on the server" : "Folder not found under the mount root";
    const served = shortCommit(library.servedCommit);
    if (library.state === "failed") {
        const target = shortCommit(library.updatePolicy === "pinned" ? library.pinnedCommit : library.remoteCommit);
        return library.ready ? `Update${target ? ` to ${target}` : ""} failed, serving ${served}` : "Fetch failed";
    }
    if (library.state === "fetching" && library.ready) return `Updating, serving ${served}`;
    if (library.lastCheckError) return `Check failed: ${library.lastCheckError}`;
    const checked = `checked ${ago(library.lastCheckedAt, now)}`;
    if (library.updatePolicy === "pinned") {
        const pin = shortCommit(library.pinnedCommit || library.servedCommit);
        return updateAvailable(library)
            ? `Pinned at ${pin}, ${library.ref} moved to ${shortCommit(library.remoteCommit)}`
            : `Pinned at ${pin}, ${checked}`;
    }
    return `Following ${library.ref}${served ? `, at ${served}` : ""}, ${checked}`;
}

export function formatBytes(bytes: number | null): string {
    if (bytes === null) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Variable names from free text: commas, spaces or new lines, no duplicates, no `${}`. */
export function parseVariables(text: string): string[] {
    const names = text
        .split(/[\s,]+/)
        .map((part) => part.replace(/^\$\{?|\}$/g, "").trim())
        .filter(Boolean);
    return [...new Set(names)];
}
