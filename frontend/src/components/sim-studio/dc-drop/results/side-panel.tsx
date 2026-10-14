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

const LOADS_PER_RAIL = 3;
/** Nodes carrying less than this share of the input are drawn but not labelled. */
const LABEL_SHARE = 0.015;

function PowerFlow({ model, onFocus }: Props) {
    const option = useCallback((theme: ChartTheme) => {
        const [board, subsystem, module, harness] = theme.series;
        const nodes = new Map<string, { name: string; itemStyle: { color: string }; focus: Focus }>();
        const links: { source: string; target: string; value: number }[] = [];
        const node = (name: string, color: string, focus: Focus) => {
            if (!nodes.has(name)) nodes.set(name, { name, itemStyle: { color }, focus });
            return name;
        };
        const railName = (id?: string) => {
            const rail = model.rails.find((item) => item.id === id);
            return rail ? node(rail.net, harness, { net: rail.net }) : null;
        };
        const link = (source: string | null, target: string | null, value: number) => {
            if (source && target && value > 1e-9) links.push({ source, target, value });
        };
        for (const input of model.inputs) link(node(`${input.component ?? input.source} in`, subsystem, { component: input.component }), railName(input.rail), input.powerW);
        const converterLoss = node("Converter loss", theme.destructive, {});
        for (const converter of model.converters) {
            const out = model.rails.find((rail) => rail.id === converter.outRail);
            const name = node(`${converter.component ?? converter.id} → ${out?.net ?? "?"}`, board, { component: converter.component });
            link(railName(converter.inRail), name, converter.inW);
            link(name, railName(converter.outRail), converter.outW);
            link(name, converterLoss, converter.lossW);
        }
        const copper = node("Copper loss", theme.warning, {});
        for (const rail of model.rails) {
            const source = railName(rail.id);
            const loads = rail.loads
                .map((load) => ({ load, power: (load.currentA ?? 0) * (load.nominalV ?? rail.voltageV) }))
                .sort((a, b) => b.power - a.power);
            for (const { load, power } of loads.slice(0, LOADS_PER_RAIL)) {
                link(source, node(`${load.component ?? load.id} · ${rail.net}`, module, { component: load.component }), power);
            }
            const rest = loads.slice(LOADS_PER_RAIL).reduce((sum, item) => sum + item.power, 0);
            link(source, rest > 0 ? node(`${loads.length - LOADS_PER_RAIL} more on ${rail.net}`, module, { net: rail.net }) : null, rest);
            link(source, copper, rail.copperLossW ?? 0);
        }
        const used = new Set(links.flatMap((item) => [item.source, item.target]));
        const through = new Map<string, number>();
        for (const item of links) {
            through.set(item.source, (through.get(item.source) ?? 0) + item.value);
            through.set(item.target, Math.max(through.get(item.target) ?? 0, 0) + item.value);
        }
        const total = Math.max(model.inputW, 1e-12);
        return {
            ...baseOption(theme),
            tooltip: {
                ...(baseOption(theme).tooltip as object),
                formatter: (params: { dataType: string; data: { source?: string; target?: string; value?: number; name?: string }; value?: number }) =>
                    params.dataType === "edge"
                        ? `${params.data.source} → ${params.data.target}<br/><b>${watts(params.data.value)}</b>`
                        : `${params.data.name}<br/><b>${watts(params.value)}</b>`,
            },
            series: [{
                type: "sankey",
                left: 4, right: 96, top: 8, bottom: 8,
                nodeWidth: 8, nodeGap: 10, layoutIterations: 64,
                emphasis: { focus: "adjacency" },
                data: [...nodes.values()].filter((item) => used.has(item.name)).map((item) => ({
                    ...item,
                    label: { show: (through.get(item.name) ?? 0) / 2 >= LABEL_SHARE * total || item.name.endsWith("loss") },
                })),
                links,
                label: { color: theme.foreground, fontSize: 10, overflow: "truncate", width: 90 },
                lineStyle: { color: "gradient", opacity: 0.22, curveness: 0.5 },
            }],
        };
    }, [model]);
    const focusOf = (name?: string): Focus => {
        const rail = model.rails.find((item) => item.net === name);
        if (rail) return { net: rail.net };
        const component = name?.split(/ [·→]| in$/)[0]?.trim();
        return component && !/loss$/.test(name ?? "") ? { component } : {};
    };
    return <EChart option={option} onClick={(params) => { if (params.name) onFocus(focusOf(params.name)); }} />;
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
