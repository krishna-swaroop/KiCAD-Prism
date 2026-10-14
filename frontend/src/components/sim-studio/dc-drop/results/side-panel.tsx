import { useCallback, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { EChart, baseOption, type ChartTheme } from "./echart";
import { percent, volts, watts, type ResultsModel } from "./results-model";

export interface Focus {
    component?: string;
    net?: string;
}

type Props = {
    model: ResultsModel;
    onFocus: (focus: Focus) => void;
};

/**
 * Beside the board, what the setup's shape makes worth seeing: power flow
 * for a power tree, rails against their budgets for several rails, and loads
 * against the budget for one rail.
 */
export function SidePanel({ model, onFocus }: Props) {
    const views = model.shape === "tree" ? (["flow", "rails"] as const) : model.shape === "multi" ? (["rails"] as const) : (["loads"] as const);
    const [view, setView] = useState<(typeof views)[number]>(views[0]);
    const shown = (views as readonly string[]).includes(view) ? view : views[0];
    const titles = { flow: "Power flow", rails: "Rails", loads: "Loads" } as const;
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-1 border-b px-3 py-1.5">
                {views.map((item) => (
                    <button key={item} type="button" onClick={() => setView(item)}
                        className={cn("rounded px-2 py-1 text-xs", shown === item ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                        {titles[item]}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 p-2">
                {shown === "flow" && <PowerFlow model={model} onFocus={onFocus} />}
                {shown === "rails" && <RailBars model={model} onFocus={onFocus} />}
                {shown === "loads" && <BudgetBars model={model} onFocus={onFocus} />}
            </div>
            <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                {shown === "flow" ? "Width is power. Click a part or rail to show it on the board."
                    : "Worst drop against the budget (5 % of the rail unless it sets a tolerance). Click to show it."}
            </p>
        </div>
    );
}

/** Loads shown on their own: at most this many, each drawing at least this share of the input. */
const MAX_LOADS = 8;
const SMALL_SHARE = 0.02;

interface FlowNode {
    name: string;
    /** What the node shows; names stay unique, titles stay short. */
    title: string;
    detail: string;
    itemStyle: { color: string };
    focus: Focus;
}

/**
 * Sources, rails, converters and loads as a left-to-right flow. Labels are
 * short (a rail's net, a part's reference) so the columns don't collide,
 * small loads fold together, and the losses sit at the bottom of the last
 * column. Nodes keep the order they are added in, so the layout is stable.
 */
function PowerFlow({ model, onFocus }: Props) {
    const option = useCallback((theme: ChartTheme) => {
        const [board, subsystem, module, harness] = theme.series;
        const total = Math.max(model.inputW, 1e-12);
        const nodes = new Map<string, FlowNode>();
        const links: { source: string; target: string; value: number }[] = [];
        const node = (name: string, title: string, detail: string, color: string, focus: Focus) => {
            if (!nodes.has(name)) nodes.set(name, { name, title, detail, itemStyle: { color }, focus });
            return name;
        };
        const railName = (id?: string) => {
            const rail = model.rails.find((item) => item.id === id);
            return rail ? node(`rail:${rail.id}`, rail.net, `${rail.net} · ${rail.voltageV} V`, harness, { net: rail.net }) : null;
        };
        const link = (source: string | null, target: string | null, value: number) => {
            if (source && target && value > 1e-9) links.push({ source, target, value });
        };

        for (const input of model.inputs) {
            const label = input.component ?? input.source;
            link(node(`in:${input.source}`, label, `${label} (source)`, subsystem, { component: input.component }), railName(input.rail), input.powerW);
        }
        for (const converter of model.converters) {
            const label = converter.component ?? converter.id;
            const inNet = model.rails.find((rail) => rail.id === converter.inRail)?.net ?? "?";
            const outNet = model.rails.find((rail) => rail.id === converter.outRail)?.net ?? "?";
            const name = node(`conv:${converter.id}`, label, `${label} · ${inNet} → ${outNet} · ${percent(converter.efficiency)} efficient`, board, { component: converter.component });
            link(railName(converter.inRail), name, converter.inW);
            link(name, railName(converter.outRail), converter.outW);
        }

        // Last column: the biggest loads, then the rest folded together, then the losses.
        const drawn = model.rails.flatMap((rail) => rail.loads.map((load) => ({
            rail, load, power: (load.currentA ?? 0) * (load.nominalV ?? rail.voltageV),
        }))).filter((item) => item.power > 1e-9);
        const shown = new Set([...drawn].sort((a, b) => b.power - a.power)
            .filter((item) => item.power >= SMALL_SHARE * total).slice(0, MAX_LOADS));
        const tail: { source: string; target: string; value: number }[] = [];
        const rest = new Map<string, number>();
        for (const rail of model.rails) {
            const source = railName(rail.id)!;
            for (const item of drawn.filter((entry) => entry.rail === rail).sort((a, b) => b.power - a.power)) {
                const label = item.load.component ?? item.load.id;
                if (shown.has(item)) {
                    link(source, node(`load:${rail.id}:${item.load.id}`, `${label} · ${rail.net}`, `${label} on ${rail.net}`, module, { component: item.load.component }), item.power);
                } else {
                    rest.set(source, (rest.get(source) ?? 0) + item.power);
                }
            }
            if ((rail.copperLossW ?? 0) > 1e-9) tail.push({ source, target: "loss:copper", value: rail.copperLossW! });
        }
        if (rest.size) {
            const count = drawn.length - shown.size;
            node("other", `${count} other loads`, `${count} smaller loads`, module, {});
            for (const [source, value] of rest) link(source, "other", value);
        }
        if (model.converters.some((converter) => converter.lossW > 1e-9)) {
            node("loss:converter", "Converter loss", `Lost in the converters`, theme.destructive, {});
            for (const converter of model.converters) link(`conv:${converter.id}`, "loss:converter", converter.lossW);
        }
        if (tail.length) {
            node("loss:copper", "Copper loss", "Lost in the copper", theme.warning, {});
            links.push(...tail);
        }

        const used = new Set(links.flatMap((item) => [item.source, item.target]));
        const inflow = new Map<string, number>();
        const outflow = new Map<string, number>();
        for (const item of links) {
            outflow.set(item.source, (outflow.get(item.source) ?? 0) + item.value);
            inflow.set(item.target, (inflow.get(item.target) ?? 0) + item.value);
        }
        const flowOf = (name: string) => Math.max(inflow.get(name) ?? 0, outflow.get(name) ?? 0);
        return {
            ...baseOption(theme),
            tooltip: {
                ...(baseOption(theme).tooltip as object),
                formatter: (params: { dataType: string; data: { source?: string; target?: string; value?: number; detail?: string } }) => {
                    if (params.dataType === "edge") {
                        const from = nodes.get(params.data.source ?? "")?.title;
                        const to = nodes.get(params.data.target ?? "")?.title;
                        return `${from} → ${to}<br/><b>${watts(params.data.value)}</b>`;
                    }
                    const name = (params.data as { name?: string }).name ?? "";
                    return `${params.data.detail}<br/><b>${watts(flowOf(name))}</b> · ${percent(flowOf(name) / total)} of the input`;
                },
            },
            series: [{
                type: "sankey",
                left: 4, right: 104, top: 8, bottom: 8,
                nodeWidth: 10, nodeGap: 8, nodeAlign: "right",
                // Keep the order above: big loads first, losses last.
                layoutIterations: 0,
                draggable: false,
                emphasis: { focus: "adjacency" },
                data: [...nodes.values()].filter((item) => used.has(item.name)).map((item) => ({
                    ...item,
                    label: { show: flowOf(item.name) >= SMALL_SHARE * total || item.name.startsWith("loss:") || item.name === "other" },
                })),
                links,
                label: {
                    color: theme.foreground, fontSize: 10, overflow: "truncate", width: 96,
                    formatter: (params: { data: FlowNode }) => params.data.title,
                },
                lineStyle: { color: "gradient", opacity: 0.22, curveness: 0.5 },
            }],
        };
    }, [model]);
    return <EChart option={option} onClick={(params) => {
        const focus = (params.data as Partial<FlowNode> | undefined)?.focus;
        if (focus) onFocus(focus);
    }} />;
}

function RailBars({ model, onFocus }: Props) {
    const option = useCallback((theme: ChartTheme) => {
        const rails = model.rails;
        return {
            ...baseOption(theme),
            grid: { left: 84, right: 56, top: 8, bottom: 24 },
            xAxis: { ...(baseOption(theme).xAxis as object), type: "value", max: (v: { max: number }) => Math.max(1, v.max), axisLabel: { color: theme.muted, fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` } },
            yAxis: { ...(baseOption(theme).yAxis as object), type: "category", inverse: true, data: rails.map((rail) => rail.net), axisLabel: { color: theme.foreground, fontSize: 11, fontFamily: "ui-monospace, monospace" } },
            tooltip: {
                ...(baseOption(theme).tooltip as object), trigger: "item",
                formatter: (params: { dataIndex: number }) => {
                    const rail = rails[params.dataIndex];
                    return `${rail.net} · ${rail.voltageV} V<br/>Worst ${rail.worst?.component ?? "—"}: <b>${volts(rail.worst?.dropV)}</b><br/>Budget ${volts(rail.budgetV)}`;
                },
            },
            series: [{
                type: "bar", barWidth: 12,
                data: rails.map((rail) => ({
                    value: rail.worst?.share ?? 0,
                    itemStyle: { color: (rail.worst?.share ?? 0) > 1 ? theme.destructive : theme.series[0], borderRadius: 2 },
                })),
                label: { show: true, position: "right", color: theme.muted, fontSize: 11, formatter: (p: { dataIndex: number }) => volts(rails[p.dataIndex].worst?.dropV) },
                markLine: { silent: true, symbol: "none", data: [{ xAxis: 1 }], lineStyle: { color: theme.destructive, type: "dashed" }, label: { show: false } },
            }],
        };
    }, [model]);
    const rails = model.rails;
    return <EChart option={option} onClick={(params) => params.dataIndex !== undefined && onFocus({ net: rails[params.dataIndex]?.net })} />;
}

function BudgetBars({ model, onFocus }: Props) {
    const loads = useMemo(() => model.loads.slice(0, 20), [model.loads]);
    const option = useCallback((theme: ChartTheme) => ({
        ...baseOption(theme),
        grid: { left: 64, right: 56, top: 8, bottom: 24 },
        xAxis: { ...(baseOption(theme).xAxis as object), type: "value", max: (v: { max: number }) => Math.max(1, v.max), axisLabel: { color: theme.muted, fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` } },
        yAxis: { ...(baseOption(theme).yAxis as object), type: "category", inverse: true, data: loads.map((load) => load.component ?? load.id) },
        tooltip: {
            ...(baseOption(theme).tooltip as object), trigger: "item",
            formatter: (params: { dataIndex: number }) => {
                const load = loads[params.dataIndex];
                return `${load.component ?? load.id} on ${load.railNet ?? load.rail}<br/><b>${volts(load.dropV)}</b> · ${percent(load.share)} of ${volts(load.budgetV)}`;
            },
        },
        series: [{
            type: "bar", barWidth: 10,
            data: loads.map((load) => ({ value: load.share ?? 0, itemStyle: { color: (load.share ?? 0) > 1 ? theme.destructive : theme.series[0], borderRadius: 2 } })),
            label: { show: true, position: "right", color: theme.muted, fontSize: 11, formatter: (p: { dataIndex: number }) => volts(loads[p.dataIndex].dropV) },
            markLine: { silent: true, symbol: "none", data: [{ xAxis: 1 }], lineStyle: { color: theme.destructive, type: "dashed" }, label: { show: false } },
        }],
    }), [loads]);
    return <EChart option={option} onClick={(params) => params.dataIndex !== undefined && onFocus({ component: loads[params.dataIndex]?.component })} />;
}
