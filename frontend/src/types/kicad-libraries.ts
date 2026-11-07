export type FetchState = "pending" | "fetching" | "ready" | "failed";
export type UpdatePolicy = "follow" | "pinned";

/**
 * A KiCad path library as the server reports it.
 *
 * `ready` is whether it serves a version now (the disk decides); `state` is the
 * last fetch's report. `servedCommit` is what is bound, `remoteCommit` what the
 * last check saw the ref at. `etag` goes back as `If-Match` on every write.
 */
export interface KicadLibrary {
    name: string;
    kind: "git" | "path";
    variables: string[];
    git: string;
    ref: string;
    subdir: string;
    path: string;
    updatePolicy: UpdatePolicy;
    pinnedCommit: string;
    checkIntervalSeconds: number;
    lastCheckedAt: string | null;
    lastCheckError: string | null;
    remoteCommit: string;
    fetchedCommit: string;
    servedCommit: string;
    state: FetchState;
    error: string | null;
    progress: number | null;
    sizeBytes: number | null;
    fetchedAt: string | null;
    updatedBy: string;
    ready: boolean;
    /** Why a declared library is out of service (its address no longer passes the server's rules); null when it is in service. */
    problem: string | null;
    /** Variables the server's environment sets, so this library does not bind them. */
    overriddenVariables: string[];
    etag: string;
    projectsUsing: number;
}

/** A variable some project's boards name, and whether anything on the server defines it. */
export interface VariableUsage {
    variable: string;
    projects: number;
    models: number;
    sheets: number;
    bound: boolean;
}

export interface KicadLibraryList {
    libraries: KicadLibrary[];
    usage: VariableUsage[];
    pathLibrariesEnabled: boolean;
    checkIntervals: number[];
}

export interface LibraryVersion {
    commit: string;
    ref: string;
    fetchedAt: string;
    requestedBy: string;
    serving: boolean;
}

export interface NewKicadLibrary {
    name: string;
    variables: string[];
    git?: string;
    ref?: string;
    subdir?: string;
    path?: string;
    updatePolicy?: UpdatePolicy;
    checkIntervalSeconds?: number;
}

export interface KicadLibraryChanges {
    variables?: string[];
    ref?: string;
    subdir?: string;
    updatePolicy?: UpdatePolicy;
    checkIntervalSeconds?: number;
}

export interface RemoteCheckResult {
    reachable: boolean;
    error: string | null;
    defaultBranch: string | null;
    tags: string[];
    branches: string[];
    refFound: boolean | null;
}

export interface LibraryCheckResult {
    library: KicadLibrary;
    remoteCommit: string;
    moved: boolean;
    queued: boolean;
    error: string | null;
}
