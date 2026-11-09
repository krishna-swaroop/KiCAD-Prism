import { useEffect, useMemo, useState } from "react";
import { referenceFor } from "./comparison-change-facts";
import type { ComparisonSelection } from "./comparison-selection-bridge";
import type {
    ChangeItem,
    KiCadDocumentDiff,
    KiCadProjectDiffBundle,
    SourceFileRef,
} from "./types";
import { fetchApi } from "@/lib/api";
import { isAbortError } from "@/lib/jobs";

export type ComparisonDomain = "schematic" | "pcb";
export type ViewerBlobSource = { filename: string; content: string };

function rootSchematicPath(files: SourceFileRef[]): string {
    const project = files.find((file) => file.path.endsWith(".kicad_pro"));
    if (project) {
        const expected = project.path.replace(/\.kicad_pro$/, ".kicad_sch");
        if (files.some((file) => file.path === expected)) return expected;
    }
    return files.find((file) => file.path.endsWith(".kicad_sch"))?.path
        ?? "root.kicad_sch";
}

export function sourceNameForDomain(
    domain: ComparisonDomain,
    files: SourceFileRef[],
): string {
    if (domain === "schematic") return rootSchematicPath(files);
    return files.find((file) => file.path.endsWith(".kicad_pcb"))?.path
        ?? "board.kicad_pcb";
}

function encodeAssetPath(path: string): string {
    return path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
}

export function revisionSourceKey(
    projectId: string,
    commit: string,
    domain: ComparisonDomain,
): string {
    return `${projectId}:${commit}:${domain}`;
}

export function useRevisionSources(
    projectId: string,
    domain: ComparisonDomain,
    commit: string,
    files: SourceFileRef[],
) {
    const [sources, setSources] = useState<ViewerBlobSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resolvedKey, setResolvedKey] = useState<string | null>(null);
    const requestKey = revisionSourceKey(projectId, commit, domain);
    const rootName = useMemo(
        () => sourceNameForDomain(domain, files),
        [domain, files],
    );

    // Every await boundary checks `cancelled`, and cleanup flips it before
    // aborting the fetches. Promise.allSettled obscures that guard from the
    // scanner, but no stale request can reach a setter.
    // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        let cancelled = false;
        setResolvedKey(null);
        setSources([]);
        setLoading(true);
        setError(null);

        void (async () => {
            try {
                const root = `/api/projects/${projectId}`;
                const query = `commit=${encodeURIComponent(commit)}`;
                const supportResponse = await fetchApi(
                    `${root}/viewer/support-files?${query}`,
                    { signal },
                );
                const support: ViewerBlobSource[] = supportResponse.ok
                    ? ((await supportResponse.json()) as {
                          files?: ViewerBlobSource[];
                      }).files ?? []
                    : [];
                if (cancelled) return;
                const extension =
                    domain === "pcb" ? ".kicad_pcb" : ".kicad_sch";
                const sourcePaths = [...new Set(
                    files.flatMap((file) => (
                        file.path.endsWith(extension) ? [file.path] : []
                    )),
                )];
                if (!sourcePaths.includes(rootName)) {
                    sourcePaths.unshift(rootName);
                }
                const settled = await Promise.allSettled(
                    sourcePaths.map(async (path) => {
                        const response = await fetchApi(
                            `${root}/asset/${encodeAssetPath(path)}?${query}`,
                            { signal },
                        );
                        if (!response.ok) {
                            throw new Error(
                                `${path} failed (${response.status})`,
                            );
                        }
                        return {
                            filename: path,
                            content: await response.text(),
                        };
                    }),
                );
                if (cancelled) return;
                const collected = settled.flatMap((item) =>
                    item.status === "fulfilled" ? [item.value] : []
                );
                const hasRoot = collected.some(
                    (source) => source.filename === rootName,
                );
                // Missing-doc revisions are an explicit empty state for the host,
                // not a hard failure — the other side may still paint.
                collected.push(...support);
                if (cancelled) return;
                setSources(collected);
                if (!hasRoot) setError(null);
            } catch (caught) {
                if (!cancelled && !isAbortError(caught)) {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : "Failed to load revision",
                    );
                }
            } finally {
                if (!cancelled) {
                    setResolvedKey(requestKey);
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
        // `files` is intentionally NOT a dependency. For a fixed commit the source
        // list is fixed, but the parent re-creates the `files` array on most
        // renders, giving it a new identity each time. Including it re-ran this
        // effect on every render; each re-run aborted the in-flight fetch before
        // its `finally` could set `resolvedKey`, so `isCurrent` stayed false and
        // `loading` was reported true forever — the comparison hung at "Preparing
        // native comparison…" with no error. `requestKey` (projectId:commit:domain)
        // already captures every input that changes what is fetched.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commit, domain, projectId, requestKey, rootName]);

    const isCurrent = resolvedKey === requestKey;
    return {
        sources: isCurrent ? sources : [],
        loading: loading || !isCurrent,
        error: isCurrent ? error : null,
        rootName,
    };
}

export function selectedChanges(
    selection: ComparisonSelection,
    groups: Array<{ id: string; changes: ChangeItem[] }>,
): ChangeItem[] {
    if (!selection) return [];
    const selectedGroup = groups.find((group) => group.id === selection.id);
    if (selection.kind === "group") return selectedGroup?.changes ?? [];
    if (selection.kind === "instance") {
        return (selectedGroup?.changes ?? []).filter(
            (change) => referenceFor(change) === selection.reference,
        );
    }
    return groups.flatMap((group) => (
        group.changes.filter((change) => change.id === selection.id)
    ));
}

export function resolveSelectedDocument(
    domain: ComparisonDomain,
    documentDiff: KiCadProjectDiffBundle,
    changes: ChangeItem[],
    preferredPath?: string | null,
): KiCadDocumentDiff | null {
    const expectedType = domain === "pcb" ? "kicad_pcb" : "kicad_sch";
    const selectedPath = preferredPath ?? changes
        .map((change) => documentDiff.navigation[change.id]?.documentPath)
        .find(Boolean);
    return (
        documentDiff.project.documents.find(
            (document) => document.path === selectedPath,
        )
        ?? documentDiff.project.documents.find(
            (document) => document.docType === expectedType,
        )
        ?? null
    );
}
