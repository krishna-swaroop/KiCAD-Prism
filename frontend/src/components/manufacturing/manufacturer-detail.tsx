import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    AlertTriangle,
    ExternalLink,
    Factory,
    Gauge,
    MoreHorizontal,
    Package,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatRelative } from "@/lib/relative-time";
import { deleteTemplate, getPcbRuleFields, listTemplates } from "@/lib/manufacturing";
import type { Manufacturer, ManufacturingRun, PcbRuleField, SpecTemplate } from "@/types/manufacturing";
import { EmptyState } from "./empty-state";
import { manufacturerScorecard } from "./manufacturer-stats";
import { ProcessCard } from "./process-card";
import { StatTile } from "./stat-tile";
import { RunStatusBadge } from "./status-badge";
import { TemplateEditorDialog, type TemplateEdit } from "./template-editor-dialog";
import { YieldBar } from "./yield-bar";

interface ManufacturerDetailProps {
    manufacturer: Manufacturer;
    runs: ManufacturingRun[];
    canEdit: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onChanged: () => void;
    onOpenRun?: (runId: string) => void;
}

function websiteHref(website: string): string {
    return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

/** One manufacturer: its contact, processes, scorecard, recent production and projects. */
export function ManufacturerDetail({
    manufacturer: m,
    runs,
    canEdit,
    onEdit,
    onDelete,
    onChanged,
    onOpenRun,
}: ManufacturerDetailProps) {
    const [templates, setTemplates] = useState<SpecTemplate[]>([]);
    const [loadedTemplates, setLoadedTemplates] = useState(false);
    const [ruleFields, setRuleFields] = useState<PcbRuleField[]>([]);
    const [editing, setEditing] = useState<TemplateEdit>(null);
    const [deleteTarget, setDeleteTarget] = useState<SpecTemplate | null>(null);

    const loadTemplates = useCallback(async () => {
        try {
            setTemplates(await listTemplates(m.id));
            setLoadedTemplates(true);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load processes.");
        }
    }, [m.id]);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    useEffect(() => {
        let cancelled = false;
        void getPcbRuleFields()
            .then(({ fields }) => !cancelled && setRuleFields(fields))
            .catch(() => !cancelled && setRuleFields([]));
        return () => {
            cancelled = true;
        };
    }, []);

    const score = useMemo(() => manufacturerScorecard(runs), [runs]);
    const recent = useMemo(
        () => [...runs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
        [runs],
    );
    const projects = m.projects ?? [];

    return (
        <div className="themed-scrollbar min-h-0 min-w-0 flex-1 overflow-auto">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b p-6">
                <div className="min-w-0 space-y-1">
                    <h2 className="truncate text-lg font-semibold">{m.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {m.website && (
                            <a
                                href={websiteHref(m.website)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                                {m.website}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                        {m.contact && <span>{m.contact}</span>}
                    </div>
                    {m.notes && <p className="max-w-prose whitespace-pre-wrap pt-1 text-sm">{m.notes}</p>}
                </div>
                {canEdit && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onEdit}>
                            <Pencil />
                            Edit
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon-sm" aria-label={`Actions for ${m.name}`}>
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={onDelete}
                                >
                                    <Trash2 />
                                    Delete manufacturer
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </header>

            <div className="space-y-6 p-6">
                <section aria-label="Processes" className="space-y-2">
                    <SectionHeading
                        title="Processes"
                        actions={
                            canEdit ? (
                                <Button variant="outline" size="sm" onClick={() => setEditing({ mode: "create" })}>
                                    <Plus />
                                    New process
                                </Button>
                            ) : undefined
                        }
                    />
                    {loadedTemplates && templates.length === 0 ? (
                        <EmptyState>
                            No processes yet.
                            {canEdit ? " A process defines the spec fields and capabilities of one fabrication tier." : ""}
                        </EmptyState>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {templates.map((t) => (
                                <ProcessCard
                                    key={t.id}
                                    template={t}
                                    ruleFields={ruleFields}
                                    canEdit={canEdit}
                                    onEdit={() => setEditing({ mode: "edit", template: t })}
                                    onDelete={() => setDeleteTarget(t)}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <section aria-label="Scorecard" className="space-y-2">
                    <SectionHeading title="Scorecard" />
                    {score.productions === 0 ? (
                        <EmptyState>No productions with {m.name} yet.</EmptyState>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <StatTile icon={Factory} label="Productions" value={score.productions} />
                            <StatTile icon={Package} label="Units ordered" value={score.units} />
                            <StatTile
                                icon={Gauge}
                                label="Yield"
                                value={score.yieldPct === null ? "—" : `${score.yieldPct}%`}
                                hint="Received and closed productions"
                            />
                            <StatTile
                                icon={AlertTriangle}
                                label="Defects"
                                value={score.defects.total}
                                hint={
                                    score.defects.total === 0
                                        ? "None logged"
                                        : (["critical", "major", "minor", "aesthetic"] as const)
                                              .filter((s) => score.defects[s] > 0)
                                              .map((s) => `${score.defects[s]} ${s}`)
                                              .join(", ")
                                }
                            />
                        </div>
                    )}
                </section>

                <section aria-label="Recent production" className="space-y-2">
                    <SectionHeading
                        title="Recent production"
                        actions={
                            runs.length > recent.length ? (
                                <Link
                                    to={`/?section=manufacturing&status=all&q=${encodeURIComponent(m.name)}`}
                                    className="text-xs text-primary hover:underline"
                                >
                                    View all {runs.length}
                                </Link>
                            ) : undefined
                        }
                    />
                    {recent.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing yet.</p>
                    ) : (
                        <ul className="divide-y border">
                            {recent.map((run) => (
                                <li key={run.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenRun?.(run.id)}
                                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_8rem_5rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                    >
                                        <span className="min-w-0 truncate">
                                            <span className="font-mono text-xs text-muted-foreground">{run.job_number}</span>{" "}
                                            {run.project_name || run.project_id}
                                        </span>
                                        <RunStatusBadge status={run.status} />
                                        <YieldBar good={run.quantity_good} ordered={run.quantity_ordered} />
                                        <span className="text-right text-xs text-muted-foreground">
                                            {formatRelative(run.updated_at)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section aria-label="Projects" className="space-y-2">
                    <SectionHeading title="Projects" />
                    {projects.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No project has this manufacturer attached.</p>
                    ) : (
                        <ul className="flex flex-wrap gap-2">
                            {projects.map((p) => (
                                <li key={p.id}>
                                    <Badge asChild variant="outline" className="h-7 px-2.5 text-sm font-normal">
                                        <Link to={`/project/${p.id}?section=manufacturing`}>{p.name}</Link>
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {editing && (
                <TemplateEditorDialog
                    manufacturer={m}
                    edit={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void loadTemplates();
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete process?"
                description={
                    <>
                        {deleteTarget?.name} will be removed. Projects using it keep their form fields but lose its
                        capabilities.
                    </>
                }
                confirmLabel="Delete"
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    try {
                        await deleteTemplate(deleteTarget.id);
                        setDeleteTarget(null);
                        void loadTemplates();
                        onChanged();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to delete.");
                    }
                }}
            />
        </div>
    );
}
