import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, FileText, MoreHorizontal, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    deleteDefect,
    deleteEvidence,
    evidenceUrl,
    logDefect,
    updateDefect,
    uploadEvidence,
} from "@/lib/manufacturing";
import {
    DEFECT_CATEGORIES,
    defectCategoryLabel,
    type DefectSeverity,
    type ManufacturingRun,
    type RunDefect,
} from "@/types/manufacturing";
import { EmptyState } from "./empty-state";
import { SEVERITY_VARIANT, SOLID_DESTRUCTIVE } from "./status-badge";
import { OptionSelect } from "./option-select";

const SEVERITY_BORDER: Record<DefectSeverity, string> = {
    aesthetic: "border-l-border",
    minor: "border-l-muted-foreground/50",
    major: "border-l-warning",
    critical: "border-l-destructive",
};

const SEVERITY_OPTIONS = [
    { value: "aesthetic", label: "Aesthetic" },
    { value: "minor", label: "Minor" },
    { value: "major", label: "Major" },
    { value: "critical", label: "Critical" },
];

type DefectFilter = "open" | "resolved" | "all";

const FILTERS: { value: DefectFilter; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
];

const SEVERITY_LABEL: Record<DefectSeverity, string> = {
    aesthetic: "Aesthetic",
    minor: "Minor",
    major: "Major",
    critical: "Critical",
};

interface DefectsSectionProps {
    run: ManufacturingRun;
    canLogDefects: boolean;
    /** Called after any change to a defect, so the run reloads. */
    onChanged: () => void;
}

/** A production's defects: filter them, log one, and act on each. */
export function DefectsSection({ run, canLogDefects, onChanged }: DefectsSectionProps) {
    const [filter, setFilter] = useState<DefectFilter>("all");
    const [addOpen, setAddOpen] = useState(false);

    const defects = run.defects ?? [];
    const openCount = defects.filter((d) => d.status === "open").length;
    const counts: Record<DefectFilter, number> = {
        open: openCount,
        resolved: defects.length - openCount,
        all: defects.length,
    };
    const shown = defects.filter((d) => (filter === "all" ? true : filter === "open" ? d.status === "open" : d.status !== "open"));

    return (
        <>
        <section aria-label="Defects" className="space-y-2">
            <SectionHeading
                title="Defects"
                actions={
                    <>
                        <Tabs value={filter} activationMode="manual" className="shrink-0">
                            <StudioTabsList aria-label="Filter defects">
                                {FILTERS.map((option) => (
                                    <StudioTabsTrigger
                                        key={option.value}
                                        value={option.value}
                                        className="gap-1.5"
                                        onClick={() => setFilter(option.value)}
                                    >
                                        {option.label}
                                        <span className="tabular-nums opacity-70">{counts[option.value]}</span>
                                    </StudioTabsTrigger>
                                ))}
                            </StudioTabsList>
                        </Tabs>
                        {canLogDefects && (
                            <Button size="sm" onClick={() => setAddOpen(true)}>
                                <Plus /> Log defect
                            </Button>
                        )}
                    </>
                }
            />

            {defects.length === 0 ? (
                <EmptyState
                    icon={CheckCircle2}
                    iconClassName="text-success opacity-70"
                    action={
                        canLogDefects ? (
                            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                                Log defect
                            </Button>
                        ) : undefined
                    }
                >
                    No defects logged.
                </EmptyState>
            ) : shown.length === 0 ? (
                <EmptyState>No {filter} defects.</EmptyState>
            ) : (
                <ul className="space-y-2">
                    {shown.map((defect) => (
                        <DefectCard
                            key={defect.id}
                            runId={run.id}
                            defect={defect}
                            canEdit={canLogDefects}
                            onChanged={() => onChanged()}
                        />
                    ))}
                </ul>
            )}
        </section>
        
            {addOpen && (
                <AddDefectDialog
                    runId={run.id}
                    onClose={() => setAddOpen(false)}
                    onLogged={() => {
                        setAddOpen(false);
                        onChanged();
                    }}
                />
            )}
        </>
    );
}

