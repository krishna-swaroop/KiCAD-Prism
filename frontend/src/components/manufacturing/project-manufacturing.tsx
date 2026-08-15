import { useCallback, useEffect, useState } from "react";
import { Factory, Sparkles, Save, PlusCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    getBoardSpec,
    saveBoardSpec,
    extractBoardSpec,
    listRuns,
} from "@/lib/manufacturing";
import {
    RUN_STATUS_LABELS,
    SPEC_GROUPS,
    type ManufacturingRun,
    type SpecField,
} from "@/types/manufacturing";

interface ProjectManufacturingProps {
    projectId: string;
    canEdit: boolean;
    onOpenRun?: (runId: string) => void;
    onNewRun?: () => void;
}

type SpecValues = Record<string, unknown>;

export function ProjectManufacturing({
    projectId,
    canEdit,
    onOpenRun,
    onNewRun,
}: ProjectManufacturingProps) {
    const [values, setValues] = useState<SpecValues>({});
    const [source, setSource] = useState<Record<string, string>>({});
    const [runs, setRuns] = useState<ManufacturingRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [dirty, setDirty] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [spec, runList] = await Promise.all([
                getBoardSpec(projectId),
                listRuns(projectId),
            ]);
            setValues(spec.specs ?? {});
            setSource(spec.source ?? {});
            setRuns(runList);
            setDirty(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load manufacturing data.");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void load();
    }, [load]);

    const setField = (key: string, value: unknown, provenance: string = "manual") => {
        setValues((current) => ({ ...current, [key]: value }));
        setSource((current) => ({ ...current, [key]: provenance }));
        setDirty(true);
    };

    const handleExtract = async () => {
        setExtracting(true);
        try {
            const { suggested, reason } = await extractBoardSpec(projectId);
            const keys = Object.keys(suggested);
            if (keys.length === 0) {
                toast.info(reason ?? "Nothing could be read from the board.");
                return;
            }
            setValues((current) => ({ ...current, ...suggested }));
            setSource((current) => {
                const next = { ...current };
                for (const key of keys) next[key] = "extracted";
                return next;
            });
            setDirty(true);
            toast.success(`Filled ${keys.length} field(s) from the board. Review and save.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to read the board.");
        } finally {
            setExtracting(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const saved = await saveBoardSpec(projectId, values, source);
            setValues(saved.specs ?? {});
            setSource(saved.source ?? {});
            setDirty(false);
            toast.success("Board specs saved.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-sm text-muted-foreground">Loading manufacturing...</div>;
    }

    return (
        <div className="space-y-8">
            {/* Board specs */}
            <section className="rounded-lg border">
                <header className="flex items-center justify-between gap-4 border-b p-4">
                    <div>
                        <h3 className="text-lg font-medium">Board specifications</h3>
                        <p className="text-sm text-muted-foreground">
                            The physical spec sent to the fab. Extract what the board file knows, fill the rest.
                        </p>
                    </div>
                    {canEdit && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => void handleExtract()} disabled={extracting}>
                                <Sparkles className="mr-2 h-4 w-4" />
                                {extracting ? "Reading..." : "Extract from board"}
                            </Button>
                            <Button size="sm" onClick={() => void handleSave()} disabled={saving || !dirty}>
                                <Save className="mr-2 h-4 w-4" />
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    )}
                </header>

                <div className="space-y-6 p-4">
                    {SPEC_GROUPS.map((group) => (
                        <div key={group.title}>
                            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.title}
                            </h4>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {group.fields.map((field) => (
                                    <SpecFieldInput
                                        key={field.key}
                                        field={field}
                                        value={values[field.key]}
                                        provenance={source[field.key]}
                                        disabled={!canEdit}
                                        onChange={(v) => setField(field.key, v)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Runs for this project */}
            <section className="rounded-lg border">
                <header className="flex items-center justify-between gap-4 border-b p-4">
                    <div>
                        <h3 className="text-lg font-medium">Production runs</h3>
                        <p className="text-sm text-muted-foreground">
                            {runs.length === 0 ? "No runs yet for this board." : `${runs.length} run(s).`}
                        </p>
                    </div>
                    {canEdit && onNewRun && (
                        <Button size="sm" onClick={onNewRun}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            New run
                        </Button>
                    )}
                </header>

                {runs.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                        <Factory className="h-8 w-8 opacity-50" />
                        <p className="text-sm">Track a fabrication run to record quantity, manufacturer, and defects.</p>
                    </div>
                ) : (
                    <ul className="divide-y">
                        {runs.map((run) => (
                            <li key={run.id}>
                                <button
                                    type="button"
                                    onClick={() => onOpenRun?.(run.id)}
                                    className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-4 text-left hover:bg-muted/40"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                {run.manufacturer_name || "No manufacturer"}
                                            </span>
                                            <Badge variant="secondary">{RUN_STATUS_LABELS[run.status]}</Badge>
                                        </div>
                                        <div className="mt-0.5 text-sm text-muted-foreground">
                                            {run.quantity_good}/{run.quantity_ordered} good
                                            {run.defect_count ? ` · ${run.defect_count} defect(s)` : ""}
                                            {run.commit_sha ? ` · ${run.commit_sha.slice(0, 7)}` : ""}
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(run.created_at).toLocaleDateString()}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

interface SpecFieldInputProps {
    field: SpecField;
    value: unknown;
    provenance?: string;
    disabled: boolean;
    onChange: (value: unknown) => void;
}

function SpecFieldInput({ field, value, provenance, disabled, onChange }: SpecFieldInputProps) {
    const inputId = `spec-${field.key}`;
    const labelRow = (
        <div className="flex items-center gap-2">
            <Label htmlFor={inputId} className="text-sm">
                {field.label}
                {field.unit ? <span className="text-muted-foreground"> ({field.unit})</span> : null}
            </Label>
            {provenance === "extracted" && (
                <Badge variant="outline" className="text-[10px]">
                    from board
                </Badge>
            )}
        </div>
    );

    if (field.kind === "boolean") {
        return (
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2">
                {labelRow}
                <input
                    id={inputId}
                    type="checkbox"
                    checked={value === true}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.checked)}
                />
            </label>
        );
    }

    if (field.kind === "select") {
        return (
            <div className="space-y-1.5">
                {labelRow}
                <select
                    id={inputId}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60"
                    value={typeof value === "string" ? value : ""}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value || undefined)}
                >
                    <option value="">—</option>
                    {field.options?.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {labelRow}
            <Input
                id={inputId}
                type={field.kind === "number" ? "number" : "text"}
                value={value === undefined || value === null ? "" : String(value)}
                disabled={disabled}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (field.kind === "number") {
                        onChange(raw === "" ? undefined : Number(raw));
                    } else {
                        onChange(raw || undefined);
                    }
                }}
            />
        </div>
    );
}
