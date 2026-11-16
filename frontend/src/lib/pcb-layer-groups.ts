import type { EcadPcbLayerState } from "@/types/ecad-viewer";

/**
 * Board layers grouped by what they are physically, in stack order, the way
 * fabrication-oriented tools present them: copper first, then the coatings
 * that sit on it, then the mechanical and documentation layers.
 *
 * Grouping and labels are display only. Every host call still takes the
 * canonical KiCad name (`F.Cu`, `User.3`), which each row keeps as `name`.
 */
export type PcbLayerGroupId =
    | "copper"
    | "mask"
    | "paste"
    | "silkscreen"
    | "adhesive"
    | "mechanical"
    | "fabrication"
    | "documentation"
    | "other";

export interface PcbLayerGroup {
    id: PcbLayerGroupId;
    label: string;
    layers: PcbLayerRow[];
}

export interface PcbLayerRow {
    layer: EcadPcbLayerState;
    /** What the row reads as: the board's own name for the layer, else a plain one. */
    label: string;
    /** The KiCad name, shown next to the label when the two differ. */
    canonical: string | null;
}

const GROUP_LABELS: Record<PcbLayerGroupId, string> = {
    copper: "Copper",
    mask: "Solder mask",
    paste: "Solder paste",
    silkscreen: "Silkscreen",
    adhesive: "Adhesive",
    mechanical: "Mechanical",
    fabrication: "Fabrication",
    documentation: "Documentation",
    other: "Other",
};

const GROUP_ORDER: readonly PcbLayerGroupId[] = [
    "copper",
    "mask",
    "paste",
    "silkscreen",
    "adhesive",
    "mechanical",
    "fabrication",
    "documentation",
    "other",
];

const SIDE_GROUPS: Record<string, PcbLayerGroupId> = {
    Mask: "mask",
    Paste: "paste",
    SilkS: "silkscreen",
    Adhes: "adhesive",
};

const FIXED: Record<string, [PcbLayerGroupId, string]> = {
    "Edge.Cuts": ["mechanical", "Board outline"],
    Margin: ["mechanical", "Margin"],
    "F.CrtYd": ["mechanical", "Top courtyard"],
    "B.CrtYd": ["mechanical", "Bottom courtyard"],
    "F.Fab": ["fabrication", "Top"],
    "B.Fab": ["fabrication", "Bottom"],
    "Dwgs.User": ["documentation", "Drawings"],
    "Cmts.User": ["documentation", "Comments"],
    "Eco1.User": ["documentation", "Eco 1"],
    "Eco2.User": ["documentation", "Eco 2"],
};

/** Group and plain label for a canonical KiCad layer name. */
export function classifyPcbLayer(name: string): [PcbLayerGroupId, string] {
    if (name === "F.Cu") return ["copper", "Top"];
    if (name === "B.Cu") return ["copper", "Bottom"];
    const inner = /^In(\d+)\.Cu$/.exec(name);
    if (inner) return ["copper", `Inner ${inner[1]}`];

    const sided = /^([FB])\.(Mask|Paste|SilkS|Adhes)$/.exec(name);
    if (sided) {
        return [SIDE_GROUPS[sided[2]!]!, sided[1] === "F" ? "Top" : "Bottom"];
    }

    const fixed = FIXED[name];
    if (fixed) return fixed;

    const user = /^User\.(\d+)$/.exec(name);
    if (user) return ["documentation", `User ${user[1]}`];

    return ["other", name];
}

/**
 * The layers the viewer reports, grouped. Order inside a group is the
 * viewer's (copper top to bottom); empty groups are left out.
 */
export function groupPcbLayers(
    layers: readonly (EcadPcbLayerState & { userName?: string })[],
): PcbLayerGroup[] {
    const groups = new Map<PcbLayerGroupId, PcbLayerRow[]>();
    for (const layer of layers) {
        const [id, plain] = classifyPcbLayer(layer.name);
        const label = layer.userName?.trim() || plain;
        const row: PcbLayerRow = {
            layer,
            label,
            canonical: label === layer.name ? null : layer.name,
        };
        const rows = groups.get(id);
        if (rows) rows.push(row);
        else groups.set(id, [row]);
    }
    return GROUP_ORDER.flatMap((id) => {
        const rows = groups.get(id);
        return rows ? [{ id, label: GROUP_LABELS[id], layers: rows }] : [];
    });
}

/** Which board side the visible layers show: only top, only bottom, or neither. */
export function pcbVisibleSide(
    layers: readonly EcadPcbLayerState[],
): "top" | "bottom" | null {
    const visible = layers.filter((layer) => layer.visible && layer.name !== "Edge.Cuts");
    if (!visible.length) return null;
    if (visible.every((layer) => layer.name.startsWith("F."))) return "top";
    if (visible.every((layer) => layer.name.startsWith("B."))) return "bottom";
    return null;
}