interface DefectCardProps {
    runId: string;
    defect: RunDefect;
    canEdit: boolean;
    onChanged: () => void;
}

function DefectCard({ runId, defect, canEdit, onChanged }: DefectCardProps) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [disposition, setDisposition] = useState<"resolve" | "accept" | null>(null);

    const isOpen = defect.status === "open";

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            // One at a time: each upload adds to the defect's evidence list on the server, and
            // two at once would overwrite each other's entry.
            await Array.from(files).reduce<Promise<unknown>>(
                (chain, file) => chain.then(() => uploadEvidence(defect.id, file)),
                Promise.resolve(),
            );
            toast.success("Evidence attached.");
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload failed.");
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    };

    const reopen = async () => {
        try {
            await updateDefect(defect.id, { status: "open" });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to reopen the defect.");
        }
    };

    return (
        <li className={cn("border border-l-4", SEVERITY_BORDER[defect.severity])}>
            <div className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{defectCategoryLabel(defect.category)}</span>
                        <Badge
                            variant={SEVERITY_VARIANT[defect.severity]}
                            className={defect.severity === "critical" ? SOLID_DESTRUCTIVE : undefined}
                        >
                            {SEVERITY_LABEL[defect.severity]}
                        </Badge>
                        <Badge variant="outline">{defect.quantity_affected} affected</Badge>
                        {defect.status === "resolved" && <Badge variant="success">Resolved</Badge>}
                        {defect.status === "accepted" && <Badge variant="info">Accepted as is</Badge>}
                    </div>
                    {defect.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{defect.description}</p>
                    )}
                    {!isOpen && (defect.resolution_note || defect.resolved_by) && (
                        <p className="mt-2 border-l-2 pl-3 text-sm">
                            {defect.resolution_note || (defect.status === "accepted" ? "Accepted as is." : "Resolved.")}
                            <span className="block text-xs text-muted-foreground">
                                {[defect.resolved_by, defect.resolved_at ? new Date(defect.resolved_at).toLocaleDateString() : ""]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                        </p>
                    )}
                </div>
                {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                        {isOpen ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => setDisposition("resolve")}>
                                    Resolve
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setDisposition("accept")}>
                                    Accept as is
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" size="sm" onClick={() => void reopen()}>
                                Reopen
                            </Button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon-sm" aria-label="Defect actions">
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setConfirmDelete(true)}
                                >
                                    <Trash2 />
                                    Delete defect
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            {/* Evidence */}
            {(defect.evidence.length > 0 || canEdit) && (
                <div className="flex flex-wrap items-center gap-2 border-t p-3">
                    {defect.evidence.map((item) => (
                        <EvidenceThumb
                            key={item.digest}
                            runId={runId}
                            defectId={defect.id}
                            item={item}
                            canDelete={canEdit}
                            onDeleted={onChanged}
                        />
                    ))}
                    {canEdit && (
                        <>
                            <input
                                ref={fileInput}
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                className="hidden"
                                onChange={(e) => void handleUpload(e.target.files)}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={uploading}
                                onClick={() => fileInput.current?.click()}
                            >
                                <Paperclip />
                                {uploading ? "Uploading…" : "Attach evidence"}
                            </Button>
                        </>
                    )}
                </div>
            )}

            {disposition && (
                <DispositionDialog
                    defect={defect}
                    mode={disposition}
                    onClose={() => setDisposition(null)}
                    onDone={() => {
                        setDisposition(null);
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete defect?"
                description="This removes the defect and its attached evidence."
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={async () => {
                    setDeleting(true);
                    try {
                        await deleteDefect(defect.id);
                        setConfirmDelete(false);
                        onChanged();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to delete.");
                    } finally {
                        setDeleting(false);
                    }
                }}
            />
        </li>
    );
}

// Closing a defect: resolving takes an optional note; accepting it as-is needs a
// reason, because that is a decision to ship a known defect.
function DispositionDialog({
    defect,
    mode,
    onClose,
    onDone,
}: {
    defect: RunDefect;
    mode: "resolve" | "accept";
    onClose: () => void;
    onDone: () => void;
}) {
    const accepting = mode === "accept";
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const trimmed = note.trim();

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            await updateDefect(defect.id, {
                status: accepting ? "accepted" : "resolved",
                ...(trimmed ? { resolution_note: trimmed } : {}),
            });
            toast.success(accepting ? "Defect accepted as is." : "Defect resolved.");
            onDone();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update the defect.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{accepting ? "Accept defect as is" : "Resolve defect"}</DialogTitle>
                    <DialogDescription>
                        {accepting
                            ? "The units ship with this defect. Say why that is acceptable."
                            : "Say what was done about it, if that helps the next reader."}
                    </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
                    <div className="space-y-1.5">
                        <Label htmlFor="def-note">{accepting ? "Why is this acceptable?" : "Note (optional)"}</Label>
                        <Textarea
                            id="def-note"
                            rows={3}
                            autoFocus
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || (accepting && !trimmed)}>
                            {saving ? "Saving…" : accepting ? "Accept as is" : "Resolve"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EvidenceThumb({
    runId,
    defectId,
    item,
    canDelete,
    onDeleted,
}: {
    runId: string;
    defectId: string;
    item: RunDefect["evidence"][number];
    canDelete: boolean;
    onDeleted: () => void;
}) {
    const url = evidenceUrl(runId, item.digest);
    const isPdf = item.media_type === "application/pdf";
    const [confirmRemove, setConfirmRemove] = useState(false);
    return (
        <div className="group relative">
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex size-16 items-center justify-center overflow-hidden border bg-muted"
                title={item.filename}
            >
                {isPdf ? (
                    <FileText className="h-6 w-6 text-muted-foreground" />
                ) : (
                    <img src={url} alt={item.filename} className="h-full w-full object-cover" />
                )}
            </a>
            {canDelete && (
                // Faded in on hover, but always reachable: by keyboard focus and on touch screens.
                <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    aria-label={`Remove ${item.filename}`}
                    className="absolute -right-1.5 -top-1.5 bg-background text-destructive opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    onClick={() => setConfirmRemove(true)}
                >
                    <Trash2 />
                </Button>
            )}
            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title="Remove evidence?"
                description={<>{item.filename} will be removed from this defect.</>}
                confirmLabel="Remove"
                onConfirm={() =>
                    void deleteEvidence(defectId, item.digest)
                        .then(() => {
                            setConfirmRemove(false);
                            onDeleted();
                        })
                        .catch((error) =>
                            toast.error(error instanceof Error ? error.message : "Failed to remove."),
                        )
                }
            />
        </div>
    );
}

interface AddDefectDialogProps {
    runId: string;
    onClose: () => void;
    onLogged: () => void;
}

function AddDefectDialog({ runId, onClose, onLogged }: AddDefectDialogProps) {
    const [category, setCategory] = useState("soldering");
    const [severity, setSeverity] = useState<DefectSeverity>("minor");
    const [quantity, setQuantity] = useState(1);
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            await logDefect(runId, {
                category,
                severity,
                quantity_affected: quantity,
                description: description.trim(),
            });
            toast.success("Defect logged.");
            onLogged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to log defect.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Log a defect</DialogTitle>
                    <DialogDescription>Record what went wrong and how many units it affected.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="def-category">Category</Label>
                            <OptionSelect
                                id="def-category"
                                value={category}
                                onValueChange={setCategory}
                                options={DEFECT_CATEGORIES}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="def-severity">Severity</Label>
                            <OptionSelect
                                id="def-severity"
                                value={severity}
                                onValueChange={(v) => setSeverity(v as DefectSeverity)}
                                options={SEVERITY_OPTIONS}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="def-qty">Units affected</Label>
                        <Input
                            id="def-qty"
                            type="number"
                            min={1}
                            value={quantity || ""}
                            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="def-desc">Description</Label>
                        <Textarea
                            id="def-desc"
                            rows={3}
                            placeholder="What went wrong, and where"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Logging…" : "Log defect"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
