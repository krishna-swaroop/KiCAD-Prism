import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PrismAnalyticStyle, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

const STORAGE_KEY = "prism.sim.result-look";

/** What a host shows before the viewer reports its own colormaps. */
const FALLBACK_STOPS: Record<string, string[]> = {
    viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    ember: ["#e0e3ed", "#ff9e1f", "#db141a"],
};

function stored(): Partial<PrismAnalyticStyle> {
    try {
        const text = window.localStorage.getItem(STORAGE_KEY);
        return text ? (JSON.parse(text) as Partial<PrismAnalyticStyle>) : {};
    } catch {
        return {};
    }
}

function store(look: Partial<PrismAnalyticStyle>) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
    } catch {
        // A blocked store only loses the preference.
    }
}

/** A CSS gradient through a colormap's stops. */
export function gradientOf(stops: string[]): string {
    return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * The look of result overlays (colormaps and arrows): remembered in this
 * browser, applied to the viewer whenever `active` (its overlay is drawn),
 * with the viewer's colormap stops for legends and pickers.
 */
export function useResultLook(viewer: PrismSemanticViewerElement | null, active: boolean) {
    const [look, setLook] = useState<Partial<PrismAnalyticStyle>>(stored);
    const [catalog, setCatalog] = useState<{ colormaps: Record<string, string[]>; defaults: PrismAnalyticStyle } | null>(null);

    useEffect(() => {
        if (!viewer || !active || typeof viewer.setAnalyticStyle !== "function") return;
        setCatalog(viewer.analyticColormaps?.() ?? null);
        try {
            viewer.setAnalyticStyle(look);
        } catch {
            // A stored look the viewer no longer accepts: back to its defaults.
            setLook({});
        }
    }, [active, look, viewer]);

    const style = { ...(catalog?.defaults ?? {}), ...look } as Partial<PrismAnalyticStyle>;
    const stopsOf = (colormap: string | string[] | undefined, fallback: string) =>
        Array.isArray(colormap) ? colormap : catalog?.colormaps[colormap ?? fallback] ?? FALLBACK_STOPS[fallback];
    return {
        style,
        colormaps: catalog ? Object.keys(catalog.colormaps) : Object.keys(FALLBACK_STOPS),
        fieldStops: stopsOf(style.fieldColormap, "viridis"),
        arrowStops: stopsOf(style.arrowColormap, "ember"),
        update(change: Partial<PrismAnalyticStyle>) {
            const next = { ...look, ...change };
            setLook(next);
            store(next);
        },
        reset() {
            setLook({});
            store({});
        },
    };
}

type Look = ReturnType<typeof useResultLook>;

function Ramp({ label, value, colormaps, stopsOf, onChange }: {
    label: string;
    value: string | string[] | undefined;
    colormaps: string[];
    stopsOf: (name: string) => string[] | undefined;
    onChange: (name: string) => void;
}) {
    const current = typeof value === "string" ? value : "custom";
    return (
        <label className="flex items-center justify-between gap-2">
            <span>{label}</span>
            <span className="flex items-center gap-2">
                <span className="h-2 w-16 rounded" style={{ background: gradientOf(stopsOf(current) ?? ["#888", "#888"]) }} />
                <select aria-label={label} className="h-7 rounded-md border bg-background px-1" value={current} onChange={(event) => onChange(event.target.value)}>
                    {current === "custom" && <option value="custom">custom</option>}
                    {colormaps.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
            </span>
        </label>
    );
}

function Slider({ label, value, min, max, step, onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-2">
            <span>{label}</span>
            <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        </label>
    );
}

/** A small panel of the overlay's look; every change applies at once. */
export function LookPanel({ look, catalog }: { look: Look; catalog: Record<string, string[]> | null }) {
    const [open, setOpen] = useState(false);
    const stopsOf = (name: string) => catalog?.[name] ?? FALLBACK_STOPS[name];
    const { style } = look;
    return (
        <div className="relative">
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Look
            </Button>
            {open && (
                <div className="absolute right-0 top-8 z-20 w-72 space-y-2 rounded-md border bg-background p-3 text-xs shadow-lg">
                    <Ramp label="Copper colours" value={style.fieldColormap} colormaps={look.colormaps} stopsOf={stopsOf} onChange={(name) => look.update({ fieldColormap: name })} />
                    <Ramp label="Arrow colours" value={style.arrowColormap} colormaps={look.colormaps} stopsOf={stopsOf} onChange={(name) => look.update({ arrowColormap: name })} />
                    <Slider label="Arrow density" value={style.arrowDensity ?? 70} min={15} max={200} step={5} onChange={(value) => look.update({ arrowDensity: value })} />
                    <Slider label="Arrow width" value={style.arrowWidth ?? 0.07} min={0.02} max={0.2} step={0.01} onChange={(value) => look.update({ arrowWidth: value })} />
                    <Slider label="Shortest arrow" value={style.arrowMinLength ?? 0.3} min={0.05} max={1} step={0.05} onChange={(value) => look.update({ arrowMinLength: value })} />
                    <Slider
                        label="Arrow outline"
                        value={style.arrowOutline?.[3] ?? 0.85}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(value) => look.update({ arrowOutline: [...(style.arrowOutline ?? [0.05, 0.05, 0.07, 0.85]).slice(0, 3), value] as PrismAnalyticStyle["arrowOutline"] })}
                    />
                    <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={look.reset}>Reset to defaults</Button>
                </div>
            )}
        </div>
    );
}
