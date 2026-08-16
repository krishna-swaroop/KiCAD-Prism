import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import type { Project } from "@/types/project";
import { fetchApi } from "@/lib/api";
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
import { CompactSelect } from "./ui";

interface NewRunWizardProps {
    open: boolean;
    projects: Project[];
    manufacturers: Manufacturer[];
    onClose: () => void;
    onCreated: (runId: string) => void;
}

interface Release {
    tag: string;
    commit_hash: string;
    full_hash: string;
    date: string;
    message: string;
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
    const [releaseTag, setReleaseTag] = useState("");
    const [releases, setReleases] = useState<Release[]>([]);
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const project = useMemo(
        () => projects.find((p) => p.id === projectId) ?? null,
        [projects, projectId],
    );

    // Load the project's releases so a run can be tied to one rather than a raw sha.
    useEffect(() => {
        if (!projectId) {
            setReleases([]);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetchApi(`/api/projects/${projectId}/releases?limit=100`);
                if (!res.ok) throw new Error();
                const data = (await res.json()) as { releases?: Release[] };
                if (!cancelled) setReleases(data.releases ?? []);
            } catch {
                if (!cancelled) setReleases([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

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
            // Record the release tag in notes for traceability; the commit holds the sha.
            const runNotes = releaseTag
                ? [`Release: ${releaseTag}`, notes.trim()].filter(Boolean).join("\n")
                : notes.trim();
            const { id } = await createRun({
                project_id: projectId,
                manufacturer_id: manufacturerId || null,
                commit_sha: commitSha.trim(),
                quantity_ordered: quantity,
                notes: runNotes,
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
                            <CompactSelect
                                id="run-project"
                                className="h-9"
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
                            </CompactSelect>
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
                            <CompactSelect
                                id="run-mfr"
                                className="h-9"
                                value={manufacturerId}
                                onChange={(e) => setManufacturerId(e.target.value)}
                            >
                                <option value="">No manufacturer</option>
                                {manufacturers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </CompactSelect>
                            <p className="text-xs text-muted-foreground">
                                Optional. Manage the list from the Manufacturers tab.
                            </p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            {releases.length > 0 && (
                                <div className="space-y-1">
                                    <Label htmlFor="run-release">Release (optional)</Label>
                                    <CompactSelect
                                        id="run-release"
                                        className="h-9"
                                        value={releaseTag}
                                        onChange={(e) => {
                                            const tag = e.target.value;
                                            setReleaseTag(tag);
                                            // Picking a release fills the commit with its revision.
                                            const rel = releases.find((r) => r.tag === tag);
                                            setCommitSha(rel ? rel.full_hash : "");
                                        }}
                                    >
                                        <option value="">No release</option>
                                        {releases.map((r) => (
                                            <option key={r.tag} value={r.tag}>
                                                {r.tag} ({r.commit_hash})
                                            </option>
                                        ))}
                                    </CompactSelect>
                                    <p className="text-xs text-muted-foreground">
                                        Tie this run to a tagged release of the board.
                                    </p>
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label htmlFor="run-commit">Commit (optional)</Label>
                                <Input
                                    id="run-commit"
                                    placeholder="The revision that was built"
                                    value={commitSha}
                                    onChange={(e) => {
                                        setCommitSha(e.target.value);
                                        // Editing the sha by hand detaches it from the picked release.
                                        setReleaseTag("");
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
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
                        <dl className="divide-y rounded-md border text-sm">
                            <Row label="Project" value={project ? project.display_name || project.name : "—"} />
                            <Row label="Quantity" value={String(quantity)} />
                            <Row
                                label="Manufacturer"
                                value={manufacturers.find((m) => m.id === manufacturerId)?.name || "None"}
                            />
                            {releaseTag && <Row label="Release" value={releaseTag} />}
                            <Row label="Commit" value={commitSha.trim() ? commitSha.trim().slice(0, 7) : "—"} />
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
        <div className="flex items-center justify-between gap-6 px-3 py-2">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="truncate text-right font-medium">{value}</dd>
        </div>
    );
}
