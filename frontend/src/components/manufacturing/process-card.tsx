import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PcbRuleField, SpecTemplate } from "@/types/manufacturing";
import { keyMinimums, plural } from "./manufacturer-stats";

interface ProcessCardProps {
    template: SpecTemplate;
    ruleFields: PcbRuleField[];
    canEdit: boolean;
    onEdit: () => void;
    onDelete: () => void;
}

// One fabrication tier: its name, its first few minimums, and how many projects use it.
export function ProcessCard({ template: t, ruleFields, canEdit, onEdit, onDelete }: ProcessCardProps) {
    const minimums = keyMinimums(t, ruleFields);
    const used = t.project_count ?? 0;
    return (
        <article className="flex flex-col gap-2 border p-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="min-w-0 truncate text-sm font-medium">{t.name}</h4>
                {canEdit && (
                    <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon-xs" aria-label={`Edit ${t.name}`} onClick={onEdit}>
                            <Pencil />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive"
                            aria-label={`Delete ${t.name}`}
                            onClick={onDelete}
                        >
                            <Trash2 />
                        </Button>
                    </div>
                )}
            </div>
            {minimums.length > 0 ? (
                <dl className="flex-1 space-y-1 text-sm">
                    {minimums.map((row) => (
                        <div key={row.key} className="flex items-baseline justify-between gap-3">
                            <dt className="min-w-0 truncate text-muted-foreground">{row.label}</dt>
                            <dd className="shrink-0 tabular-nums">{row.unit ? `${row.value} ${row.unit}` : row.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="flex-1 text-sm text-muted-foreground">No capabilities set.</p>
            )}
            <p className="border-t pt-2 text-xs text-muted-foreground">
                {used === 0 ? "Not used by any project" : `Used by ${plural(used, "project")}`}
            </p>
        </article>
    );
}
