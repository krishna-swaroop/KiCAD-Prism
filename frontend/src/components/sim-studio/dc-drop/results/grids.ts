import { loadGrid, runBase, type LoadedGrid, type ResultArtifact, type RunResult } from "../../run-overlay";

/** Field grids of a run, fetched once per page. */
const cache = new Map<string, Promise<LoadedGrid>>();

export function fieldArtifact(result: RunResult, quantity: string, net: string | null): ResultArtifact | undefined {
    return result.artifacts.find((item) => item.kind === "field-grid"
        && (item.quantity ?? "voltage_v") === quantity
        && (!net || !item.net || item.net === net));
}

export function gridOf(projectId: string, runId: string, artifact: ResultArtifact): Promise<LoadedGrid> {
    const key = `${runId}/${artifact.path}`;
    let grid = cache.get(key);
    if (!grid) {
        grid = loadGrid(runBase(projectId, runId), artifact);
        grid.catch(() => cache.delete(key));
        cache.set(key, grid);
    }
    return grid;
}

type Slice = LoadedGrid["grid"]["slices"][number];

/** A slice's value at a board point (mm), bilinear where all four cells are copper. */
export function sampleAt(grid: LoadedGrid["grid"], slice: Slice, mm: [number, number]): number {
    const pitchX = grid.dx_m * 1e3;
    const pitchY = grid.dy_m * 1e3;
    const originX = (grid.origin_x_m + slice.ix0 * grid.dx_m) * 1e3;
    const originY = (grid.origin_y_m + slice.iy0 * grid.dy_m) * 1e3;
    const u = (mm[0] - originX) / pitchX - 0.5;
    const v = (mm[1] - originY) / pitchY - 0.5;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= slice.nx || j >= slice.ny ? NaN : slice.values[j * slice.nx + i]);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fx = u - i;
    const fy = v - j;
    const s = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
    if (s.every(Number.isFinite)) return (s[0] * (1 - fx) + s[1] * fx) * (1 - fy) + (s[2] * (1 - fx) + s[3] * fx) * fy;
    return at(Math.floor(u + 0.5), Math.floor(v + 0.5));
}

/** Values along a line on one slice; gaps (no copper) are NaN. */
export function profile(grid: LoadedGrid["grid"], sliceKey: string | undefined, a: [number, number], b: [number, number], samples = 240) {
    const slice = grid.slices.find((item) => item.slice_key === sliceKey) ?? grid.slices[0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const points: [number, number][] = [];
    for (let k = 0; k <= samples; k += 1) {
        const t = k / samples;
        points.push([t * length, sampleAt(grid, slice, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])]);
    }
    return { slice: slice?.slice_key, length, points };
}

/** Copper area (mm²) by value: `bins` equal bins from 0 to the largest value. */
export function histogram(grid: LoadedGrid["grid"], bins = 40, scale = 1) {
    const cell = grid.dx_m * grid.dy_m * 1e6;
    let top = 0;
    for (const slice of grid.slices) for (const value of slice.values) if (Number.isFinite(value)) top = Math.max(top, Math.abs(value) * scale);
    const width = top / bins || 1;
    const area = new Array<number>(bins).fill(0);
    const all: number[] = [];
    for (const slice of grid.slices) {
        for (const value of slice.values) {
            if (!Number.isFinite(value)) continue;
            const v = Math.abs(value) * scale;
            all.push(v);
            area[Math.min(bins - 1, Math.floor(v / width))] += cell;
        }
    }
    all.sort((x, y) => x - y);
    const quantile = (q: number) => all[Math.min(all.length - 1, Math.floor(q * all.length))] ?? 0;
    return {
        edges: area.map((_, index) => index * width),
        width,
        area,
        total: all.length * cell,
        p95: quantile(0.95),
        p99: quantile(0.99),
        max: top,
    };
}
