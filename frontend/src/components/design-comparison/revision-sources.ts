import { useEffect, useMemo, useState } from "react";
import type {
    ChangeItem,
    KiCadDocumentDiff,
    KiCadProjectDiffBundle,
    SourceFileRef,
} from "./types";

export type ComparisonDomain = "schematic" | "pcb";
export type ViewerBlobSource = { filename: string; content: string };

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

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

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        setResolvedKey(null);
        setSources([]);
        setLoading(true);
        setError(null);

        void (async () => {
            try {
                const root = `/api/projects/${projectId}`;
                const query = `commit=${encodeURIComponent(commit)}`;
                const supportResponse = await fetch(
                    `${root}/viewer/support-files?${query}`,
                    { signal },
                );
                const support: ViewerBlobSource[] = supportResponse.ok
                    ? ((await supportResponse.json()) as {
                          files?: ViewerBlobSource[];
                      }).files ?? []
                    : [];
                const extension =
                    domain === "pcb" ? ".kicad_pcb" : ".kicad_sch";
                const sourcePaths = [...new Set(
                    files
                        .map((file) => file.path)
                        .filter((path) => path.endsWith(extension)),
                )];
                if (!sourcePaths.includes(rootName)) {
                    sourcePaths.unshift(rootName);
                }
                const settled = await Promise.allSettled(
                    sourcePaths.map(async (path) => {
                        const response = await fetch(
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
                const collected = settled.flatMap((item) =>
                    item.status === "fulfilled" ? [item.value] : []
                );
                const hasRoot = collected.some(
                    (source) => source.filename === rootName,
                );
                // Missing-doc revisions are an explicit empty state for the host,
                // not a hard failure — the other side may still paint.
                if (!hasRoot) {
                    collected.push(...support);
                    if (!signal.aborted) {
                        setSources(collected);
                        setError(null);
                    }
                    return;
                }
                collected.push(...support);
                if (!signal.aborted) setSources(collected);
            } catch (caught) {
                if (!signal.aborted && !isAbortError(caught)) {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : "Failed to load revision",
                    );
                }
            } finally {
                if (!signal.aborted) {
                    setResolvedKey(requestKey);
                    setLoading(false);
                }
            }
        })();
        return () => controller.abort();
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
    selection: { kind: "item" | "group"; id: string } | null,
    groups: Array<{ id: string; changes: ChangeItem[] }>,
): ChangeItem[] {
    if (!selection) return [];
    if (selection.kind === "group") {
        return (
            groups.find((group) => group.id === selection.id)?.changes ?? []
        );
    }
    return groups
        .flatMap((group) => group.changes)
        .filter((change) => change.id === selection.id);
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

export type SideBySideFocusTarget = {
    page?: string | null;
    baseBounds?: [number, number, number, number];
    compareBounds?: [number, number, number, number];
    baseUuid?: string | null;
    compareUuid?: string | null;
};

function validBounds(
    bounds?: [number, number, number, number] | null,
): bounds is [number, number, number, number] {
    return Boolean(
        bounds
        && bounds.length === 4
        && bounds.every((value) => Number.isFinite(value))
        && (bounds[2] > 0 || bounds[3] > 0),
    );
}

function unionBounds(
    boundsList: Array<[number, number, number, number]>,
): [number, number, number, number] | undefined {
    if (!boundsList.length) return undefined;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y, w, h] of boundsList) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return undefined;
    return [minX, minY, Math.max(maxX - minX, 0), Math.max(maxY - minY, 0)];
}

/** Map selected semantic changes to dual-pane focus targets (world mm). */
export function resolveSideBySideFocus(
    changes: ChangeItem[],
): SideBySideFocusTarget | null {
    if (!changes.length) return null;

    const baseBoundsList: Array<[number, number, number, number]> = [];
    const compareBoundsList: Array<[number, number, number, number]> = [];
    let baseUuid: string | null | undefined;
    let compareUuid: string | null | undefined;
    let page: string | null | undefined;

    for (const change of changes) {
        page = page
            ?? change.page
            ?? change.geometry?.page
            ?? change.oldGeometry?.page
            ?? change.compare_item?.page
            ?? change.base_item?.page;

        // Both panes show the same board in the same world coordinates, so a
        // change that exists on only one side still names an area on the other.
        // Selecting an addition used to leave the base pane wherever it was,
        // which is the one moment you most want to see what used to be there.
        // Each side falls back to the other side's geometry for that reason.
        const baseBounds = change.oldGeometry?.bounds ?? change.geometry?.bounds;
        const compareBounds = change.geometry?.bounds ?? change.oldGeometry?.bounds;
        if (validBounds(baseBounds)) baseBoundsList.push(baseBounds);
        if (validBounds(compareBounds)) compareBoundsList.push(compareBounds);

        // Identity does not cross over the way position does: an added object
        // has no base-side counterpart to select, and asking a viewer to select
        // an id it does not have would clear the selection it already shows.
        if (change.kind !== "added") {
            baseUuid = baseUuid
                ?? change.source_id_base
                ?? change.base_item?.source_id
                ?? change.uuid
                ?? null;
        }
        if (change.kind !== "removed") {
            compareUuid = compareUuid
                ?? change.source_id_compare
                ?? change.compare_item?.source_id
                ?? change.uuid
                ?? null;
        }
    }

    return {
        page: page ?? null,
        baseBounds: unionBounds(baseBoundsList),
        compareBounds: unionBounds(compareBoundsList),
        baseUuid: baseUuid ?? null,
        compareUuid: compareUuid ?? null,
    };
}
