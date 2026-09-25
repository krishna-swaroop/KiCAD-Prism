import type {
    EcadDocumentComparisonPreparation,
} from "@/types/ecad-viewer";
import type {
    ChangeItem,
    KiCadProjectDiffBundle,
} from "./types";

export type ComparisonSelection =
    | { kind: "item" | "group"; id: string; documentPath?: string }
    | {
        kind: "instance";
        /** The authored-decision group this designator belongs to. */
        id: string;
        reference: string;
        documentPath?: string;
    }
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
        // A semantic item owns every native object it resolved: a net is
        // all of its wires, labels and junctions, a route is all of its
        // segments. `changeId` is only the first of those, so selecting on
        // it alone highlights one fragment of the wire the reviewer picked.
        return documents.flatMap((document) => (
            document.documentPath === preparation.document.path
                ? (document.changeIds ?? [document.changeId])
                : []
        ));
    });

    const ids = [...new Set(changeIds.filter(Boolean))];
    if (!ids.length) return null;
    if (selection?.kind === "group" || ids.length > 1) {
        return { kind: "changes", ids };
    }

    return { kind: "change", id: ids[0]! };
}
