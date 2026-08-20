/**
 * Schematic label instances used by the Selection inspector Next/Prev control.
 *
 * The viewer indexes every global, net, and hierarchical label by text. Prism
 * then keeps one kind at a time so a GND global does not mix with a local net
 * label that happens to share the same name.
 */

export type LabelInstanceKind = "global" | "net" | "hierarchical";

export interface LabelInstanceRef {
    uuid: string;
    sheet: string;
    name: string;
    kind?: LabelInstanceKind;
}

/**
 * Pick the instance set that matches how the net was selected.
 *
 * Global labels stay global-only. Net labels stay net-only and are not limited
 * to the current sheet. Wire clicks and search hits have no label item type, so
 * we keep whichever kind actually has multiple occurrences.
 */
export function filterLabelInstances(
    all: LabelInstanceRef[],
    itemType: string | undefined,
): LabelInstanceRef[] {
    const type = (itemType || "").toLowerCase();
    const globals = all.filter((instance) => instance.kind === "global");
    const nets = all.filter((instance) => instance.kind === "net");

    if (type === "global-label") return globals;
    if (type === "label") return nets;

    if (nets.length >= 2 && nets.length >= globals.length) return nets;
    if (globals.length >= 2) return globals;
    return nets.length ? nets : globals;
}

/**
 * List rows are sheet names. When two labels share a sheet, append an ordinal
 * so Next/Prev and the instance list stay distinguishable.
 */
export function labelInstanceListLabel(
    instance: LabelInstanceRef,
    instances: LabelInstanceRef[],
): string {
    const sameSheet = instances.filter((other) => other.sheet === instance.sheet);
    if (sameSheet.length <= 1) return instance.sheet;
    const ordinal = sameSheet.findIndex((other) => other.uuid === instance.uuid) + 1;
    return `${instance.sheet} · ${ordinal}`;
}
