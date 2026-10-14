import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";

import { runBase, type LoadedGrid, type RunRealization, type RunResult } from "../../run-overlay";
import type { SimRun } from "../../types";

import type { ProfilePoint } from "./board-pane";
import { EChart, baseOption, type ChartTheme } from "./echart";
import { fieldArtifact, gridOf, histogram, profile } from "./grids";
import { amps, density, percent, volts, watts, type LoadRow, type ResultsModel } from "./results-model";
import type { Focus } from "./side-panel";

export type DrawerTab = "loads" | "rails" | "converters" | "vias" | "profile" | "distribution" | "convergence";

const TITLES: Record<DrawerTab, string> = {
    loads: "Loads", rails: "Rails", converters: "Converters", vias: "Vias",
    profile: "Profile", distribution: "Distribution", convergence: "Convergence",
};

type Props = {
    projectId: string;
    run: SimRun;
    result: RunResult;
    model: ResultsModel;
    tab: DrawerTab;
    onTab: (tab: DrawerTab) => void;
    net: string | null;
    quantity: string;
    profilePoints: [ProfilePoint, ProfilePoint] | null;
    onFocus: (focus: Focus) => void;
};

/** The tabs a result has something for, in reading order. */
export function drawerTabs(model: ResultsModel): DrawerTab[] {
    return (["loads", "rails", "converters", "vias", "profile", "distribution", "convergence"] as DrawerTab[]).filter((tab) =>
        (tab !== "rails" || model.rails.length > 1) && (tab !== "converters" || model.converters.length > 0));
}

/** Analysis below the board: tables and plots of the run. */
export function Drawer({ projectId, run, result, model, tab, onTab, net, quantity, profilePoints, onFocus }: Props) {
    const tabs = drawerTabs(model);
    const shown = tabs.includes(tab) ? tab : tabs[0];
    return (
        <div className="flex h-full min-h-0 flex-col">
            <Tabs value={shown} onValueChange={(value) => onTab(value as DrawerTab)} className="border-b px-2">
                <TabsList variant="line">
                    {tabs.map((item) => <TabsTrigger key={item} value={item}>{TITLES[item]}</TabsTrigger>)}
                </TabsList>
            </Tabs>
            <div className="min-h-0 flex-1 overflow-auto">
                {shown === "loads" && <LoadsTab model={model} onFocus={onFocus} />}
                {shown === "rails" && <RailsTab model={model} onFocus={onFocus} />}
                {shown === "converters" && <ConvertersTab model={model} onFocus={onFocus} />}
                {shown === "vias" && <ViasTab projectId={projectId} run={run} result={result} />}
                {shown === "profile" && <ProfileTab projectId={projectId} run={run} result={result} net={net} quantity={quantity} points={profilePoints} />}
                {shown === "distribution" && <DistributionTab projectId={projectId} run={run} result={result} net={net} />}
                {shown === "convergence" && <ConvergenceTab realization={(result as { realization?: RunRealization }).realization} />}
            </div>
        </div>
    );
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
    return (
        <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                <tr>{head.map((label, index) => <th key={index} className={cn("whitespace-nowrap border-b px-3 py-1.5 font-medium", index > 0 && "text-right")}>{label}</th>)}</tr>
            </thead>
            <tbody className="tabular-nums">{children}</tbody>
        </table>
    );
}

function Row({ cells, onClick, tone }: { cells: ReactNode[]; onClick?: () => void; tone?: "bad" }) {
    return (
        <tr onClick={onClick} className={cn("border-b border-border/50", onClick && "cursor-pointer hover:bg-muted/60", tone === "bad" && "text-destructive")}>
            {cells.map((cell, index) => <td key={index} className={cn("px-3 py-1", index > 0 && "text-right")}>{cell}</td>)}
        </tr>
    );
}

