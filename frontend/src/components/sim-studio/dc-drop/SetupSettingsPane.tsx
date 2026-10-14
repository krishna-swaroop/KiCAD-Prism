import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { SimSetup } from "../types";

import { netLeaf } from "./board-index";
import { settingsOf, withSetting, type Settings } from "./settings";

/**
 * The DC drop analysis's mesher and solver settings, by theme. Every field
 * shows the engine's own default; leaving it empty means "use the default",
 * and the run records what the engine used (sim-adr-0019).
 */

interface FieldBase {
    section: string;
    key: string;
    label: string;
    help?: string;
    /** Only shown when this predicate holds for the analysis settings. */
    when?: (settings: Settings) => boolean;
}

type Field =
    | (FieldBase & { kind: "bool"; fallback: boolean })
    | (FieldBase & { kind: "number"; fallback?: number; unit?: string; min?: number; max?: number; step?: number })
    | (FieldBase & { kind: "choice"; fallback: string; options: { value: string; label: string }[] })
    | (FieldBase & { kind: "set"; fallback: string[]; options: { value: string; label: string }[] });

const adaptiveOn = (settings: Settings) => settings.mesh?.adaptive === true;

export const SETTING_GROUPS: { title: string; summary: string; fields: Field[] }[] = [
    {
        title: "Mesh",
        summary: "How finely the copper is cut into cells.",
        fields: [
            { section: "mesh", key: "adaptive", kind: "bool", fallback: false, label: "Adaptive refinement",
                help: "Starts coarse and refines where each net's estimated error is largest, and around vias and pads. Recommended." },
            { section: "mesh", key: "max_adaptive_passes", kind: "number", fallback: 40, min: 1, max: 200, step: 1, label: "Passes", when: adaptiveOn,
                help: "Solves before it stops; each refines the worst cells." },
            { section: "mesh", key: "target_error", kind: "number", min: 0, step: 0.001, label: "Target error", when: adaptiveOn,
                help: "Stop early once the worst net's relative error estimate is below this (e.g. 0.01 = 1 %)." },
            { section: "mesh", key: "refine_near_vias", kind: "bool", fallback: true, label: "Refine around vias", when: adaptiveOn },
            { section: "mesh", key: "refine_near_terminals", kind: "bool", fallback: true, label: "Refine around pads", when: adaptiveOn },
            { section: "mesh", key: "accuracy_level", kind: "number", fallback: 1, min: 0, max: 16, step: 1, label: "Accuracy level",
                help: "Sets the cell budget: each level about doubles the unknowns." },
            { section: "mesh", key: "representative_point", kind: "choice", fallback: "fragment-centroid", label: "Cell node",
                options: [{ value: "fragment-centroid", label: "Copper centroid" }, { value: "cell-blend", label: "Cell blend" }] },
        ],
    },
    {
        title: "Terminals",
        summary: "How sources and loads meet the copper.",
        fields: [
            { section: "terminals", key: "contact", kind: "choice", fallback: "ideal-pad", label: "Pad contact",
                help: "Equipotential pads crowd current to the pad edge as a soldered pin does; uniform flux spreads it over the pad.",
                options: [{ value: "ideal-pad", label: "Equipotential pad" }, { value: "distributed", label: "Uniform flux" }] },
            { section: "terminals", key: "source_pin_resistance_ohm", kind: "number", fallback: 1e-6, min: 0, step: 1e-6, unit: "Ω",
                label: "Source pin resistance", help: "Series resistance of each source pad." },
            { section: "terminals", key: "pad_association", kind: "choice", fallback: "touch", label: "Pad to copper",
                options: [{ value: "touch", label: "Every touching cell" }, { value: "majority", label: "Majority cell" }] },
        ],
    },
    {
        title: "Vias",
        summary: "Barrel plating and how pads meet barrels.",
        fields: [
            { section: "vias", key: "plating_um", kind: "number", fallback: 25, min: 1, step: 1, unit: "µm", label: "Plating thickness" },
            { section: "vias", key: "pad_to_barrel", kind: "choice", fallback: "annular-ring", label: "Pad to barrel",
                help: "The annular-ring wall contact converges to the exact spreading drop; the land contact reads about 6 % low.",
                options: [{ value: "annular-ring", label: "Annular ring (wall)" }, { value: "ideal", label: "Ideal land" }] },
        ],
    },
    {
        title: "Copper",
        summary: "Temperature and geometry clean-up.",
        fields: [
            { section: "temperature", key: "board_c", kind: "number", fallback: 20, step: 1, unit: "°C", label: "Copper temperature",
                help: "Scales copper resistivity (about +0.39 % per °C above 20 °C)." },
            { section: "copper_cleanup", key: "drop_floating_islands", kind: "bool", fallback: true, label: "Drop floating islands",
                help: "Copper not connected to any terminal is left out of the solve." },
            { section: "lowering", key: "chord_tolerance_um", kind: "number", fallback: 1, min: 0.01, step: 0.1, unit: "µm", label: "Arc chord tolerance" },
        ],
    },
    {
        title: "Solver",
        summary: "The sparse linear solve.",
        fields: [
            { section: "linear_solver", key: "backend", kind: "choice", fallback: "faer-sparse-cholesky", label: "Factorization",
                help: "Cholesky falls back to LU by itself if the system is not positive definite.",
                options: [{ value: "faer-sparse-cholesky", label: "Sparse Cholesky" }, { value: "faer-sparse-lu", label: "Sparse LU" }] },
        ],
    },
    {
        title: "Outputs",
        summary: "What the run writes for the Results tab.",
        fields: [
            { section: "outputs", key: "fields", kind: "set", fallback: ["voltage", "current-density", "power-density"], label: "Field maps",
                options: [
                    { value: "voltage", label: "Voltage" },
                    { value: "current-density", label: "Current density" },
                    { value: "power-density", label: "Power density" },
                ] },
            { section: "outputs", key: "via_currents", kind: "bool", fallback: true, label: "Via currents and densities" },
        ],
    },
];

