import { FileDown, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import type { Manufacturer, ProjectManufacturer, SpecTemplate } from "@/types/manufacturing";
import type { SpecForm } from "./use-project-manufacturing";

/** Up to this many manufacturers sit side by side as tabs; more become a dropdown. */
const MAX_TABS = 5;

/** The process side of the bar: only there once a manufacturer is chosen. */
interface ProcessControls {
    manufacturerName: string;
    templates: SpecTemplate[];
    templateId: string | null;
    busy: SpecForm["busy"];
    onPickProcess: (id: string) => void;
    onDownload: () => void;
    onExtract: () => void;
}

interface SpecToolbarProps {
    manufacturers: ProjectManufacturer[];
    manufacturerId: string;
    /** Manufacturers in the directory that this project does not have yet. */
    attachable: Manufacturer[];
    canEdit: boolean;
    hasSpec: boolean;
    onSelect: (id: string) => void;
    onAttach: (id: string) => void;
    onEditProcess: () => void;
    onRemove: (manufacturer: ProjectManufacturer) => void;
    process: ProcessControls | null;
}

/**
 * One row for the Specs tab: which manufacturer's spec is shown (with adding and
 * removing one) at the left, and that spec's process and actions at the right.
 */
export function SpecToolbar({
    manufacturers,
    manufacturerId,
    attachable,
    canEdit,
    hasSpec,
    onSelect,
    onAttach,
    onEditProcess,
    onRemove,
    process,
}: SpecToolbarProps) {
    const selected = manufacturers.find((m) => m.id === manufacturerId) ?? null;
    return (
        <div className="flex flex-wrap items-center gap-2 border bg-card px-3 py-2">
            {manufacturers.length > MAX_TABS ? (
                <Select value={manufacturerId} onValueChange={onSelect}>
                    <SelectTrigger size="sm" aria-label="Manufacturers" className="w-auto min-w-44">
                        <SelectValue placeholder="Choose a manufacturer" />
                    </SelectTrigger>
                    <SelectContent>
                        {manufacturers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                manufacturers.length > 0 && (
                    <Tabs value={manufacturerId} activationMode="manual" className="min-w-0 max-w-full">
                        <StudioTabsList aria-label="Manufacturers">
                            {manufacturers.map((m) => (
                                <StudioTabsTrigger key={m.id} value={m.id} onClick={() => onSelect(m.id)}>
                                    {m.name}
                                </StudioTabsTrigger>
                            ))}
                        </StudioTabsList>
                    </Tabs>
                )
            )}
            {canEdit && attachable.length > 0 && (
                <Select
                    value=""
                    onValueChange={(id) => {
                        if (id) onAttach(id);
                    }}
                >
                    <SelectTrigger size="sm" aria-label="Add a manufacturer" className="w-auto">
                        <Plus className="h-3.5 w-3.5" />
                        <SelectValue placeholder="Add manufacturer" />
                    </SelectTrigger>
                    <SelectContent>
                        {attachable.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            {selected && canEdit && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon-sm" aria-label={`Actions for ${selected.name}`}>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {hasSpec && (
                            <DropdownMenuItem onSelect={onEditProcess}>
                                <Pencil />
                                Edit process
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onRemove(selected)}
                        >
                            <Trash2 />
                            Remove from project
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {process && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {process.templates.length > 0 ? (
                        <>
                            <span className="text-xs text-muted-foreground">Process</span>
                            <Select
                                value={process.templateId ?? ""}
                                onValueChange={(id) => {
                                    if (hasSpec && id && id !== process.templateId) process.onPickProcess(id);
                                }}
                                disabled={!canEdit || !hasSpec || process.busy === "applying"}
                            >
                                <SelectTrigger size="sm" aria-label="Process" className="w-auto min-w-40">
                                    <SelectValue placeholder="Custom (no process)" />
                                </SelectTrigger>
                                <SelectContent>
                                    {process.templates.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            No processes defined for {process.manufacturerName}.
                        </span>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={process.onDownload}
                        disabled={process.busy === "downloading"}
                    >
                        <FileDown />
                        PDF spec sheet
                    </Button>
                    {canEdit && hasSpec && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={process.onExtract}
                            disabled={process.busy === "extracting"}
                        >
                            <Sparkles />
                            {process.busy === "extracting" ? "Reading..." : "Fill from board"}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