/** Supply drop, then return drop, as shares of the load's budget, on the tab's common scale. */
function UsageBar({ load, scale, split }: { load: LoadRow; scale: number; split: boolean }) {
    const share = (v?: number) => (v !== undefined && load.budgetV ? v / load.budgetV : 0);
    const supply = split ? share(load.supplyV) : share(load.dropV);
    const back = split ? share(load.returnV) : 0;
    const width = (v: number) => `${Math.min(100, (100 * v) / scale)}%`;
    const over = (load.share ?? 0) > 1;
    return (
        <div className="relative h-2.5 w-full min-w-24 rounded-sm bg-muted">
            <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded-sm" style={{ width: width(supply + back) }}>
                <div className={cn("h-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${(100 * supply) / Math.max(supply + back, 1e-12)}%` }} />
                <div className={cn("h-full", over ? "bg-destructive/60" : "bg-muted-foreground/60")} style={{ width: `${(100 * back) / Math.max(supply + back, 1e-12)}%` }} />
            </div>
            {scale >= 1 && <div className="absolute -inset-y-0.5 w-px bg-destructive" style={{ left: width(1) }} title="Budget" />}
        </div>
    );
}

/**
 * Every load, worst share of its budget first, with its drop as a bar. The
 * bars share one scale, fitted to the worst load rather than to the budget,
 * so small drops still read; the budget is marked once the scale reaches it.
 */
function LoadsTab({ model, onFocus }: { model: ResultsModel; onFocus: (focus: Focus) => void }) {
    const loads = model.loads;
    const split = loads.some((load) => load.returnV !== undefined);
    const worst = loads.reduce((max, load) => Math.max(max, load.share ?? 0), 0);
    const scale = niceScale(Math.max(worst, 0.01) * 1.1);
    const scaleLabel = (
        <span className="inline-flex items-center gap-2">
            {split && (
                <span className="inline-flex items-center gap-1 font-normal">
                    <span className="size-2 rounded-sm bg-primary" />supply
                    <span className="ml-1 size-2 rounded-sm bg-muted-foreground/60" />return
                </span>
            )}
            <span>of budget, 0–{Math.round(scale * 100)} %</span>
        </span>
    );
    return (
        <Table head={["Load", "Rail", "Current", "Drop", ...(split ? ["Supply", "Return"] : []), "Budget", "Used", scaleLabel]}>
            {loads.map((load) => (
                <Row key={load.id} tone={(load.share ?? 0) > 1 ? "bad" : undefined} onClick={() => onFocus({ component: load.component })}
                    cells={[load.component ?? load.id, <span className="font-mono">{load.railNet}</span>, amps(load.currentA), volts(load.dropV),
                        ...(split ? [volts(load.supplyV), volts(load.returnV)] : []), volts(load.budgetV), percent(load.share),
                        <UsageBar load={load} scale={scale} split={split} />]} />
            ))}
        </Table>
    );
}

/** The next 1, 2 or 5 step at or above `v` (a share: 0.12 gives 0.2). */
function niceScale(v: number): number {
    const decade = 10 ** Math.floor(Math.log10(v));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * decade >= v) return step * decade;
    return 10 * decade;
}

function RailsTab({ model, onFocus }: { model: ResultsModel; onFocus: (focus: Focus) => void }) {
    return (
        <Table head={["Rail", "Voltage", "Current", "Copper loss", "Peak density", "Worst load", "Worst drop", "Budget"]}>
            {model.rails.map((rail) => (
                <Row key={rail.id} tone={(rail.worst?.share ?? 0) > 1 ? "bad" : undefined} onClick={() => onFocus({ net: rail.net })}
                    cells={[<span className="font-mono">{rail.net}</span>, `${rail.voltageV} V`, amps(rail.currentA), watts(rail.copperLossW), density(rail.maxJ),
                        rail.worst?.component ?? "—", volts(rail.worst?.dropV), `${volts(rail.budgetV)}${rail.budgetFromTolerance ? "" : " (5 %)"}`]} />
            ))}
            {model.returns.map((item) => (
                <Row key={item.net} onClick={() => onFocus({ net: item.net })}
                    cells={[<span className="font-mono">{item.net}</span>, "return", "—", watts(item.copperLossW), density(item.maxJ), "—", "—", "—"]} />
            ))}
        </Table>
    );
}

function ConvertersTab({ model, onFocus }: { model: ResultsModel; onFocus: (focus: Focus) => void }) {
    const net = (id?: string) => model.rails.find((rail) => rail.id === id)?.net ?? id ?? "—";
    return (
        <Table head={["Converter", "In → out", "Input", "Output", "Efficiency", "Loss", "Solves"]}>
            {model.converters.map((c) => (
                <Row key={c.id} onClick={() => onFocus({ component: c.component })}
                    cells={[c.component ?? c.id, <span className="font-mono">{net(c.inRail)} → {net(c.outRail)}</span>,
                        `${volts(c.inV)} · ${amps(c.inA)} · ${watts(c.inW)}`, `${volts(c.outV)} · ${amps(c.outA)} · ${watts(c.outW)}`,
                        percent(c.efficiency), watts(c.lossW), <>{c.iterations}{!c.converged && <Badge variant="warning" className="ml-1 h-4 px-1 text-[10px]">not settled</Badge>}</>]} />
            ))}
        </Table>
    );
}

interface ViaSegments {
    segments: { hole: number; upper_slice_key: string; lower_slice_key: string; length_m: number; resistance_ohm: number; current_a: number; power_w: number }[];
}

function ViasTab({ projectId, run, result }: { projectId: string; run: SimRun; result: RunResult }) {
    const [segments, setSegments] = useState<ViaSegments["segments"] | null>(null);
    const artifact = result.artifacts.find((item) => item.kind === "via-segments");
    useEffect(() => {
        if (!artifact) return;
        let cancelled = false;
        fetchJson<ViaSegments>(`${runBase(projectId, run.run_id)}/files/${artifact.path}`)
            .then((value) => { if (!cancelled) setSegments(value.segments); })
            .catch(() => { if (!cancelled) setSegments([]); });
        return () => { cancelled = true; };
    }, [artifact, projectId, run.run_id]);
    const holes = useMemo(() => {
        const byHole = new Map<number, { hole: number; current: number; power: number; span: string }>();
        for (const segment of segments ?? []) {
            const entry = byHole.get(segment.hole) ?? { hole: segment.hole, current: 0, power: 0, span: "" };
            if (Math.abs(segment.current_a) > Math.abs(entry.current)) {
                entry.current = segment.current_a;
                entry.span = `${segment.upper_slice_key.replace(/^copper\./, "")} → ${segment.lower_slice_key.replace(/^copper\./, "")}`;
            }
            entry.power += segment.power_w;
            byHole.set(segment.hole, entry);
        }
        return [...byHole.values()].sort((a, b) => Math.abs(b.current) - Math.abs(a.current)).slice(0, 50);
    }, [segments]);
    if (!artifact) return <p className="p-4 text-sm text-muted-foreground">This run wrote no via currents.</p>;
    if (!segments) return <Loader2 className="m-4 size-4 animate-spin text-muted-foreground" />;
    const total = holes.reduce((sum, hole) => sum + hole.power, 0);
    return (
        <Table head={["Via (hole)", "Busiest span", "Current", "Joule heat", "Share of via heat"]}>
            {holes.map((hole) => (
                <Row key={hole.hole} cells={[`#${hole.hole}`, hole.span, amps(Math.abs(hole.current)), watts(hole.power), percent(total ? hole.power / total : 0)]} />
            ))}
        </Table>
    );
}

function useGrid(projectId: string, run: SimRun, result: RunResult, quantity: string, net: string | null) {
    const [grid, setGrid] = useState<LoadedGrid | null>(null);
    useEffect(() => {
        setGrid(null);
        const artifact = fieldArtifact(result, quantity, net);
        if (!artifact) return;
        let cancelled = false;
        gridOf(projectId, run.run_id, artifact).then((value) => { if (!cancelled) setGrid(value); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [net, projectId, quantity, result, run.run_id]);
    return grid;
}

const UNITS: Record<string, { scale: number; unit: string; name: string }> = {
    voltage_v: { scale: 1, unit: "V", name: "Voltage" },
    current_density_a_per_m2: { scale: 1e-6, unit: "A/mm²", name: "Current density" },
    power_density_w_per_m3: { scale: 1e-9, unit: "W/mm³", name: "Power density" },
};

function ProfileTab({ projectId, run, result, net, quantity, points }: {
    projectId: string; run: SimRun; result: RunResult; net: string | null; quantity: string; points: [ProfilePoint, ProfilePoint] | null;
}) {
    const grid = useGrid(projectId, run, result, quantity, net);
    const unit = UNITS[quantity] ?? { scale: 1, unit: "", name: quantity };
    const line = useMemo(() => (grid && points ? profile(grid.grid, points[0].sliceKey, points[0].mm, points[1].mm) : null), [grid, points]);
    const option = useCallback((theme: ChartTheme) => ({
        ...baseOption(theme),
        grid: { left: 64, right: 24, top: 16, bottom: 36 },
        xAxis: { ...(baseOption(theme).xAxis as object), type: "value", name: "mm along the line", nameLocation: "middle", nameGap: 24, max: line?.length },
        yAxis: { ...(baseOption(theme).yAxis as object), type: "value", name: unit.unit, scale: true },
        tooltip: { ...(baseOption(theme).tooltip as object), trigger: "axis", valueFormatter: (v: number) => `${+Number(v).toPrecision(5)} ${unit.unit}` },
        series: [{
            type: "line", showSymbol: false, connectNulls: false, lineStyle: { width: 2, color: theme.series[0] },
            areaStyle: { color: theme.series[0], opacity: 0.08 },
            data: (line?.points ?? []).map(([x, v]) => [x, Number.isFinite(v) ? v * unit.scale : null]),
        }],
    }), [line, unit.scale, unit.unit]);
    if (!points) return <p className="p-4 text-sm text-muted-foreground">Turn on Profile over the board and click two points on the copper.</p>;
    if (!grid) return <Loader2 className="m-4 size-4 animate-spin text-muted-foreground" />;
    return (
        <div className="flex h-full min-h-[220px] flex-col">
            <p className="px-3 pt-2 text-xs text-muted-foreground">
                {unit.name} on {line?.slice?.replace(/^copper\./, "")} over {line?.length.toFixed(2)} mm; gaps are where the line leaves the copper.
            </p>
            <div className="min-h-0 flex-1"><EChart option={option} /></div>
        </div>
    );
}

function DistributionTab({ projectId, run, result, net }: { projectId: string; run: SimRun; result: RunResult; net: string | null }) {
    const grid = useGrid(projectId, run, result, "current_density_a_per_m2", net);
    const data = useMemo(() => (grid ? histogram(grid.grid, 48, 1e-6) : null), [grid]);
    const option = useCallback((theme: ChartTheme) => {
        if (!data) return {};
        // Copper area at or above each density: how much copper exceeds a limit.
        const above: [number, number][] = [];
        let running = data.total;
        data.area.forEach((area, index) => {
            if (running > 0) above.push([+data.edges[index].toPrecision(4), running]);
            running -= area;
        });
        const smallest = Math.min(...above.map((point) => point[1]));
        const mark = (value: number, label: string) => ({ xAxis: value, label: { formatter: label, color: theme.muted, fontSize: 10 } });
        return {
            ...baseOption(theme),
            grid: { left: 64, right: 32, top: 24, bottom: 36 },
            xAxis: { ...(baseOption(theme).xAxis as object), type: "value", name: "current density, A/mm²", nameLocation: "middle", nameGap: 24, max: data.max },
            yAxis: { ...(baseOption(theme).yAxis as object), type: "log", name: "copper above, mm²", min: Math.max(smallest / 2, 1e-6) },
            tooltip: { ...(baseOption(theme).tooltip as object), trigger: "axis",
                formatter: (params: { value: [number, number] }[]) => `≥ ${params[0].value[0]} A/mm²<br/><b>${+params[0].value[1].toPrecision(3)} mm²</b> of copper` },
            series: [{
                type: "line", step: "end", showSymbol: false, data: above,
                lineStyle: { width: 2, color: theme.series[0] }, areaStyle: { color: theme.series[0], opacity: 0.1 },
                markLine: { silent: true, symbol: "none", lineStyle: { color: theme.muted, type: "dashed" },
                    data: [mark(data.p95, `95 % · ${+data.p95.toPrecision(3)}`), mark(data.p99, `99 % · ${+data.p99.toPrecision(3)}`)] },
            }],
        };
    }, [data]);
    if (!grid || !data) return <Loader2 className="m-4 size-4 animate-spin text-muted-foreground" />;
    return (
        <div className="flex h-full min-h-[220px] flex-col">
            <p className="px-3 pt-2 text-xs text-muted-foreground">
                Copper area of {net ?? "the solved nets"} at or above each current density, all layers: {data.total.toFixed(1)} mm² in all, peak {data.max.toPrecision(3)} A/mm².
            </p>
            <div className="min-h-0 flex-1"><EChart option={option} /></div>
        </div>
    );
}

const STOP_REASONS: Record<string, string> = {
    "unknown-budget": "reached the unknown budget",
    "max-passes": "reached the pass limit",
    "target-error": "reached the target error",
    "nothing-to-refine": "nothing left to refine",
};

function ConvergenceTab({ realization }: { realization?: RunRealization }) {
    const adaptive = realization?.mesh?.adaptive;
    const option = useCallback((theme: ChartTheme) => {
        const passes = adaptive?.passes ?? [];
        return {
            ...baseOption(theme),
            grid: { left: 64, right: 72, top: 28, bottom: 36 },
            legend: { top: 0, right: 0, textStyle: { color: theme.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
            tooltip: { ...(baseOption(theme).tooltip as object), trigger: "axis" },
            xAxis: { ...(baseOption(theme).xAxis as object), type: "category", name: "pass", nameLocation: "middle", nameGap: 24, data: passes.map((_, index) => index + 1) },
            yAxis: [
                { ...(baseOption(theme).yAxis as object), type: "log", name: "error estimate", axisLabel: { color: theme.muted, fontSize: 11, formatter: (v: number) => `${+(v * 100).toPrecision(2)}%` } },
                { ...(baseOption(theme).yAxis as object), type: "value", name: "unknowns", splitLine: { show: false },
                    axisLabel: { color: theme.muted, fontSize: 11, formatter: (v: number) => `${Math.round(v / 1000)}k` } },
            ],
            series: [
                { name: "Error estimate (worst net)", type: "line", showSymbol: false, data: passes.map((pass) => pass.relative_estimate), lineStyle: { width: 2, color: theme.series[0] }, itemStyle: { color: theme.series[0] } },
                { name: "Unknowns", type: "line", yAxisIndex: 1, showSymbol: false, data: passes.map((pass) => pass.unknowns), lineStyle: { width: 1.5, type: "dashed", color: theme.series[1] }, itemStyle: { color: theme.series[1] } },
            ],
        };
    }, [adaptive]);
    if (!adaptive) {
        return <p className="p-4 text-sm text-muted-foreground">One uniform mesh{realization?.mesh ? ` of ${realization.mesh.unknowns.toLocaleString()} unknowns` : ""}; turn on adaptive refinement to see convergence.</p>;
    }
    const last = adaptive.passes[adaptive.passes.length - 1];
    return (
        <div className="flex h-full min-h-[220px] flex-col">
            <p className="px-3 pt-2 text-xs text-muted-foreground">
                {adaptive.passes.length} passes, {STOP_REASONS[adaptive.stop] ?? adaptive.stop}; final estimate {percent(last?.relative_estimate, 2)} at {last?.unknowns.toLocaleString()} unknowns.
                The estimate tracks the error, it does not bound it.
            </p>
            <div className="min-h-0 flex-1"><EChart option={option} /></div>
        </div>
    );
}
