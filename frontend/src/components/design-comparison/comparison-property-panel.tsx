import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PcbLayerSwatch } from "@/components/ecad-viewer-controls";
import { cn } from "@/lib/utils";
import type { EcadPcbLayerState } from "@/types/ecad-viewer";
import { CHANGE_KIND_LABEL, ChangeStatusDot } from "./change-status";
import type { ChangeGroup } from "./comparison-review-groups";
import {
    REVIEW_IMPACT_LABEL,
    reviewImpactForGroup,
} from "./comparison-review-queue";
import {
    changeEvidenceMode,
    componentFieldNames,
    formatValue,
    isTruthyFlag,
    propertyDeltas,
    routeMetricRows,
    terminalSummary,
    type PropertyDelta,
} from "./comparison-property-model";
import { humanize } from "./comparison-change-vocabulary";
import type { BomChangeRow, BomDiff, PcbDiff } from "./types";

/**
 * The one place a reviewer reads what changed about the selected item.
 *
 * Replaces the split between a squeezed three-column table in the queue and a
 * rail that showed one revision's fields at a time. A changed field is stated
 * once, in place, as `old → new`: the old value is marked because it is the one
 * that left, and the new value is rendered plainly because it is now the truth.
 * Marking both would make every changed row a red/green stripe and collide with
 * the red/green confusion `ChangeStatusDot` already works around.
 */

export type ComparisonPropertyPanelProps = {
    group: ChangeGroup | null;
    bom: BomDiff | null;
    routeMetrics?: PcbDiff["route_metrics"];
    /** Board layers, for colouring the swatches beside a net's layer list. */
    pcbLayers?: readonly EcadPcbLayerState[];
    /** Unresolved native items reported by the viewer for this document. */
    diagnosticsCount?: number;
    /** Rendered as the panel's last section. */
    discussion?: ReactNode;
};

function Section({
    title,
    children,
    defaultOpen = true,
}: {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="border-b last:border-b-0">
            <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
            >
                {open
                    ? <ChevronDown className="size-3 shrink-0" />
                    : <ChevronRight className="size-3 shrink-0" />}
                {title}
            </button>
            {open && <div className="px-3 pb-3">{children}</div>}
        </section>
    );
}

/**
 * One value, or one transition. `undefined` on either side means the field did
 * not exist in that revision, which is itself worth showing.
 */
function ValuePair({
    oldValue,
    newValue,
    changed,
}: {
    oldValue?: unknown;
    newValue?: unknown;
    changed: boolean;
}) {
    if (!changed) {
        return (
            <span className="block break-words [overflow-wrap:anywhere]">
                {formatValue(newValue)}
            </span>
        );
    }
    return (
        <span className="block break-words [overflow-wrap:anywhere]">
            <span className="text-destructive">{formatValue(oldValue)}</span>
            <span className="px-1 text-muted-foreground" aria-label="changed to">
                →
            </span>
            <span>{formatValue(newValue)}</span>
        </span>
    );
}

function PropertyRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        // Both columns are minmax(0, …) so neither can be widened by its own
        // content: a long datasheet URL wraps inside the panel the reviewer
        // sized rather than pushing the panel over the canvas.
        <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-1 text-xs">
            <dt className="min-w-0 break-words text-muted-foreground">{label}</dt>
            <dd className="min-w-0 overflow-hidden">{children}</dd>
        </div>
    );
}

/** A delta headed by the verb that explains it, Altium's reading. */
function DeltaBlock({ delta }: { delta: PropertyDelta }) {
    return (
        <div className="py-1 text-xs">
            <p className="font-medium">
                {delta.verb}
                <span className="font-normal text-muted-foreground">
                    {`: ${delta.label}`}
                </span>
            </p>
            <p className="mt-0.5">
                <ValuePair
                    oldValue={delta.oldValue}
                    newValue={delta.newValue}
                    changed
                />
            </p>
        </div>
    );
}

function bomRowFor(
    bom: BomDiff | null,
    references: readonly string[],
): BomChangeRow | undefined {
    for (const reference of references) {
        const row = bom?.changes.find((candidate) => candidate.ref === reference);
        if (row) return row;
    }
    return undefined;
}

/** Splits a part transition label so the departing part can be marked. */
function titleParts(label: string): { before: string | null; after: string } {
    const separator = label.indexOf(" → ");
    if (separator < 0) return { before: null, after: label };
    return {
        before: label.slice(0, separator),
        after: label.slice(separator + 3),
    };
}

