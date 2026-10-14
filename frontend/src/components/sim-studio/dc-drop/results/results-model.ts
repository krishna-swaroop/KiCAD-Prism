import type { RunResult } from "../../run-overlay";
import type { SimSetup } from "../../types";

import { netLeaf } from "../board-index";

/**
 * What the Results tab shows, from a run's result and its frozen setup: rails
 * with their budgets, loads against them, converters, inputs and headline
 * numbers. The layout adapts to `shape`.
 */

/** A load's drop budget, as a share of its rail's voltage, when the rail sets no tolerance. */
export const DEFAULT_BUDGET_SHARE = 0.05;

export type SetupShape = "tree" | "multi" | "rail";

export interface LoadRow {
    id: string;
    component?: string;
    rail?: string;
    railNet?: string;
    nominalV?: number;
    /** The current the setup draws. */
    currentA?: number;
    dropV: number;
    supplyV?: number;
    returnV?: number;
    budgetV?: number;
    /** Drop over budget; above 1 fails. */
    share?: number;
}

export interface RailRow {
    id: string;
    net: string;
    voltageV: number;
    budgetV: number;
    budgetFromTolerance: boolean;
    currentA: number;
    copperLossW?: number;
    maxJ?: number;
    loads: LoadRow[];
    worst?: LoadRow;
}

export interface ConverterRow {
    id: string;
    component?: string;
    inRail?: string;
    outRail?: string;
    inV: number;
    inA: number;
    inW: number;
    outV: number;
    outA: number;
    outW: number;
    lossW: number;
    efficiency: number;
    iterations: number;
    converged: boolean;
}

export interface InputRow {
    source: string;
    component?: string;
    rail?: string;
    currentA: number;
    powerW: number;
}

export interface ResultsModel {
    shape: SetupShape;
    rails: RailRow[];
    /** Worst share of budget first. */
    loads: LoadRow[];
    converters: ConverterRow[];
    inputs: InputRow[];
    inputW: number;
    converterLossW: number;
    copperLossW?: number;
    /** Power reaching the loads over power in. */
    efficiency?: number;
    peakJ?: { value: number; net?: string };
    worst?: LoadRow;
    /** Return nets (GND) the run solved, with their loss. */
    returns: { net: string; copperLossW: number; maxJ: number }[];
}

type Summary = NonNullable<RunResult["summary"]>;
type NetResult = { net: string; copper_loss_w: number; max_current_density_a_per_m2: number };

const refOf = (ref?: string) => (ref ? ref.slice(ref.indexOf(":") + 1) : undefined);

