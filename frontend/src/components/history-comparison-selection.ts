export interface RevisionRef {
    sha: string;
    label: string;
    kind: "commit" | "release";
}

export function selectRevisionSlot(
    base: RevisionRef | null,
    compare: RevisionRef | null,
    slot: "base" | "compare",
    revision: RevisionRef,
): { base: RevisionRef | null; compare: RevisionRef | null } {
    if (slot === "base") {
        return compare?.sha === revision.sha
            ? { base, compare }
            : { base: revision, compare };
    }
    return base?.sha === revision.sha
        ? { base, compare }
        : { base, compare: revision };
}