export function ComparisonPropertyPanel({
    group,
    bom,
    routeMetrics,
    pcbLayers,
    diagnosticsCount = 0,
    discussion,
}: ComparisonPropertyPanelProps) {
    if (!group) {
        return (
            <div className="flex h-full flex-col">
                <p className="p-4 text-xs text-muted-foreground">
                    Select a change to see what moved.
                </p>
                {discussion}
            </div>
        );
    }

    const { before, after } = titleParts(group.label);
    const impact = reviewImpactForGroup(group);
    const row = bomRowFor(bom, group.references);
    const deltas = [
        ...routeMetricRows(group.changes, routeMetrics),
        ...propertyDeltas(group.changes),
    ];
    const evidence = changeEvidenceMode(group.changes);
    const terminals = terminalSummary(group.changes);
    const primary = group.changes[0];
    // The PCB parser reports an unassigned net as the numeric code 0, which is
    // not a net name and must not reach the panel — and `{0 && …}` would render
    // a bare "0" rather than nothing.
    const primaryNet = typeof primary?.net === "string" && primary.net.trim()
        ? primary.net.trim()
        : null;
    const layerColors = new Map(
        (pcbLayers ?? []).map((layer) => [layer.name, layer.color]),
    );
    const netLayers = [...new Set(
        group.changes.flatMap((change) => change.layers ?? []).filter(Boolean),
    )];

    // Field names the property sheet already states, so the change list below
    // does not repeat them under a verb heading.
    const fieldNames = row ? componentFieldNames(row.old, row.new) : [];
    const covered = new Set(fieldNames.map((name) => name.toLocaleLowerCase()));
    const uncoveredDeltas = deltas.filter(
        (delta) => !covered.has(delta.label.toLocaleLowerCase()),
    );

    const dnp = isTruthyFlag(row?.new?.["kicad_dnp"]);
    const notInBom = row?.new?.["kicad_in_bom"] !== undefined
        && !isTruthyFlag(row.new["kicad_in_bom"]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="shrink-0 border-b px-3 py-2.5">
                <div className="flex items-start gap-2">
                    <ChangeStatusDot kind={group.kind} className="mt-1.5" />
                    <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                        {before && (
                            <>
                                <span className="text-destructive">{before}</span>
                                <span className="px-1 font-normal text-muted-foreground">
                                    →
                                </span>
                            </>
                        )}
                        {after}
                    </h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4 text-[10px] text-muted-foreground">
                    <span>{CHANGE_KIND_LABEL[group.kind]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{REVIEW_IMPACT_LABEL[impact]}</span>
                    {group.references.length > 0 && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                                {group.references.join(", ")}
                            </span>
                        </>
                    )}
                </div>
                {(dnp || notInBom) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
                        {dnp && (
                            <Badge variant="destructive" className="text-[10px]">
                                DNP
                            </Badge>
                        )}
                        {notInBom && (
                            <Badge variant="outline" className="text-[10px]">
                                Not in BOM
                            </Badge>
                        )}
                    </div>
                )}
                {/* A change that named a native object but resolved to nothing
                    on the canvas is a visualization failure, not a quiet
                    footnote. It stays in the header where it cannot be
                    collapsed out of sight. */}
                {evidence === "unresolved" && (
                    <p className="mt-2 flex items-start gap-1.5 pl-4 text-[10px] text-warning">
                        <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden="true" />
                        No canvas target resolved — review the values below.
                    </p>
                )}
            </header>

            <ScrollArea className="min-h-0 flex-1">
                {row && fieldNames.length > 0 && (
                    <Section title="Properties">
                        <dl>
                            {fieldNames.map((name) => {
                                const diff = row.diffs?.[name];
                                return (
                                    <PropertyRow key={name} label={name}>
                                        <ValuePair
                                            oldValue={diff ? diff.old : row.old?.[name]}
                                            newValue={diff ? diff.new : row.new?.[name]}
                                            changed={Boolean(diff)}
                                        />
                                    </PropertyRow>
                                );
                            })}
                        </dl>
                    </Section>
                )}

                {uncoveredDeltas.length > 0 && (
                    <Section title="Changes">
                        {uncoveredDeltas.map((delta) => (
                            <DeltaBlock key={delta.id} delta={delta} />
                        ))}
                    </Section>
                )}

                {terminals && (
                    <Section title="Connectivity">
                        {terminals.removed.length > 0 && (
                            <p className="py-0.5 text-xs text-destructive">
                                {`Removed: ${terminals.removed.join(", ")}`}
                            </p>
                        )}
                        {terminals.added.length > 0 && (
                            <p className="py-0.5 text-xs">
                                {`Added: ${terminals.added.join(", ")}`}
                            </p>
                        )}
                    </Section>
                )}

                {netLayers.length > 0 && (
                    <Section title="Layers used">
                        <ul className="space-y-1">
                            {netLayers.map((layer) => (
                                <li key={layer} className="flex items-center gap-2 text-xs">
                                    <PcbLayerSwatch
                                        color={layerColors.get(layer) ?? "transparent"}
                                    />
                                    <span className="truncate">{layer}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                )}

                <Section title="Context" defaultOpen={false}>
                    <dl>
                        {primaryNet && (
                            <PropertyRow label="Net">{primaryNet}</PropertyRow>
                        )}
                        {primary?.page && (
                            <PropertyRow label="Document">{primary.page}</PropertyRow>
                        )}
                        <PropertyRow label="Category">
                            {humanize(String(group.category))}
                        </PropertyRow>
                        {group.classification === "secondary" && (
                            <PropertyRow label="Scope">
                                Layout / documentation
                            </PropertyRow>
                        )}
                    </dl>
                    {evidence === "structured" && (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                            Structured evidence only; this change has no standalone
                            KiCad object.
                        </p>
                    )}
                    {diagnosticsCount > 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            {`${diagnosticsCount} unresolved native ${
                                diagnosticsCount === 1 ? "item" : "items"
                            } in this document.`}
                        </p>
                    )}
                </Section>

                {discussion && (
                    <Section title="Comments">
                        <div className={cn("-mx-3 -mb-3")}>{discussion}</div>
                    </Section>
                )}
            </ScrollArea>
        </div>
    );
}