type Props = {
    setup: SimSetup;
    canEdit: boolean;
    onChange: (setup: SimSetup) => void;
};

export function SetupSettingsPane({ setup, canEdit, onChange }: Props) {
    const settings = settingsOf(setup);
    const solved = new Set(setup.analyses[0]?.rails ?? []);
    const set = (section: string, key: string, value: unknown) => onChange(withSetting(setup, section, key, value));
    const toggleRail = (id: string) => {
        const next = structuredClone(setup);
        const rails = next.analyses[0].rails;
        next.analyses[0].rails = solved.has(id) ? rails.filter((rail) => rail !== id) : [...rails, id];
        onChange(next);
    };
    return (
        <div className="space-y-2 p-3" aria-label="Simulation settings">
            <Group title="Analysis" summary={`${solved.size} of ${setup.rails.length} rails solved`}>
                {setup.rails.length === 0 && <p className="text-xs text-muted-foreground">Add rails on the canvas first.</p>}
                <ul className="space-y-1">
                    {setup.rails.map((rail) => (
                        <li key={rail.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                id={`solve-${rail.id}`}
                                checked={solved.has(rail.id)}
                                disabled={!canEdit}
                                onCheckedChange={() => toggleRail(rail.id)}
                            />
                            <label htmlFor={`solve-${rail.id}`} className="flex-1 truncate font-mono text-xs">{netLeaf(rail.net.slice(rail.net.indexOf(":") + 1))}</label>
                            <span className="text-xs tabular-nums text-muted-foreground">{rail.voltage_v} V</span>
                        </li>
                    ))}
                </ul>
            </Group>
            {SETTING_GROUPS.map((group) => {
                const fields = group.fields.filter((field) => !field.when || field.when(settings));
                const changed = fields.filter((field) => settings[field.section]?.[field.key] !== undefined).length;
                return (
                    <Group key={group.title} title={group.title} summary={changed ? `${changed} changed` : group.summary}>
                        {fields.map((field) => (
                            <SettingField
                                key={`${field.section}.${field.key}`}
                                field={field}
                                value={settings[field.section]?.[field.key]}
                                canEdit={canEdit}
                                onChange={(value) => set(field.section, field.key, value)}
                            />
                        ))}
                    </Group>
                );
            })}
        </div>
    );
}

function Group({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
                <span className="text-sm font-semibold">{title}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{summary}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 border-t px-3 py-3">{children}</CollapsibleContent>
        </Collapsible>
    );
}

function SettingField({ field, value, canEdit, onChange }: {
    field: Field;
    value: unknown;
    canEdit: boolean;
    onChange: (value: unknown) => void;
}) {
    const id = `setting-${field.section}-${field.key}`;
    const reset = value !== undefined && canEdit && (
        <button type="button" title="Use the engine default" aria-label={`Reset ${field.label}`}
            className="text-muted-foreground hover:text-foreground" onClick={() => onChange(undefined)}>
            <RotateCcw className="size-3.5" aria-hidden />
        </button>
    );
    let control: ReactNode;
    if (field.kind === "bool") {
        const checked = typeof value === "boolean" ? value : field.fallback;
        control = <Checkbox id={id} checked={checked} disabled={!canEdit} onCheckedChange={(next) => onChange(next === true)} />;
    } else if (field.kind === "number") {
        control = (
            <div className="flex items-center gap-1">
                <Input
                    id={id}
                    key={String(value)}
                    type="number"
                    className="h-7 w-28 text-right tabular-nums"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? "any"}
                    disabled={!canEdit}
                    placeholder={field.fallback === undefined ? "off" : String(field.fallback)}
                    defaultValue={typeof value === "number" ? value : ""}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    onBlur={(event) => {
                        const text = event.target.value.trim();
                        const parsed = text === "" ? undefined : Number(text);
                        if (parsed !== undefined && !Number.isFinite(parsed)) return;
                        if (parsed !== value) onChange(parsed);
                    }}
                />
                {field.unit && <span className="w-6 text-xs text-muted-foreground">{field.unit}</span>}
            </div>
        );
    } else if (field.kind === "choice") {
        control = (
            <select
                id={id}
                className="h-7 max-w-[11rem] rounded-md border bg-background px-2 text-xs"
                value={typeof value === "string" ? value : field.fallback}
                disabled={!canEdit}
                onChange={(event) => onChange(event.target.value === field.fallback && value === undefined ? undefined : event.target.value)}
            >
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        );
    } else {
        const chosen = new Set(Array.isArray(value) ? (value as string[]) : field.fallback);
        control = (
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                {field.options.map((option) => (
                    <label key={option.value} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                            checked={chosen.has(option.value)}
                            disabled={!canEdit}
                            onCheckedChange={() => {
                                const next = new Set(chosen);
                                if (next.has(option.value)) next.delete(option.value);
                                else next.add(option.value);
                                onChange(field.options.map((item) => item.value).filter((item) => next.has(item)));
                            }}
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        );
    }
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <label htmlFor={id} className="flex-1 text-sm">{field.label}</label>
                {reset}
                {control}
            </div>
            {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
        </div>
    );
}
