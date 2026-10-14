import { useId, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { SimSetup } from "../types";

import { type BoardIndex, isGround, netLeaf, railVoltage } from "./board-index";
import { NEED_LABELS, type ElementPatch, type TreeElement } from "./power-tree-model";

type Props = {
    element: TreeElement;
    setup: SimSetup;
    board: BoardIndex | null;
    canEdit: boolean;
    onPatch: (patch: ElementPatch) => void;
    onSolved: (solved: boolean) => void;
    onRemove: () => void;
    onClose: () => void;
};

const TITLES = { source: "Source", rail: "Rail", converter: "Converter", load: "Load" } as const;

/** The selected element's part, net, rails and values. Floats over the canvas. */
export function ElementInspector({ element, setup, board, canEdit, onPatch, onSolved, onRemove, onClose }: Props) {
    const rails = setup.rails.map((rail) => ({ id: rail.id, label: `${netLeaf(rail.net.slice(rail.net.indexOf(":") + 1))} · ${rail.voltage_v} V` }));
    const railNet = (id?: string) => {
        const rail = setup.rails.find((item) => item.id === id);
        return rail ? rail.net.slice(rail.net.indexOf(":") + 1) : undefined;
    };
    // Parts on the element's rail come first in the picker.
    const near = element.kind === "converter" ? railNet(element.input_rail) ?? railNet(element.output_rail) : railNet(element.rail);
    const parts = board ? [...new Set([...(near ? board.partsOn(near) : []), ...board.parts.keys()])] : [];

    return (
        <div className="pointer-events-auto w-80 rounded-lg border bg-card/95 text-card-foreground shadow-md backdrop-blur" aria-label={`${TITLES[element.kind]} inspector`}>
            <header className="flex items-center gap-2 border-b px-3 py-2">
                <span className="text-sm font-semibold">{TITLES[element.kind]}</span>
                {element.pending && <Badge variant="warning" className="h-5 px-1.5 text-[10px]">Incomplete</Badge>}
                <span className="ml-auto" />
                {canEdit && (
                    <Button size="icon" variant="ghost" className="size-7" title="Remove (Delete)" aria-label="Remove element" onClick={onRemove}>
                        <Trash2 className="size-4" aria-hidden />
                    </Button>
                )}
                <Button size="icon" variant="ghost" className="size-7" title="Close (Esc)" aria-label="Close inspector" onClick={onClose}>
                    <X className="size-4" aria-hidden />
                </Button>
            </header>
            <div className="space-y-3 p-3">
                {element.needs.length > 0 && (
                    <ul className="space-y-0.5 border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                        {element.needs.map((need) => <li key={need}>{NEED_LABELS[need]}</li>)}
                    </ul>
                )}
                {element.kind === "rail" ? (
                    <>
                        <TextField label="Net" value={element.net} options={board?.nets.filter((net) => !isGround(net)) ?? []} disabled={!canEdit}
                            hint={(net) => (railVoltage(net) ? `${railVoltage(net)} V` : "")} onCommit={(net) => onPatch({ net })} />
                        <NumberField label="Voltage" unit="V" value={element.values.voltage_v} min={0} disabled={!canEdit}
                            onCommit={(voltage_v) => onPatch({ values: { voltage_v } })} />
                        <NumberField label="Tolerance" unit="%" value={element.values.tolerance_pct} min={0} disabled={!canEdit} optional
                            onCommit={(tolerance_pct) => onPatch({ values: { tolerance_pct } })} />
                        {!element.pending && (
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={element.solved ?? false} disabled={!canEdit} onChange={(event) => onSolved(event.target.checked)} />
                                Solve this rail
                            </label>
                        )}
                        {element.inferred && <p className="text-xs text-muted-foreground">Voltage read from the net name; set it if that is wrong.</p>}
                    </>
                ) : (
                    <>
                        <TextField label="Part" value={element.component} options={parts} disabled={!canEdit}
                            hint={(ref) => board?.parts.get(ref)?.value ?? ""} onCommit={(component) => onPatch({ component })} />
                        {element.kind === "converter" ? (
                            <>
                                <RailField label="Input rail" value={element.input_rail} rails={rails} disabled={!canEdit} onCommit={(input_rail) => onPatch({ input_rail })} />
                                <RailField label="Output rail" value={element.output_rail} rails={rails} disabled={!canEdit} onCommit={(output_rail) => onPatch({ output_rail })} />
                                <Row label="Type">
                                    <select className="h-7 w-full rounded-md border bg-background px-2 text-xs" disabled={!canEdit}
                                        value={element.values.converter_kind ?? "switching"}
                                        onChange={(event) => onPatch({ values: { converter_kind: event.target.value as "switching" | "linear" } })}>
                                        <option value="switching">Switching (efficiency)</option>
                                        <option value="linear">Linear (passes its current)</option>
                                    </select>
                                </Row>
                                {element.values.converter_kind === "linear" ? (
                                    <NumberField label="Quiescent" unit="mA" scale={1000} value={element.values.quiescent_current_a} min={0} optional disabled={!canEdit}
                                        onCommit={(quiescent_current_a) => onPatch({ values: { quiescent_current_a } })} />
                                ) : (
                                    <NumberField label="Efficiency" unit="%" scale={100} value={element.values.efficiency} min={1} max={100} optional disabled={!canEdit}
                                        onCommit={(efficiency) => onPatch({ values: { efficiency } })} />
                                )}
                            </>
                        ) : (
                            <RailField label="Rail" value={element.rail} rails={rails} disabled={!canEdit} onCommit={(rail) => onPatch({ rail })} />
                        )}
                        {element.kind === "load" && (
                            <NumberField label="Current" unit="A" value={element.values.current_a} min={0} disabled={!canEdit}
                                onCommit={(current_a) => onPatch({ values: { current_a: current_a ?? 0 } })} />
                        )}
                        {element.pins.length > 0 && (
                            <p className="text-xs text-muted-foreground" title={element.pins.join(", ")}>
                                {element.pins.length} pad{element.pins.length === 1 ? "" : "s"}: {element.pins.slice(0, 6).map((pin) => pin.slice(pin.indexOf(":") + 1)).join(", ")}
                                {element.pins.length > 6 ? ", …" : ""}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
            <label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</label>
            {children}
        </div>
    );
}

function TextField({ label, value, options, disabled, hint, onCommit }: {
    label: string;
    value?: string;
    options: string[];
    disabled: boolean;
    hint: (option: string) => string;
    onCommit: (value: string) => void;
}) {
    const id = useId();
    return (
        <Row label={label} htmlFor={id}>
            <Input id={id} key={value} list={`${id}-list`} className="h-7 font-mono text-xs" defaultValue={value ?? ""} disabled={disabled}
                placeholder={`Pick a ${label.toLowerCase()}`}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== value) onCommit(next);
                }} />
            <datalist id={`${id}-list`}>
                {options.slice(0, 400).map((option) => <option key={option} value={option}>{hint(option)}</option>)}
            </datalist>
        </Row>
    );
}

function RailField({ label, value, rails, disabled, onCommit }: {
    label: string;
    value?: string;
    rails: { id: string; label: string }[];
    disabled: boolean;
    onCommit: (value: string) => void;
}) {
    const id = useId();
    return (
        <Row label={label} htmlFor={id}>
            <select id={id} className="h-7 w-full rounded-md border bg-background px-2 text-xs" disabled={disabled}
                value={value ?? ""} onChange={(event) => event.target.value && onCommit(event.target.value)}>
                <option value="">Not connected</option>
                {rails.map((rail) => <option key={rail.id} value={rail.id}>{rail.label}</option>)}
            </select>
        </Row>
    );
}

function NumberField({ label, unit, value, scale = 1, min, max, optional, disabled, onCommit }: {
    label: string;
    unit: string;
    value?: number;
    scale?: number;
    min?: number;
    max?: number;
    optional?: boolean;
    disabled: boolean;
    onCommit: (value: number | undefined) => void;
}) {
    const id = useId();
    const shown = value === undefined ? "" : +(value * scale).toPrecision(6);
    return (
        <Row label={label} htmlFor={id}>
            <div className="flex items-center gap-1">
                <Input id={id} key={String(value)} type="number" step="any" min={min} max={max} className="h-7 text-right text-xs tabular-nums"
                    defaultValue={shown} disabled={disabled} placeholder={optional ? "not set" : ""}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    onBlur={(event) => {
                        const text = event.target.value.trim();
                        if (text === "") {
                            if (optional && value !== undefined) onCommit(undefined);
                            return;
                        }
                        const parsed = Number(text);
                        if (!Number.isFinite(parsed)) return;
                        const next = parsed / scale;
                        if (next !== value) onCommit(next);
                    }} />
                <span className="w-7 text-xs text-muted-foreground">{unit}</span>
            </div>
        </Row>
    );
}
