import type { SemanticNet } from "@/types/prism-selection";

/**
 * Schematic label instances used by the Selection inspector Next/Prev control.
 *
 * The viewer indexes every global, net, and hierarchical label by text. Prism
 * then keeps one kind at a time so a GND global does not mix with a local net
 * label that happens to share the same name.
 */

export type LabelInstanceKind = "global" | "net" | "hierarchical" | "sheet-pin";

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
 * The label instances that are on `net`: every name the net goes by is looked
 * up, and only uuids the semantic index puts on this net are kept. Global,
 * local and hierarchical labels and sheet entries all count, so following a
 * net crosses into and out of child sheets.
 */
export function netLabelInstances(
    net: SemanticNet,
    lookup: (name: string) => LabelInstanceRef[],
): LabelInstanceRef[] {
    const members = new Set<string>();
    for (const ref of net.schematicRefs ?? []) {
        for (const uuid of ref.labelUuids ?? []) members.add(uuid);
        for (const uuid of ref.junctionUuids ?? []) members.add(uuid);
    }
    const leaf = (name: string) => name.slice(name.lastIndexOf("/") + 1);
    const names = new Set([net.name, ...(net.aliases ?? [])].flatMap((name) => leaf(name) || []));
    const found = new Map<string, LabelInstanceRef>();
    for (const name of names) {
        for (const instance of lookup(name)) {
            if (members.has(instance.uuid)) found.set(instance.uuid, instance);
        }
    }
    return [...found.values()];
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
