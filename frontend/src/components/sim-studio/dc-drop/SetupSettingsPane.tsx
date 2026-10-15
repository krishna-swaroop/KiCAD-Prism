import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight, CircleDot, Cpu, FileOutput, Grid3x3, Info, Plug, RotateCcw, Thermometer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SimSetup } from "../types";

import { netLeaf } from "./board-index";
import { settingsOf, withSetting, type Settings } from "./settings";
import { StudioTabsList, StudioTabsTrigger } from "../studio-tabs";

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

type Group = { title: string; icon: ComponentType<{ className?: string }>; fields: Field[] };

export const SETTING_GROUPS: Group[] = [
    {
        title: "Mesh",
        icon: Grid3x3,
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
        icon: Plug,
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
        icon: CircleDot,
        fields: [
            { section: "vias", key: "plating_um", kind: "number", fallback: 25, min: 1, step: 1, unit: "µm", label: "Plating thickness" },
            { section: "vias", key: "pad_to_barrel", kind: "choice", fallback: "annular-ring", label: "Pad to barrel",
                help: "The annular-ring wall contact converges to the exact spreading drop; the land contact reads about 6 % low.",
                options: [{ value: "annular-ring", label: "Annular ring (wall)" }, { value: "ideal", label: "Ideal land" }] },
        ],
    },
    {
        title: "Copper",
        icon: Thermometer,
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
        icon: Cpu,
        fields: [
            { section: "linear_solver", key: "backend", kind: "choice", fallback: "faer-sparse-cholesky", label: "Factorization",
                help: "Cholesky falls back to LU by itself if the system is not positive definite.",
                options: [{ value: "faer-sparse-cholesky", label: "Sparse Cholesky" }, { value: "faer-sparse-lu", label: "Sparse LU" }] },
        ],
    },
    {
        title: "Outputs",
        icon: FileOutput,
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

/**
 * One choice for how hard the mesher works, over the fields that decide it.
 * Each preset writes explicit values (or clears them back to the engine
 * default), so a run still records exactly what it used (sim-adr-0016).
 */
const ACCURACY_KEYS = ["adaptive", "max_adaptive_passes", "accuracy_level", "target_error"] as const;
export const ACCURACY_PRESETS: { id: string; label: string; hint: string; mesh: Record<(typeof ACCURACY_KEYS)[number], unknown> }[] = [
    { id: "fast", label: "Fast", hint: "Coarse cells and 12 refinement passes: a first look in seconds.",
        mesh: { adaptive: true, max_adaptive_passes: 12, accuracy_level: 0, target_error: undefined } },
    { id: "balanced", label: "Balanced", hint: "The engine's defaults: 40 adaptive passes at accuracy level 1.",
        mesh: { adaptive: true, max_adaptive_passes: undefined, accuracy_level: undefined, target_error: undefined } },
    { id: "precise", label: "Precise", hint: "About twice the cells and 80 passes, for sign-off numbers.",
        mesh: { adaptive: true, max_adaptive_passes: 80, accuracy_level: 2, target_error: undefined } },
];

function presetOf(settings: Settings): string | null {
    const mesh = settings.mesh ?? {};
    return ACCURACY_PRESETS.find((preset) => ACCURACY_KEYS.every((key) => mesh[key] === preset.mesh[key]))?.id ?? null;
}

type Props = {
    setup: SimSetup;
    canEdit: boolean;
    onChange: (setup: SimSetup) => void;
};

export function SetupSettingsPane({ setup, canEdit, onChange }: Props) {
    const settings = settingsOf(setup);
    const solved = new Set(setup.analyses[0]?.rails ?? []);
    const changed = Object.values(settings).reduce((count, section) => count + Object.keys(section ?? {}).length, 0);
    const set = (section: string, key: string, value: unknown) => onChange(withSetting(setup, section, key, value));
    const setRails = (rails: string[]) => {
        const next = structuredClone(setup);
        next.analyses[0].rails = rails;
        onChange(next);
    };
    const toggleRail = (id: string) =>
        setRails(solved.has(id) ? [...solved].filter((rail) => rail !== id) : setup.rails.map((rail) => rail.id).filter((rail) => rail === id || solved.has(rail)));
    const applyPreset = (id: string) => {
        const preset = ACCURACY_PRESETS.find((item) => item.id === id);
        if (!preset) return;
        let next = setup;
        for (const key of ACCURACY_KEYS) next = withSetting(next, "mesh", key, preset.mesh[key]);
        onChange(next);
    };
    const resetAll = () => {
        const next = structuredClone(setup);
        next.analyses[0].settings = {};
        onChange(next);
    };
    const preset = presetOf(settings);

    return (
        <div className="flex h-full min-h-0 flex-col bg-background" aria-label="Simulation settings">
            <header className="flex h-11 shrink-0 items-center gap-2 px-4">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Settings</h2>
                {changed > 0 && <Badge variant="info">{changed} changed</Badge>}
                {changed > 0 && canEdit && (
                    <Button variant="ghost" size="sm" onClick={resetAll}>
                        <RotateCcw aria-hidden /> Reset
                    </Button>
                )}
            </header>
            <Separator />

            <ScrollArea className="themed-scrollbar min-h-0 flex-1 [scrollbar-gutter:stable]">
                <Section
                    title="Rails to solve"
                    aside={setup.rails.length > 0 && (
                        <span className="flex items-center gap-1">
                            <span className="text-xs tabular-nums text-muted-foreground">{solved.size}/{setup.rails.length}</span>
                            {canEdit && (
                                <>
                                    <Separator orientation="vertical" className="mx-1 h-3" />
                                    <Button variant="link" size="xs" className="px-1" disabled={solved.size === setup.rails.length}
                                        onClick={() => setRails(setup.rails.map((rail) => rail.id))}>All</Button>
                                    <Button variant="link" size="xs" className="px-1" disabled={solved.size === 0} onClick={() => setRails([])}>None</Button>
                                </>
                            )}
                        </span>
                    )}
                >
                    {setup.rails.length === 0 ? (
                        <Card className="items-center border-dashed py-4 text-muted-foreground">No rails yet</Card>
                    ) : (
                        <ul className="space-y-1.5">
                            {setup.rails.map((rail) => (
                                <RailRow key={rail.id} setup={setup} rail={rail} on={solved.has(rail.id)} canEdit={canEdit} onToggle={() => toggleRail(rail.id)} />
                            ))}
                        </ul>
                    )}
                </Section>
                <Separator />

                <Section title="Accuracy" aside={!preset && <Badge variant="outline">Custom</Badge>}>
                    <Segmented
                        label="Accuracy"
                        value={preset}
                        disabled={!canEdit}
                        options={ACCURACY_PRESETS.map((item) => ({ value: item.id, label: item.label, title: item.hint }))}
                        onChange={applyPreset}
                    />
                </Section>
                <Separator />

                <Section title="Advanced">
                    <Card className="gap-0 py-0">
                        {SETTING_GROUPS.map((group, index) => (
                            <div key={group.title}>
                                {index > 0 && <Separator />}
                                <AdvancedGroup group={group} settings={settings} canEdit={canEdit} onSet={set} />
                            </div>
                        ))}
                    </Card>
                </Section>
            </ScrollArea>
        </div>
    );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="px-4 py-4">
            <div className="mb-2.5 flex h-6 items-center gap-2">
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
                {aside}
            </div>
            {children}
        </section>
    );
}

function RailRow({ setup, rail, on, canEdit, onToggle }: {
    setup: SimSetup;
    rail: SimSetup["rails"][number];
    on: boolean;
    canEdit: boolean;
    onToggle: () => void;
}) {
    const loads = setup.loads.filter((load) => load.rail === rail.id);
    const current = loads.reduce((sum, load) => sum + (load.current_a || 0), 0);
    const converters = setup.converters.filter((converter) => converter.input_rail === rail.id).length;
    const feeds = setup.sources.filter((source) => source.rail === rail.id)
        .map((source) => (source.component ?? source.id).replace(/^[^:]*:/, ""));
    const id = `solve-${rail.id}`;
    const net = netLeaf(rail.net.slice(rail.net.indexOf(":") + 1));
    const meta = [
        feeds.length ? `from ${feeds.slice(0, 2).join(", ")}${feeds.length > 2 ? ` +${feeds.length - 2}` : ""}` : "no source",
        loads.length || !converters ? `${loads.length} load${loads.length === 1 ? "" : "s"}` : null,
        converters ? `feeds ${converters} converter${converters === 1 ? "" : "s"}` : null,
        current > 0 ? formatAmps(current) : null,
    ].filter(Boolean).join(" · ");
    return (
        <li>
            <Card className={cn(
                "flex-row items-center gap-3 px-3 py-2 transition-colors",
                on ? "bg-primary/[0.06] ring-primary/40" : "hover:bg-muted/50",
            )}>
                <Badge variant={on ? "info" : "secondary"} className="min-w-[3.25rem] tabular-nums">{formatVolts(rail.voltage_v)}</Badge>
                <Label htmlFor={id} className={cn("min-w-0 flex-1 flex-col items-start gap-0", canEdit ? "cursor-pointer" : "cursor-default")}>
                    <span className="block w-full truncate font-mono text-xs font-medium" title={net}>{net}</span>
                    <span className={cn("block w-full truncate text-[11px] font-normal", feeds.length ? "text-muted-foreground" : "text-warning")} title={meta}>{meta}</span>
                </Label>
                <Switch id={id} checked={on} disabled={!canEdit} onCheckedChange={onToggle} aria-label={`Solve ${net}`} />
            </Card>
        </li>
    );
}

function formatVolts(volts: number): string {
    return `${Number(volts.toPrecision(3))} V`;
}

function formatAmps(amps: number): string {
    return amps < 1 ? `${Number((amps * 1000).toPrecision(3))} mA` : `${Number(amps.toPrecision(3))} A`;
}

/** A segmented choice on the Tabs primitive; `value` null shows no segment active. */
function Segmented({ label, value, options, disabled, onChange }: {
    label: string;
    value: string | null;
    options: { value: string; label: string; title?: string }[];
    disabled?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <Tabs value={value ?? ""} onValueChange={onChange}>
            <StudioTabsList aria-label={label} className="flex w-full">
                {options.map((option) => (
                    <StudioTabsTrigger key={option.value} value={option.value} disabled={disabled} title={option.title} className="flex-1">{option.label}</StudioTabsTrigger>
                ))}
            </StudioTabsList>
        </Tabs>
    );
}

function AdvancedGroup({ group, settings, canEdit, onSet }: {
    group: Group;
    settings: Settings;
    canEdit: boolean;
    onSet: (section: string, key: string, value: unknown) => void;
}) {
    const fields = group.fields.filter((field) => !field.when || field.when(settings));
    const changed = fields.filter((field) => settings[field.section]?.[field.key] !== undefined).length;
    const [open, setOpen] = useState(false);
    const Icon = group.icon;
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="h-10 w-full justify-start gap-3 px-3 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-left">{group.title}</span>
                    {changed > 0 && <Badge variant="info">{changed} changed</Badge>}
                    <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 border-t bg-muted/20 px-3 py-2.5">
                {fields.map((field) => (
                    <SettingField
                        key={`${field.section}.${field.key}`}
                        field={field}
                        value={settings[field.section]?.[field.key]}
                        canEdit={canEdit}
                        onChange={(value) => onSet(field.section, field.key, value)}
                    />
                ))}
            </CollapsibleContent>
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
    const modified = value !== undefined;
    let control: ReactNode;
    if (field.kind === "bool") {
        const checked = typeof value === "boolean" ? value : field.fallback;
        control = <Switch id={id} checked={checked} disabled={!canEdit} onCheckedChange={(next) => onChange(next)} />;
    } else if (field.kind === "number") {
        control = (
            <div className="flex items-center gap-1.5">
                <Input
                    id={id}
                    key={String(value)}
                    type="number"
                    className="h-7 w-24 text-right text-xs tabular-nums"
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
                <span className="w-5 text-[11px] text-muted-foreground">{field.unit ?? ""}</span>
            </div>
        );
    } else if (field.kind === "choice") {
        const current = typeof value === "string" ? value : field.fallback;
        const pick = (next: string) => onChange(next === field.fallback ? undefined : next);
        control = field.options.length <= 2 ? (
            <div className="w-full max-w-[16rem]"><Segmented label={field.label} value={current} options={field.options} disabled={!canEdit} onChange={pick} /></div>
        ) : (
            <Select value={current} onValueChange={pick} disabled={!canEdit}>
                <SelectTrigger id={id} size="sm" className="h-7 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
            </Select>
        );
    } else {
        const chosen = new Set(Array.isArray(value) ? (value as string[]) : field.fallback);
        control = (
            <div className="flex flex-wrap justify-end gap-1">
                {field.options.map((option) => {
                    const on = chosen.has(option.value);
                    return (
                        <Button key={option.value} type="button" size="xs" variant={on ? "secondary" : "outline"} aria-pressed={on} disabled={!canEdit}
                            className={cn(on && "text-primary")}
                            onClick={() => {
                                const next = new Set(chosen);
                                if (next.has(option.value)) next.delete(option.value);
                                else next.add(option.value);
                                onChange(field.options.map((item) => item.value).filter((item) => next.has(item)));
                            }}>
                            {option.label}
                        </Button>
                    );
                })}
            </div>
        );
    }
    const stacked = field.kind === "set" || (field.kind === "choice" && field.options.length <= 2);
    return (
        <div className={cn("group/field px-1 py-1.5", stacked ? "space-y-1.5" : "flex items-center gap-2")}>
            <div className={cn("flex min-w-0 items-center gap-1.5", !stacked && "flex-1")}>
                {modified && <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Changed from the default" aria-hidden />}
                <Label htmlFor={id} className="truncate text-[13px] font-normal">{field.label}</Label>
                {field.help && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`About ${field.label}`}>
                                <Info aria-hidden />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[16rem] leading-relaxed">{field.help}</TooltipContent>
                    </Tooltip>
                )}
                {modified && canEdit && (
                    <Button variant="ghost" size="icon-xs" title="Use the engine default" aria-label={`Reset ${field.label}`}
                        className="ml-auto text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/field:opacity-100"
                        onClick={() => onChange(undefined)}>
                        <RotateCcw aria-hidden />
                    </Button>
                )}
            </div>
            <div className={cn(stacked && "flex justify-end")}>{control}</div>
        </div>
    );
}