export function buildResultsModel(result: RunResult, setup: SimSetup, analysisId: string): ResultsModel {
    const summary: Summary = result.summary ?? { loads: [], sources: [], probes: [] };
    const analysis = setup.analyses.find((item) => item.id === analysisId) ?? setup.analyses[0];
    const solved = new Set(analysis?.rails ?? []);
    const nets = new Map(((summary as { nets?: NetResult[] }).nets ?? []).map((item) => [item.net, item]));
    const railById = new Map(setup.rails.map((rail) => [rail.id, rail]));
    const outputs = new Set(setup.converters.map((item) => item.output_source));
    const sourceCurrent = new Map(summary.sources.map((item) => [item.source, item.current_a]));

    const budgetOf = (railId?: string) => {
        const rail = railId ? railById.get(railId) : undefined;
        if (!rail) return { budgetV: undefined, fromTolerance: false };
        return rail.tolerance_pct !== undefined
            ? { budgetV: rail.voltage_v * rail.tolerance_pct / 100, fromTolerance: true }
            : { budgetV: rail.voltage_v * DEFAULT_BUDGET_SHARE, fromTolerance: false };
    };

    const loads: LoadRow[] = summary.loads.map((item) => {
        const load = setup.loads.find((entry) => entry.id === item.load);
        const railId = item.rail ?? load?.rail;
        const rail = railId ? railById.get(railId) : undefined;
        const { budgetV } = budgetOf(railId);
        return {
            id: item.load,
            component: refOf(load?.component),
            rail: railId,
            railNet: rail ? netLeaf(refOf(rail.net) ?? rail.net) : undefined,
            nominalV: rail?.voltage_v,
            currentA: load?.current_a,
            dropV: item.max_drop_v,
            supplyV: item.supply_drop_v,
            returnV: item.return_drop_v,
            budgetV,
            share: budgetV ? item.max_drop_v / budgetV : undefined,
        };
    }).sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || b.dropV - a.dropV);

    const rails: RailRow[] = setup.rails.filter((rail) => solved.has(rail.id)).map((rail) => {
        const net = refOf(rail.net) ?? rail.net;
        const own = loads.filter((load) => load.rail === rail.id);
        const { budgetV, fromTolerance } = budgetOf(rail.id);
        const result = nets.get(net);
        return {
            id: rail.id,
            net: netLeaf(net),
            voltageV: rail.voltage_v,
            budgetV: budgetV ?? rail.voltage_v * DEFAULT_BUDGET_SHARE,
            budgetFromTolerance: fromTolerance,
            currentA: setup.sources.filter((source) => source.rail === rail.id)
                .reduce((sum, source) => sum + (sourceCurrent.get(source.id) ?? 0), 0),
            copperLossW: result?.copper_loss_w,
            maxJ: result?.max_current_density_a_per_m2,
            loads: own,
            worst: own[0],
        };
    }).sort((a, b) => b.voltageV - a.voltageV);
    const railNets = new Set(setup.rails.map((rail) => refOf(rail.net)));
    const returns = [...nets.values()]
        .filter((item) => !railNets.has(item.net))
        .map((item) => ({ net: item.net, copperLossW: item.copper_loss_w, maxJ: item.max_current_density_a_per_m2 }));

    const converters: ConverterRow[] = (summary.converters ?? []).map((item) => {
        const converter = setup.converters.find((entry) => entry.id === item.converter);
        const out = setup.sources.find((entry) => entry.id === converter?.output_source);
        return {
            id: item.converter,
            component: refOf(converter?.component),
            inRail: converter?.input_rail,
            outRail: out?.rail,
            inV: item.input_voltage_v,
            inA: item.input_current_a,
            inW: item.input_power_w,
            outV: item.output_voltage_v,
            outA: item.output_current_a,
            outW: item.output_power_w,
            lossW: item.loss_w,
            efficiency: item.input_power_w > 0 ? item.output_power_w / item.input_power_w : 0,
            iterations: item.iterations,
            converged: item.converged,
        };
    });

    const inputs: InputRow[] = setup.sources.filter((source) => !outputs.has(source.id) && solved.has(source.rail)).map((source) => {
        const currentA = sourceCurrent.get(source.id) ?? 0;
        return {
            source: source.id,
            component: refOf(source.component),
            rail: source.rail,
            currentA,
            powerW: currentA * (railById.get(source.rail)?.voltage_v ?? 0),
        };
    });
    const inputW = inputs.reduce((sum, item) => sum + item.powerW, 0);
    const converterLossW = converters.reduce((sum, item) => sum + item.lossW, 0);
    const copperLossW = summary.copper_loss_w;
    const peak = [...nets.values()].reduce<NetResult | null>((best, item) =>
        !best || item.max_current_density_a_per_m2 > best.max_current_density_a_per_m2 ? item : best, null);
    const peakValue = peak?.max_current_density_a_per_m2 ?? (summary as { max_current_density_a_per_m2?: number }).max_current_density_a_per_m2;

    return {
        shape: converters.length ? "tree" : rails.length > 1 ? "multi" : "rail",
        rails,
        loads,
        converters,
        inputs,
        inputW,
        converterLossW,
        copperLossW,
        efficiency: inputW > 0 ? (inputW - converterLossW - (copperLossW ?? 0)) / inputW : undefined,
        peakJ: peakValue !== undefined ? { value: peakValue, net: peak?.net } : undefined,
        worst: loads[0],
        returns,
    };
}

// --- formatting ------------------------------------------------------------------

export function volts(v?: number): string {
    if (v === undefined || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a < 1) return `${+(v * 1000).toPrecision(3)} mV`;
    return `${+v.toPrecision(4)} V`;
}

export function amps(a?: number): string {
    if (a === undefined || !Number.isFinite(a)) return "—";
    const m = Math.abs(a);
    if (m === 0) return "0 A";
    if (m < 1e-3) return `${+(a * 1e6).toPrecision(3)} µA`;
    if (m < 1) return `${+(a * 1000).toPrecision(3)} mA`;
    return `${+a.toPrecision(3)} A`;
}

export function watts(w?: number): string {
    if (w === undefined || !Number.isFinite(w)) return "—";
    const m = Math.abs(w);
    if (m === 0) return "0 W";
    if (m < 1) return `${+(w * 1000).toPrecision(3)} mW`;
    return `${+w.toPrecision(4)} W`;
}

/** A/m² as A/mm². */
export function density(j?: number): string {
    if (j === undefined || !Number.isFinite(j)) return "—";
    return `${+(j * 1e-6).toPrecision(3)} A/mm²`;
}

export function percent(share?: number, digits = 1): string {
    if (share === undefined || !Number.isFinite(share)) return "—";
    return `${(share * 100).toFixed(digits)} %`;
}
