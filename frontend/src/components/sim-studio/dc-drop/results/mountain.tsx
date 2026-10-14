import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { FloatingToolbar } from "@/features/system-builder/workspace/floating-toolbar";

import type { LoadedGrid, RunOverlayState } from "../../run-overlay";
import type { SimRun } from "../../types";

import { EChart, type ChartTheme } from "./echart";
import { downsample, fieldArtifact, gridOf } from "./grids";

type Ready = Extract<RunOverlayState, { phase: "ready" }>;

const SIDE = 180;

/** Engineering units for the surface's height. */
function scaleOf(units: string): { scale: number; unit: string } {
    if (units === "A/m^2") return { scale: 1e-6, unit: "A/mm²" };
    if (units === "W/m^3") return { scale: 1e-9, unit: "W/mm³" };
    if (units === "V") return { scale: 1e3, unit: "mV" };
    return { scale: 1, unit: units };
}

/**
 * The shown field as height over one copper layer: the "mountain" view.
 * Drawn from the run's own field grid, so it needs no extra engine output.
 */
export function MountainView({ projectId, run, overlay, quantity, stops }: {
    projectId: string;
    run: SimRun;
    overlay: Ready;
    quantity: string;
    stops: string[];
}) {
    const [grid, setGrid] = useState<LoadedGrid | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [sliceKey, setSliceKey] = useState<string | null>(null);

    useEffect(() => {
        setGrid(null);
        setFailed(null);
        const artifact = fieldArtifact(overlay.result, quantity, overlay.net) ?? fieldArtifact(overlay.result, "voltage_v", overlay.net);
        if (!artifact) {
            setFailed("This run has no field grid to raise.");
            return;
        }
        let cancelled = false;
        gridOf(projectId, run.run_id, artifact)
            .then((value) => { if (!cancelled) setGrid(value); })
            .catch((error) => { if (!cancelled) setFailed(error instanceof Error ? error.message : String(error)); });
        return () => { cancelled = true; };
    }, [overlay.net, overlay.result, projectId, quantity, run.run_id]);

    // The layer with the most copper, unless one was picked.
    const slices = useMemo(() => (grid?.grid.slices ?? [])
        .map((slice) => ({ key: slice.slice_key, copper: slice.values.reduce((n, v) => n + (Number.isFinite(v) ? 1 : 0), 0) }))
        .filter((slice) => slice.copper > 0)
        .sort((a, b) => b.copper - a.copper), [grid]);
    const shown = sliceKey && slices.some((slice) => slice.key === sliceKey) ? sliceKey : slices[0]?.key;

    const option = useCallback((theme: ChartTheme) => {
        if (!grid || !shown) return {};
        const slice = grid.grid.slices.find((item) => item.slice_key === shown)!;
        const reduced = downsample(slice, SIDE);
        const { scale, unit } = scaleOf(grid.units);
        const pitch = grid.grid.dx_m * 1e3 * reduced.step;
        const x0 = (grid.grid.origin_x_m + slice.ix0 * grid.grid.dx_m) * 1e3;
        const y0 = (grid.grid.origin_y_m + slice.iy0 * grid.grid.dy_m) * 1e3;
        const data: (number | string)[][] = [];
        let min = Infinity;
        let max = -Infinity;
        for (let j = 0; j < reduced.ny; j += 1) {
            for (let i = 0; i < reduced.nx; i += 1) {
                const v = reduced.values[j * reduced.nx + i] * scale;
                if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
                // Board y points down the board; the 3D axis points away from the viewer. Negate it so
                // the board's front edge is nearest, as in the Flat view, instead of a mirror image.
                data.push([x0 + (i + 0.5) * pitch, -(y0 + (j + 0.5) * pitch), Number.isFinite(v) ? v : "-"]);
            }
        }
        const axis = {
            axisLine: { lineStyle: { color: theme.muted } },
            axisLabel: { color: theme.muted, fontSize: 10, formatter: (v: number) => `${+v.toPrecision(4)}` },
            nameTextStyle: { color: theme.muted, fontSize: 11 },
            splitLine: { lineStyle: { color: theme.border } },
            axisPointer: { lineStyle: { color: theme.primary } },
        };
        const width = reduced.nx * pitch;
        const depth = reduced.ny * pitch;
        return {
            backgroundColor: "transparent",
            tooltip: { show: false },
            visualMap: {
                show: true, dimension: 2, min, max, inRange: { color: stops }, calculable: false,
                orient: "horizontal", left: 12, bottom: 12, itemWidth: 10, itemHeight: 160,
                text: [`${+max.toPrecision(4)} ${unit}`, `${+min.toPrecision(4)}`],
                textStyle: { color: theme.muted, fontSize: 11 },
            },
            xAxis3D: { type: "value", name: "x (mm)", min: x0, max: x0 + width, ...axis },
            yAxis3D: {
                type: "value", name: "y (mm)", min: -(y0 + depth), max: -y0, ...axis,
                axisLabel: { ...axis.axisLabel, formatter: (v: number) => `${+(-v).toPrecision(4)}` },
            },
            zAxis3D: { type: "value", name: unit, min, max, ...axis },
            grid3D: {
                boxWidth: 100, boxDepth: (100 * depth) / width, boxHeight: 28,
                axisLine: { lineStyle: { color: theme.muted } },
                splitLine: { lineStyle: { color: theme.border } },
                axisPointer: { show: false },
                viewControl: { distance: 170, alpha: 32, beta: 20 },
                light: { main: { intensity: 0.45, shadow: false }, ambient: { intensity: 0.85 } },
            },
            series: [{
                type: "surface", data, shading: "lambert", silent: true,
                dataShape: [reduced.ny, reduced.nx],
                wireframe: { show: false },
            }],
        };
    }, [grid, shown, stops]);

    if (failed) return <p className="p-6 text-sm text-muted-foreground">{failed}</p>;
    if (!grid) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    return (
        <div className="relative h-full w-full bg-background">
            <EChart gl option={option} />
            {slices.length > 1 && (
                <div className="absolute right-3 top-2">
                    <FloatingToolbar label="Layer">
                        <select aria-label="Layer" className="h-7 rounded bg-transparent px-1.5 text-xs outline-none" value={shown}
                            onChange={(event) => setSliceKey(event.target.value)}>
                            {slices.map((slice) => <option key={slice.key} value={slice.key}>{slice.key.replace(/^copper\./, "")}</option>)}
                        </select>
                    </FloatingToolbar>
                </div>
            )}
        </div>
    );
}
