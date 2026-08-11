import type {
    EcadDocumentComparisonPreparation,
} from "@/types/ecad-viewer";
import {
    resolveSideBySideFocus,
    type SideBySideFocusTarget,
} from "./revision-sources";
import type {
    ChangeItem,
    KiCadProjectDiffBundle,
} from "./types";

export type ComparisonSelection =
    | { kind: "item" | "group"; id: string; documentPath?: string }
    | null;

export function resolveNativeSelection(
    preparation: EcadDocumentComparisonPreparation,
    documentDiff: KiCadProjectDiffBundle,
    selection: ComparisonSelection,
    changes: ChangeItem[],
):
    | { kind: "change" | "group"; id: string }
    | { kind: "changes"; ids: string[] }
    | null {
    const changeIds = changes.flatMap((change) => {
        const entry = documentDiff.navigation[change.id];
        if (!entry) return [];
        const documents = entry.documents ?? [entry];
        return documents
            .filter(
                (document) =>
                    document.documentPath === preparation.document.path,
            )
            // A semantic item owns every native object it resolved: a net is
            // all of its wires, labels and junctions, a route is all of its
            // segments. `changeId` is only the first of those, so selecting on
            // it alone highlights one fragment of the wire the reviewer picked.
            .flatMap((document) => document.changeIds ?? [document.changeId]);
    });

    const ids = [...new Set(changeIds.filter(Boolean))];
    if (!ids.length) return null;
    if (selection?.kind === "group" || ids.length > 1) {
        return { kind: "changes", ids };
    }

    return { kind: "change", id: ids[0]! };
}

export function resolveComparisonFocus(
    changes: ChangeItem[],
): SideBySideFocusTarget | null {
    return resolveSideBySideFocus(changes);
}
