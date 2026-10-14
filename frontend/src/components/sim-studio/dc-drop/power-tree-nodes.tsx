import { memo, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Cable, ChevronsRight, Cpu, Plug, Waypoints, Zap, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { netLeaf } from "./board-index";
import { NEED_LABELS, NODE_WIDTH, type ElementKind, type TreeElement } from "./power-tree-model";

/**
 * Canvas nodes for the power tree, drawn like the System Builder's blocks
 * (kind-coloured border and header tint on a card) from the app's tokens.
 */

export interface ElementNodeData extends Record<string, unknown> {
    element: TreeElement;
    /** Rail id -> net name, for converter and source captions. */
    railLabel: (id?: string) => string;
}

interface KindStyle {
    label: string;
    icon: LucideIcon;
    /** Literal class names, so Tailwind keeps them. */
    text: string;
    bar: string;
    tint: string;
    border: string;
}

export const ELEMENT_STYLE: Record<ElementKind, KindStyle> = {
    source: { label: "Source", icon: Plug, text: "text-kind-subsystem", bar: "bg-kind-subsystem", tint: "bg-kind-subsystem/15", border: "border-kind-subsystem/50" },
    rail: { label: "Rail", icon: Waypoints, text: "text-kind-harness", bar: "bg-kind-harness", tint: "bg-kind-harness/15", border: "border-kind-harness/50" },
    converter: { label: "Converter", icon: Zap, text: "text-kind-board", bar: "bg-kind-board", tint: "bg-kind-board/15", border: "border-kind-board/50" },
    load: { label: "Load", icon: Cpu, text: "text-kind-module", bar: "bg-kind-module", tint: "bg-kind-module/15", border: "border-kind-module/50" },
};

export const EDGE_STROKE = "hsl(var(--kind-link))";

const HANDLE_CLASS = "!h-2 !w-2 !min-h-0 !min-w-0 !border !border-background !bg-primary";

function amps(value?: number): string {
    if (value === undefined) return "—";
    if (value === 0) return "0 A";
    return value < 1 ? `${+(value * 1000).toPrecision(3)} mA` : `${+value.toPrecision(3)} A`;
}

function Block({ element, selected, icon, title, subtitle, rows, inputs, outputs, mono }: {
    element: TreeElement;
    selected: boolean;
    icon?: LucideIcon;
    title: string;
    subtitle: string;
    rows?: [string, ReactNode][];
    inputs: boolean;
    outputs: boolean;
    mono?: boolean;
}) {
    const style = ELEMENT_STYLE[element.kind];
    const Icon = icon ?? style.icon;
    const need = element.needs[0];
    return (
        <div
            className={cn(
                "relative rounded-md border-2 bg-card text-card-foreground shadow-sm",
                style.border,
                element.pending && "border-dashed",
                element.kind === "rail" && element.solved === false && "opacity-60",
                selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
            )}
            style={{ width: NODE_WIDTH }}
            data-kind={element.kind}
        >
            {inputs && <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />}
            <div className={cn("flex items-center gap-2 px-3 py-1.5", style.tint, rows?.length || need ? "rounded-t-[4px] border-b" : "rounded-[4px]")}>
                <Icon className={cn("h-4 w-4 shrink-0", style.text)} aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-semibold", mono && "font-mono")}>{title}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className={cn("shrink-0 font-medium", style.text)}>{style.label}</span>
                        <span className="min-w-0 truncate">· {subtitle}</span>
                    </p>
                </div>
            </div>
            {rows?.map(([label, value], index) => (
                <div key={label} className={cn("flex items-center gap-2 px-3 py-1 text-xs", index > 0 && "border-t border-border/50")}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="ml-auto truncate font-medium tabular-nums">{value}</span>
                </div>
            ))}
            {need && (
                <div className={cn("px-2 py-1.5", rows?.length && "border-t border-border/50")}>
                    <Badge variant="warning" className="h-5 max-w-full px-1.5 text-[10px]">
                        <span className="truncate">{NEED_LABELS[need]}</span>
                    </Badge>
                </div>
            )}
            {outputs && <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />}
        </div>
    );
}

export const SourceNode = memo(function SourceNode({ data, selected }: NodeProps) {
    const { element, railLabel } = data as ElementNodeData;
    return (
        <Block element={element} selected={selected} title={element.component ?? "Unassigned"}
            subtitle={element.rail ? `feeds ${railLabel(element.rail)}` : "input supply"} inputs={false} outputs />
    );
});

export const ConverterNode = memo(function ConverterNode({ data, selected }: NodeProps) {
    const { element, railLabel } = data as ElementNodeData;
    const linear = element.values.converter_kind === "linear";
    const rows: [string, ReactNode][] = [
        ["In → out", `${railLabel(element.input_rail)} → ${railLabel(element.output_rail)}`],
        linear
            ? ["Linear, Iq", amps(element.values.quiescent_current_a ?? 0)]
            : ["Efficiency", element.values.efficiency !== undefined ? `${Math.round(element.values.efficiency * 1000) / 10} %` : "—"],
    ];
    return (
        <Block element={element} selected={selected} icon={linear ? ChevronsRight : Zap} title={element.component ?? "Unassigned"}
            subtitle={linear ? "linear" : "switching"} rows={rows} inputs outputs />
    );
});

export const LoadNode = memo(function LoadNode({ data, selected }: NodeProps) {
    const { element } = data as ElementNodeData;
    const connector = /^(?:J|P|CN)\d/i.test(element.component ?? "");
    return (
        <Block element={element} selected={selected} icon={connector ? Cable : Cpu} title={element.component ?? "Unassigned"}
            subtitle={element.pins.length ? `${element.pins.length} pad${element.pins.length === 1 ? "" : "s"}` : "no pads yet"}
            rows={[["Current", amps(element.values.current_a)]]} inputs outputs={false} />
    );
});

export const RailNode = memo(function RailNode({ data, selected }: NodeProps) {
    const { element } = data as ElementNodeData;
    const volts = element.values.voltage_v ? `${element.values.voltage_v} V` : "? V";
    return (
        <Block element={element} selected={selected} mono title={element.net ? netLeaf(element.net) : "Unassigned net"}
            subtitle={element.pending ? volts : element.solved === false ? `${volts} · not solved` : volts} inputs outputs />
    );
});

export const NODE_TYPES = { source: SourceNode, converter: ConverterNode, load: LoadNode, rail: RailNode };
