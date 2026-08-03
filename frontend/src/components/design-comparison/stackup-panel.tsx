import { cn } from "@/lib/utils";
import type { StackupDiff, StackupLayer, StackupSettings } from "./types";

interface StackupPanelProps {
    stackup: StackupDiff | null;
}

function rowsDiffer(a: StackupLayer | undefined, b: StackupLayer | undefined): boolean {
    if (!a || !b) return true;
    return a.name !== b.name
        || a.type !== b.type
        || (a.thickness ?? null) !== (b.thickness ?? null)
        || (a.material ?? null) !== (b.material ?? null)
        || (a.color ?? null) !== (b.color ?? null)
        || (a.epsilon_r ?? null) !== (b.epsilon_r ?? null)
        || (a.loss_tangent ?? null) !== (b.loss_tangent ?? null);
}

function settingText(value: boolean | string | null | undefined): string {
    if (value === true) return "Enabled";
    if (value === false) return "Disabled";
    return value || "—";
}

function StackupTable({
    title,
    accent,
    layers,
    otherLayers,
    settings,
    otherSettings,
}: {
    title: string;
    accent: "old" | "new";
    layers: StackupLayer[];
    otherLayers: StackupLayer[];
    settings: StackupSettings;
    otherSettings: StackupSettings;
}) {
    const rowCount = Math.max(layers.length, otherLayers.length);
    const settingsChanged = JSON.stringify(settings) !== JSON.stringify(otherSettings);
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
                className={cn(
                    "sticky top-0 z-10 shrink-0 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide",
                    accent === "old"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-success/10 text-success",
                )}
            >
                {title}
            </div>
            <div className={cn(
                "grid shrink-0 grid-cols-2 gap-3 border-b px-4 py-2 text-[10px]",
                settingsChanged && "bg-warning/10",
            )}>
                <span>
                    <span className="text-muted-foreground">Copper finish </span>
                    <span className="font-medium">{settingText(settings.copper_finish)}</span>
                </span>
                <span>
                    <span className="text-muted-foreground">Dielectric constraints </span>
                    <span className="font-medium">
                        {settingText(settings.dielectric_constraints)}
                    </span>
                </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                        <tr>
                            <th className="w-10 border-b bg-muted px-3 py-2 text-left font-medium">#</th>
                            <th className="border-b bg-muted px-3 py-2 text-left font-medium">Layer</th>
                            <th className="border-b bg-muted px-3 py-2 text-left font-medium">Type</th>
                            <th className="whitespace-nowrap border-b bg-muted px-3 py-2 text-right font-medium">
                                Thickness (mm)
                            </th>
                            <th className="border-b bg-muted px-3 py-2 text-left font-medium">Material</th>
                            <th className="border-b bg-muted px-3 py-2 text-right font-medium">Dk</th>
                            <th className="border-b bg-muted px-3 py-2 text-right font-medium">Df</th>
                            <th className="border-b bg-muted px-3 py-2 text-left font-medium">Color</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rowCount }, (_, idx) => {
                            const layer = layers[idx];
                            const other = otherLayers[idx];
                            if (!layer) {
                                return (
                                    <tr key={idx} className="italic text-muted-foreground opacity-50">
                                        <td className="border-b px-3 py-2">{idx + 1}</td>
                                        <td className="border-b px-3 py-2" colSpan={7}>—</td>
                                    </tr>
                                );
                            }
                            const changed = rowsDiffer(layer, other);
                            return (
                                <tr key={idx} className={cn(changed && "bg-warning/10")}>
                                    <td className="border-b px-3 py-2 text-muted-foreground">
                                        {idx + 1}
                                    </td>
                                    <td className="border-b px-3 py-2">
                                        <span className="flex min-w-0 items-center gap-2">
                                            {/* Copper reads as copper at a glance;
                                                the type column still carries the
                                                authoritative value. */}
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "size-2 shrink-0 rounded-sm",
                                                    /copper/i.test(layer.type)
                                                        ? "bg-amber-500"
                                                        : "bg-muted-foreground/30",
                                                )}
                                            />
                                            <span
                                                className="truncate font-medium"
                                                title={layer.name}
                                            >
                                                {layer.name}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="border-b px-3 py-2 text-muted-foreground">
                                        {layer.type}
                                    </td>
                                    <td className="border-b px-3 py-2 text-right font-mono tabular-nums">
                                        {layer.thickness != null ? layer.thickness.toFixed(4) : "—"}
                                    </td>
                                    <td className="border-b px-3 py-2 text-muted-foreground">
                                        {layer.material || "—"}
                                    </td>
                                    <td className="border-b px-3 py-2 text-right font-mono tabular-nums">
                                        {layer.epsilon_r ?? "—"}
                                    </td>
                                    <td className="border-b px-3 py-2 text-right font-mono tabular-nums">
                                        {layer.loss_tangent ?? "—"}
                                    </td>
                                    <td className="border-b px-3 py-2 text-muted-foreground">
                                        {layer.color || "—"}
                                    </td>
                                </tr>
                            );
                        })}
                        {rowCount === 0 && (
                            <tr>
                                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                                    No stackup layers found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function StackupPanel({ stackup }: StackupPanelProps) {
    // No stackup could be read from either revision. This is not "no changes" —
    // it means the board (or its stackup block) was not available to read, which
    // on this setup means the PCB has not been rendered yet. Say so plainly and
    // tell the reviewer what to do, rather than showing an empty or vague panel.
    if (!stackup || !stackup.present) {
        return (
            <section className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-8 text-center">
                <div>
                    <h3 className="text-sm font-medium text-foreground">
                        Stackup not available yet
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                        No board stackup could be read from these revisions. Render
                        the PCB for this project, then run the comparison again to
                        see the stackup.
                    </p>
                </div>
            </section>
        );
    }

    // Present in at least one revision: always show both stackups side by side,
    // whether or not they changed. An unchanged stackup is still worth looking at
    // to confirm it did not move. Only add the "differs" banner when it changed.
    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
                className={cn(
                    "shrink-0 border-b px-4 py-1.5 text-xs",
                    stackup.changed
                        ? "bg-warning/10 text-warning-foreground"
                        : "bg-muted/40 text-muted-foreground",
                )}
            >
                {stackup.changed
                    ? "Stackup differs between revisions — changed rows are highlighted below."
                    : "Stackup is identical in both revisions."}
            </div>
            <div className="flex min-h-0 flex-1 divide-x">
                <StackupTable
                    title="Old stackup"
                    accent="old"
                    layers={stackup.base}
                    otherLayers={stackup.head}
                    settings={stackup.base_settings ?? {}}
                    otherSettings={stackup.head_settings ?? {}}
                />
                <StackupTable
                    title="New stackup"
                    accent="new"
                    layers={stackup.head}
                    otherLayers={stackup.base}
                    settings={stackup.head_settings ?? {}}
                    otherSettings={stackup.base_settings ?? {}}
                />
            </div>
        </section>
    );
}
