import { useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import type { Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { createRun } from "@/lib/manufacturing";
import type { Manufacturer } from "@/types/manufacturing";

interface NewRunWizardProps {
    open: boolean;
    projects: Project[];
    manufacturers: Manufacturer[];
    onClose: () => void;
    onCreated: (runId: string) => void;
}

// The guided steps, in order. Each is only reachable once the ones before it are
// satisfied, so a run can never be created with no project or a zero quantity.
const STEPS = ["Project", "Quantity", "Manufacturer", "Details", "Confirm"] as const;

export function NewRunWizard({ open, projects, manufacturers, onClose, onCreated }: NewRunWizardProps) {
    const [step, setStep] = useState(0);
    const [projectId, setProjectId] = useState("");
    const [quantity, setQuantity] = useState<number>(0);
    const [manufacturerId, setManufacturerId] = useState<string>("");
    const [commitSha, setCommitSha] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const project = useMemo(
        () => projects.find((p) => p.id === projectId) ?? null,
        [projects, projectId],
    );

    const canAdvance = useMemo(() => {
        switch (step) {
            case 0:
                return Boolean(projectId);
            case 1:
                return quantity > 0;
            default:
                return true;
        }
    }, [step, projectId, quantity]);

    const handleCreate = async () => {
        setSubmitting(true);
        try {
            const { id } = await createRun({
                project_id: projectId,
                manufacturer_id: manufacturerId || null,
                commit_sha: commitSha.trim(),
                quantity_ordered: quantity,
                notes: notes.trim(),
            });
            toast.success("Run created.");
            onCreated(id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create run.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>New production run</DialogTitle>
                    <DialogDescription>
                        Record a fabrication run against a project and board.
                    </DialogDescription>
                </DialogHeader>

                {/* Step rail */}
                <ol className="flex items-center gap-1 text-xs">
                    {STEPS.map((name, index) => (
                        <li key={name} className="flex items-center gap-1">
                            <span
                                className={
                                    "flex h-6 items-center gap-1.5 rounded-full px-2 " +
                                    (index === step
                                        ? "bg-primary text-primary-foreground"
                                        : index < step
                                          ? "text-primary"
                                          : "text-muted-foreground")
                                }
                            >
                                {index < step ? <Check className="h-3 w-3" /> : null}
                                {name}
                            </span>
                            {index < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        </li>
                    ))}
                </ol>

                <div className="min-h-[9rem] py-2">
                    {step === 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="run-project">Project</Label>
                            <select
                                id="run-project"
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                            >
                                <option value="">Select a project…</option>
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.display_name || p.name}
                                        {p.sub_path && p.sub_path !== "." ? ` (${p.sub_path})` : ""}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                The board being fabricated. Its specs and history come along.
                            </p>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-2">
                            <Label htmlFor="run-qty">Quantity ordered</Label>
                            <Input
                                id="run-qty"
                                type="number"
                                min={1}
                                value={quantity || ""}
                                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                            />
                            <p className="text-xs text-muted-foreground">How many boards were ordered.</p>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-2">
                            <Label htmlFor="run-mfr">Manufacturer</Label>
                            <select
                                id="run-mfr"
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={manufacturerId}
                                onChange={(e) => setManufacturerId(e.target.value)}
                            >
                                <option value="">No manufacturer</option>
                                {manufacturers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Optional. Manage the list from the Manufacturers tab.
                            </p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="run-commit">Commit (optional)</Label>
                                <Input
                                    id="run-commit"
                                    placeholder="The revision that was built"
                                    value={commitSha}
                                    onChange={(e) => setCommitSha(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="run-notes">Notes (optional)</Label>
                                <Textarea
                                    id="run-notes"
                                    rows={3}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <dl className="space-y-2 text-sm">
                            <Row label="Project" value={project ? project.display_name || project.name : "—"} />
                            <Row label="Quantity" value={String(quantity)} />
                            <Row
                                label="Manufacturer"
                                value={manufacturers.find((m) => m.id === manufacturerId)?.name || "None"}
                            />
                            <Row label="Commit" value={commitSha.trim() || "—"} />
                        </dl>
                    )}
                </div>

                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
                        disabled={submitting}
                    >
                        {step === 0 ? "Cancel" : "Back"}
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
                            Next
                        </Button>
                    ) : (
                        <Button onClick={() => void handleCreate()} disabled={submitting}>
                            {submitting ? "Creating…" : "Create run"}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
        </div>
    );
}
