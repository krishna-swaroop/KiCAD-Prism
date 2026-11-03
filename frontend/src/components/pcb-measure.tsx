import { useCallback, useEffect, useState } from "react";
import { Ruler, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { useEcadViewer, type EcadViewer } from "@/lib/ecad-viewer";
import type { EcadMeasureSnap, EcadMeasureUnits } from "@/types/ecad-viewer";

export const MEASURE_SHORTCUT = "mod+shift+m";
export const MEASURE_UNITS_STORAGE_KEY = "prism.pcb.measure-units";
const MM_PER_MIL = 0.0254;

/** 3 decimals in millimetres, 1 in mils, as the viewer's label. */
export function formatLength(mm: number, units: EcadMeasureUnits): string {
    return units === "mil" ? (mm / MM_PER_MIL).toFixed(1) : mm.toFixed(3);
}

/**
 * Measure mode of the PCB element. Mirrors the element's state and its
 * change event, so Cmd/Ctrl+Shift+M and the rail button always agree.
 */
export function useMeasureMode(viewer: EcadViewer | null) {
    const { measureMode: on, measureAvailable: available } = useEcadViewer(viewer);
    const toggle = useCallback(() => viewer?.setMeasureMode(!on), [on, viewer]);
    return { on, toggle, available };
}

function readStoredUnits(): EcadMeasureUnits {
    try {
        return window.localStorage.getItem(MEASURE_UNITS_STORAGE_KEY) === "mil" ? "mil" : "mm";
    } catch {
        return "mm";
    }
}

/**
 * The reviewer's mm/mil choice, kept per browser. The element hears it each
 * time measure mode turns on (by button or key) and on every change.
 */
export function useMeasureUnits(viewer: EcadViewer | null) {
    const [units, setUnits] = useState<EcadMeasureUnits>(readStoredUnits);
    const unitsRef = useCommittedRef(units);
    useEffect(() => {
        if (!viewer) return;
        const off = viewer.on("measure-mode", ({ on }) => {
            if (on) viewer.setMeasureUnits(unitsRef.current);
        });
        return () => off();
    }, [viewer, unitsRef]);
    const choose = useCallback((next: EcadMeasureUnits) => {
        setUnits(next);
        viewer?.setMeasureUnits(next);
        try {
            window.localStorage.setItem(MEASURE_UNITS_STORAGE_KEY, next);
        } catch {
            // Storage blocked: the choice lasts for this page only.
        }
    }, [viewer]);
    return [units, choose] as const;
}

export function MeasureModeToggle({ viewer }: { viewer: EcadViewer | null }) {
    const { on, toggle, available } = useMeasureMode(viewer);
    if (!available) return null;
    return (
        <Button
            variant={on ? "secondary" : "ghost"}
            size="icon"
            className={cn("size-8", on && "text-primary")}
            onClick={toggle}
            aria-pressed={on}
            aria-label="Measure"
            title={`Measure · ${shortcutKeys(MEASURE_SHORTCUT).join("")}`}
        >
            <Ruler className="size-4" />
        </Button>
    );
}

function snapName(snap: EcadMeasureSnap): string {
    return snap.label || "point";
}

const Divider = () => <span className="h-5 w-px shrink-0 bg-border" aria-hidden />;

/** A label in the muted tone and its value, as one reading. */
function Reading({ label, value }: { label: string; value: string }) {
    return (
        <span className="whitespace-nowrap">
            <span className="text-muted-foreground">{label}</span>{" "}
            <span className="text-foreground">{value}</span>
        </span>
    );
}

/**
 * The readout under the board while measure mode is on: the distance, ΔX,
 * ΔY and the angle, the two ends, the units, and the way out.
 */
export function MeasureReadout({ viewer }: { viewer: EcadViewer | null }) {
    const { on } = useMeasureMode(viewer);
    const state = useEcadViewer(viewer).measureState;
    const [units, setUnits] = useMeasureUnits(viewer);
    if (!on) return null;
    const measurement = state?.measurement ?? null;
    const unit = units === "mil" ? "mil" : "mm";
    const ends = measurement
        ? [measurement.a, measurement.b].map((snap) => [snapName(snap), snap.net].filter(Boolean).join(" · ")).join(" → ")
        : "";
    return (
        <section
            aria-label="Measure"
            className="pointer-events-auto flex h-9 max-w-full items-center gap-2.5 rounded-lg border bg-background/90 pl-3 pr-1 text-xs shadow-lg backdrop-blur-md"
        >
            <Ruler className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 font-mono tabular-nums" aria-label="Distance">
                {measurement ? (
                    <>
                        <span className="text-sm font-semibold text-primary">{formatLength(measurement.distance, units)}</span>{" "}
                        <span className="text-muted-foreground">{unit}</span>
                    </>
                ) : (
                    <span className="text-muted-foreground">—</span>
                )}
            </span>
            {measurement ? (
                <>
                    <Divider />
                    <span className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
                        <Reading label="ΔX" value={formatLength(measurement.dx, units)} />
                        <Reading label="ΔY" value={formatLength(measurement.dy, units)} />
                        <Reading label="∠" value={`${measurement.angle.toFixed(2)}°`} />
                    </span>
                    <Divider />
                    <span className="min-w-0 max-w-[18rem] truncate text-muted-foreground" title={ends}>
                        {snapName(measurement.a)} → {snapName(measurement.b)}
                    </span>
                </>
            ) : null}
            <div className="flex shrink-0 items-center rounded-md bg-muted p-0.5" role="group" aria-label="Units">
                {(["mm", "mil"] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        aria-pressed={units === option}
                        onClick={() => setUnits(option)}
                        className={cn(
                            "h-6 rounded-sm px-2 font-medium transition-colors",
                            units === option
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Leave measure mode"
                title={`Leave measure mode · ${shortcutKeys(MEASURE_SHORTCUT).join("")}`}
                onClick={() => viewer?.setMeasureMode(false)}
            >
                <X aria-hidden />
            </Button>
        </section>
    );
}
