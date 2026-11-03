import { useMemo, useState } from "react";
import { Building2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteManufacturer } from "@/lib/manufacturing";
import type { Manufacturer, ManufacturingRun } from "@/types/manufacturing";
import { EmptyState } from "./empty-state";
import { ManufacturerDetail } from "./manufacturer-detail";
import { ManufacturerDialog, type EditTarget } from "./manufacturer-dialog";
import { plural } from "./manufacturer-stats";

interface ManufacturersPanelProps {
    manufacturers: Manufacturer[];
    /** Every production, for each manufacturer's scorecard and recent list. */
    runs?: ManufacturingRun[];
    canEdit: boolean;
    /** The "Add manufacturer" action lives in the parent header; it drives this. */
    addOpen?: boolean;
    onAddOpenChange?: (open: boolean) => void;
    onChanged: () => void;
    /** Open a production (the Production page shows it in its drawer). */
    onOpenRun?: (runId: string) => void;
}

const CREATE_TARGET: EditTarget = { mode: "create" };

/**
 * The fab-house directory as a list and a detail: pick a manufacturer on the
 * left, see its contact, its processes (always visible, with their key minimums
 * and who uses them), how its productions have gone, and the projects using it.
 */
export function ManufacturersPanel({
    manufacturers,
    runs = [],
    canEdit,
    addOpen,
    onAddOpenChange,
    onChanged,
    onOpenRun,
}: ManufacturersPanelProps) {
    const [selectedId, setSelectedId] = useState<string>("");
    const [query, setQuery] = useState("");
    const [editTarget, setEditing] = useState<EditTarget>(null);
    const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
    const [deleting, setDeleting] = useState(false);

    // The add action is triggered from the parent header, so "add is open" there means the
    // create dialog is showing, without copying that prop into state.
    const editing: EditTarget = editTarget ?? (addOpen ? CREATE_TARGET : null);

    const closeEditing = () => {
        setEditing(null);
        onAddOpenChange?.(false);
    };

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle ? manufacturers.filter((m) => m.name.toLowerCase().includes(needle)) : manufacturers;
    }, [manufacturers, query]);

    // Keep a valid selection: the chosen one if it still exists, else the first listed.
    const selected =
        manufacturers.find((m) => m.id === selectedId) ?? visible[0] ?? manufacturers[0] ?? null;

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteManufacturer(deleteTarget.id);
            toast.success("Manufacturer deleted.");
            setDeleteTarget(null);
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col border md:flex-row">
                {manufacturers.length === 0 ? (
                    <EmptyState
                        icon={Building2}
                        className="min-h-64 flex-1 border-0"
                        action={
                            canEdit ? (
                                <Button size="sm" onClick={() => setEditing(CREATE_TARGET)}>
                                    <Plus />
                                    Add manufacturer
                                </Button>
                            ) : undefined
                        }
                    >
                        No manufacturers yet. Add the fab houses you order from.
                    </EmptyState>
                ) : (
                    <>
                        <nav
                            aria-label="Manufacturers"
                            className="flex max-h-64 shrink-0 flex-col border-b md:max-h-none md:w-72 md:border-b-0 md:border-r"
                        >
                            <div className="relative border-b p-2">
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    aria-label="Search manufacturers"
                                    placeholder="Search"
                                    className="h-8 pl-8 pr-8 text-xs"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                                {query ? (
                                    <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        aria-label="Clear manufacturers search"
                                        title="Clear"
                                        className="absolute right-2 top-1/2 -translate-y-1/2"
                                        onClick={() => setQuery("")}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                ) : null}
                            </div>
                            <ul className="themed-scrollbar min-h-0 flex-1 overflow-auto">
                                {visible.map((m) => (
                                    <li key={m.id}>
                                        <button
                                            type="button"
                                            aria-current={selected?.id === m.id ? "true" : undefined}
                                            onClick={() => setSelectedId(m.id)}
                                            className={cn(
                                                "w-full border-b px-3 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                                selected?.id === m.id && "bg-muted/60",
                                            )}
                                        >
                                            <span className="block truncate text-sm font-medium">{m.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {plural(m.process_count ?? 0, "process", "processes")} ·{" "}
                                                {plural(m.project_count ?? 0, "project")}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                                {visible.length === 0 && (
                                    <li className="p-4 text-center text-sm text-muted-foreground">No match.</li>
                                )}
                            </ul>
                        </nav>

                        {selected && (
                            <ManufacturerDetail
                                key={selected.id}
                                manufacturer={selected}
                                runs={runs.filter((r) => r.manufacturer_id === selected.id)}
                                canEdit={canEdit}
                                onEdit={() => setEditing({ mode: "edit", manufacturer: selected })}
                                onDelete={() => setDeleteTarget(selected)}
                                onChanged={onChanged}
                                onOpenRun={onOpenRun}
                            />
                        )}
                    </>
                )}
            </div>

            {editing && (
                <ManufacturerDialog
                    target={editing}
                    onClose={closeEditing}
                    onSaved={(id) => {
                        closeEditing();
                        setSelectedId(id);
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete manufacturer?"
                description={
                    <>
                        {deleteTarget?.name} will be removed. Production that references it keeps its history but
                        shows no manufacturer.
                    </>
                }
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={() => void handleDelete()}
            />
        </div>
    );
}
