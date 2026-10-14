import { useEffect, useRef, useState } from "react";
import { fetchChecked, fetchJson } from "@/lib/api";
import type { PrismAnalyticOverlay, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import type { DcDropAnalysis, SimRun, SimSetup } from "./types";

export const runBase = (projectId: string, runId: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/sim/a0/runs/${encodeURIComponent(runId)}`;

/** The run's own materialization: result indices refer to exactly this geometry. */
export const runPackUrl = (projectId: string, runId: string) => `${runBase(projectId, runId)}/materialization`;

interface ResultArtifact {
    kind: string;
    path: string;
    quantity?: string;
    /** The net a field grid covers; absent when it covers every solved net. */
    net?: string;
}

interface OperationValues {
    quantity: { name: string; unit: string };
    operation_indices: number[];
    values: number[];
    value_range?: { min: number; max: number };
}

interface FieldGridDocument {
    quantity: { name: string; unit: string };
    origin_x_m: number;
    origin_y_m: number;
    dx_m: number;
    dy_m: number;
    value_range?: { min: number; max: number };
    slices: { slice_key: string; ix0: number; iy0: number; nx: number; ny: number; path: string }[];
}

interface LoadedOverlay {
    overlay: PrismAnalyticOverlay;
    quantity: string;
    units: string;
    range: [number, number];
    count: number;
}

interface LoadedGrid {
    grid: { origin_x_m: number; origin_y_m: number; dx_m: number; dy_m: number; slices: (FieldGridDocument["slices"][number] & { values: Float32Array })[] };
    quantity: string;
    units: string;
    range: [number, number];
    count: number;
}

/** A field on the engine's own grid (sim-adr-0018), with every slice's values. */
async function loadGrid(base: string, artifact: ResultArtifact): Promise<LoadedGrid> {
    const document = await fetchJson<FieldGridDocument>(`${base}/files/${artifact.path}`);
    const slices = await Promise.all(document.slices.map(async (slice) => {
        const response = await fetchChecked(`${base}/files/${slice.path}`, undefined, "Cannot load the result field");
        return { ...slice, values: new Float32Array(await response.arrayBuffer()) };
    }));
    const range: [number, number] = document.value_range ? [document.value_range.min, document.value_range.max] : [0, 1];
    const grid = { origin_x_m: document.origin_x_m, origin_y_m: document.origin_y_m, dx_m: document.dx_m, dy_m: document.dy_m, slices };
    const count = slices.reduce((sum, slice) => sum + slice.values.filter(Number.isFinite).length, 0);
    return { grid, quantity: document.quantity.name, units: document.quantity.unit, range, count };
}

/**
 * The colour range of a magnitude: zero up to the `share` quantile of its
 * values, so a few hot spots at pad edges do not wash out every path.
 */
export function clippedRange(slices: { values: Float32Array }[], share = 0.995): [number, number] {
    const values: number[] = [];
    for (const slice of slices) for (const v of slice.values) if (Number.isFinite(v)) values.push(v);
    if (!values.length) return [0, 1];
    values.sort((a, b) => a - b);
    const top = values[Math.min(values.length - 1, Math.floor(share * values.length))];
    return [0, top > 0 ? top : values[values.length - 1] || 1];
}

/** A field as the viewer's overlay; `barrels` (per-operation values) colour the via barrels. */
async function gridOverlay(base: string, artifact: ResultArtifact, barrels?: ResultArtifact): Promise<LoadedOverlay> {
    const loaded = await loadGrid(base, artifact);
    // The per-operation values colour the via barrels, which no slice raster covers.
    const values = barrels ? (await operationOverlay(base, barrels)).overlay : null;
    const range = loaded.quantity === "voltage_v" ? loaded.range : clippedRange(loaded.grid.slices);
    return {
        overlay: {
            kind: "field_grid",
            quantity: loaded.quantity,
            units: loaded.units,
            grid: loaded.grid,
            range,
            ...(values?.kind === "operation_values" && !Array.isArray(values.values) ? { values: values.values as Record<number, number> } : {}),
        },
        quantity: loaded.quantity,
        units: loaded.units,
        range,
        count: loaded.count,
    };
}

/** One value per materialization operation: engines that publish no field. */
async function operationOverlay(base: string, artifact: ResultArtifact): Promise<LoadedOverlay> {
    const document = await fetchJson<OperationValues>(`${base}/files/${artifact.path}`);
    const values: Record<number, number> = {};
    document.operation_indices.forEach((index, position) => { values[index] = document.values[position]; });
    const range: [number, number] = document.value_range
        ? [document.value_range.min, document.value_range.max]
        : [Math.min(...document.values), Math.max(...document.values)];
    return {
        overlay: { kind: "operation_values", quantity: document.quantity.name, units: document.quantity.unit, values, range },
        quantity: document.quantity.name,
        units: document.quantity.unit,
        range,
        count: document.values.length,
    };
}

const isVoltage = (item: ResultArtifact) => (item.quantity ?? "voltage_v") === "voltage_v";

/** Scalar fields the result view can colour the copper with. */
export const FIELD_QUANTITIES = {
    voltage_v: "Voltage",
    current_density_a_per_m2: "Current density",
    power_density_w_per_m3: "Power density",
} as const;
export type FieldQuantity = keyof typeof FIELD_QUANTITIES;

/** The current density's components, for arrows. */
const VECTOR_X = "current_density_x_a_per_m2";
const VECTOR_Y = "current_density_y_a_per_m2";

/** Nets a result published fields for, in its order; empty for single-net results. */
export function netsWithFields(artifacts: ResultArtifact[]): string[] {
    const out: string[] = [];
    for (const item of artifacts) {
        if (item.kind === "field-grid" && item.net && !out.includes(item.net)) out.push(item.net);
    }
    return out;
}

/** Which fields a result published on the grid. */
export function availableFields(artifacts: ResultArtifact[]): { scalars: FieldQuantity[]; vectors: boolean } {
    const grids = new Set(artifacts.filter((a) => a.kind === "field-grid").map((a) => a.quantity ?? "voltage_v"));
    return {
        scalars: (Object.keys(FIELD_QUANTITIES) as FieldQuantity[]).filter((q) => grids.has(q) || (q === "voltage_v" && artifacts.some((a) => a.kind === "operation-values" && isVoltage(a)))),
        vectors: grids.has(VECTOR_X) && grids.has(VECTOR_Y),
    };
}
export interface ConverterResult {
    converter: string;
    input_voltage_v: number;
    input_current_a: number;
    input_power_w: number;
    output_voltage_v: number;
    output_current_a: number;
    output_power_w: number;
    loss_w: number;
    iterations: number;
    converged: boolean;
}

export interface LoadResult {
    load: string;
    min_voltage_v: number;
    max_voltage_v: number;
    max_drop_v: number;
    rail?: string;
    supply_drop_v?: number;
    return_drop_v?: number;
}

export interface RunResult {
    status: string;
    engine: { id: string; engine_version: string };
    summary?: {
        loads: LoadResult[];
        sources: { source: string; current_a: number }[];
        converters?: ConverterResult[];
        copper_loss_w?: number;
        probes: { probe: string; voltage_v: number }[];
    };
    realization?: RunRealization;
    artifacts: ResultArtifact[];
}

/** The parts of a DC engine's realization the result view shows. */
export interface RunRealization {
    grids?: { dx_m: number; dy_m: number }[];
    mesh?: {
        unknowns: number;
        budget_mode: string;
        adaptive?: {
            passes: { unknowns: number; max_level: number; relative_estimate: number }[];
            stop: string;
            min_cell_m: number;
        };
    };
    solver?: { backend: string; unknowns: number };
}

export type RunOverlayState =
    | { phase: "off" }
    | { phase: "loading" }
    | {
        phase: "ready";
        quantity: string;
        units: string;
        range: [number, number];
        count: number;
        nets: string[];
        result: RunResult;
        fields: { scalars: FieldQuantity[]; vectors: boolean };
        arrows: { count: number; max: number; reference: number } | null;
        /** Nets the result has fields for, and the one shown. */
        fieldNets: string[];
        net: string | null;
    }
    | { phase: "failed"; error: string };

/** Net names of the rails the run's analysis solved, from its frozen setup. */
export function solvedNets(setup: SimSetup, analysisId: string): string[] {
    const analysis = setup.analyses.find((item: DcDropAnalysis) => item.id === analysisId);
    const rails = new Set(analysis?.rails ?? []);
    return setup.rails
        .filter((rail) => rails.has(rail.id))
        .map((rail) => rail.net.slice(rail.net.indexOf(":") + 1));
}

/**
 * Shows a run's result on the viewer once the run's pack is drawn
 * (`packReady`): colours the copper with the field `quantity`, draws the
 * current's arrows while `arrows` is set, and isolates the nets the analysis
 * solved, so only that copper shows. The viewer's result colours outrank
 * its lit-net glow. Clears all of it when the run changes.
 */
export function useRunOverlay(
    viewer: PrismSemanticViewerElement | null,
    packReady: boolean,
    projectId: string,
    run: SimRun | null,
    quantity: FieldQuantity = "voltage_v",
    arrows = false,
    net: string | null = null,
): RunOverlayState {
    const [loaded, setLoaded] = useState<{ result: RunResult; nets: string[] } | null>(null);
    // The nets isolated on the viewer: the shown net, or every solved rail.
    const isolated = useRef<string[]>([]);
    const [state, setState] = useState<RunOverlayState>({ phase: "off" });
    const runId = run?.run_id ?? null;
    const analysisId = run?.analysis_id ?? "";
    const live = Boolean(viewer && packReady && runId && typeof viewer.setAnalyticOverlay === "function");

    // The result and setup, and the solved nets isolated.
    useEffect(() => {
        setLoaded(null);
        if (!live || !viewer || !runId) {
            setState({ phase: "off" });
            return;
        }
        let cancelled = false;
        let isolate: () => void = () => undefined;
        const stopIsolating = () => {
            viewer.removeEventListener("prism-semantic-viewer:viewstatechange", isolate);
            viewer.removeEventListener("prism-semantic-viewer:ready", isolate);
        };
        setState({ phase: "loading" });
        void (async () => {
            try {
                const base = runBase(projectId, runId);
                const [result, setup] = await Promise.all([
                    fetchJson<RunResult>(`${base}/result`),
                    fetchJson<SimSetup>(`${base}/setup`),
                ]);
                if (cancelled) return;
                const nets = solvedNets(setup, analysisId);
                if (!isolated.current.length) isolated.current = nets;
                isolate = () => {
                    if (cancelled || viewer.getViewState?.()?.isolateNet) {
                        stopIsolating();
                        return;
                    }
                    viewer.setHighlightedNets?.(isolated.current.map((netName) => ({ netName })));
                    viewer.setNetIsolation?.(true);
                };
                // The viewer loads its net table progressively; isolation takes once the nets resolve.
                viewer.addEventListener("prism-semantic-viewer:viewstatechange", isolate);
                viewer.addEventListener("prism-semantic-viewer:ready", isolate);
                isolate();
                setLoaded({ result, nets });
            } catch (error) {
                if (!cancelled) setState({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
            }
        })();
        return () => {
            cancelled = true;
            stopIsolating();
            viewer.setAnalyticOverlay?.(null);
            viewer.setAnalyticVectors?.(null);
            viewer.setNetIsolation?.(false);
            viewer.setHighlightedNets?.([]);
        };
    }, [analysisId, live, projectId, runId, viewer]);

    // The net shown: the one asked for, else the first solved rail with fields.
    const fieldNets = loaded ? netsWithFields(loaded.result.artifacts) : [];
    const shown = !fieldNets.length ? null
        : net && fieldNets.includes(net) ? net
        : fieldNets.find((n) => loaded?.nets.includes(n)) ?? fieldNets[0];
    const onNet = (item: ResultArtifact) => !shown || !item.net || item.net === shown;
    useEffect(() => {
        if (!loaded || !viewer) return;
        isolated.current = shown ? [shown] : loaded.nets;
        viewer.setHighlightedNets?.(isolated.current.map((netName) => ({ netName })));
        viewer.setNetIsolation?.(true);
    }, [loaded, shown, viewer]);

    // The colours: the chosen field, or voltage when the run has no such field.
    const [colours, setColours] = useState<LoadedOverlay | null>(null);
    useEffect(() => {
        setColours(null);
        if (!loaded || !viewer || !runId) return;
        let cancelled = false;
        void (async () => {
            try {
                const base = runBase(projectId, runId);
                const artifacts = loaded.result.artifacts;
                const wanted = artifacts.find((item) => item.kind === "field-grid" && onNet(item) && (item.quantity ?? "voltage_v") === quantity);
                const field = wanted ?? artifacts.find((item) => item.kind === "field-grid" && onNet(item) && isVoltage(item));
                const values = artifacts.find((item) => item.kind === "operation-values" && isVoltage(item));
                if (!field && !values) throw new Error("The run has no voltage result");
                // Barrels take the field's own per-via values: the voltage's, or
                // the plating's current or power density.
                const barrels = field && isVoltage(field)
                    ? values
                    : artifacts.find((item) => item.kind === "operation-values" && item.quantity === `via_${field?.quantity}`);
                const next = field ? await gridOverlay(base, field, barrels) : await operationOverlay(base, values as ResultArtifact);
                if (cancelled) return;
                viewer.setAnalyticOverlay(next.overlay);
                setColours(next);
            } catch (error) {
                if (!cancelled) setState({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `onNet` follows `shown`
    }, [loaded, projectId, quantity, runId, shown, viewer]);

    // The arrows.
    const [drawn, setDrawn] = useState<{ count: number; max: number; reference: number } | null>(null);
    useEffect(() => {
        setDrawn(null);
        if (!loaded || !viewer || !runId || typeof viewer.setAnalyticVectors !== "function") return;
        const artifacts = loaded.result.artifacts;
        const x = artifacts.find((item) => item.kind === "field-grid" && onNet(item) && item.quantity === VECTOR_X);
        const y = artifacts.find((item) => item.kind === "field-grid" && onNet(item) && item.quantity === VECTOR_Y);
        if (!arrows || !x || !y) {
            viewer.setAnalyticVectors(null);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const base = runBase(projectId, runId);
                const [gx, gy] = await Promise.all([loadGrid(base, x), loadGrid(base, y)]);
                if (cancelled) return;
                const placed = viewer.setAnalyticVectors({ quantity: "current_density_a_per_m2", units: gx.units, x: gx.grid, y: gy.grid });
                setDrawn(placed ? { count: placed.count, max: placed.max, reference: placed.reference } : null);
            } catch (error) {
                if (!cancelled) setState({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
            }
        })();
        return () => {
            cancelled = true;
            viewer.setAnalyticVectors(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `onNet` follows `shown`
    }, [arrows, loaded, projectId, runId, shown, viewer]);

    useEffect(() => {
        if (!loaded || !colours) return;
        setState({
            phase: "ready",
            quantity: colours.quantity,
            units: colours.units,
            range: colours.range,
            count: colours.count,
            nets: loaded.nets,
            result: loaded.result,
            fields: availableFields(loaded.result.artifacts),
            arrows: drawn,
            fieldNets: netsWithFields(loaded.result.artifacts),
            net: shown,
        });
    }, [colours, drawn, loaded, shown]);

    return state;
}
