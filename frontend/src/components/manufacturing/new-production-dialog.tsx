import { useEffect, useMemo, useReducer, useState, type Dispatch } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchApi } from "@/lib/api";
import {
    createRun,
    extractPcbRules,
    getPcbRuleFields,
    getProjectSpec,
    getProjectSpecForManufacturer,
    listProjectManufacturers,
} from "@/lib/manufacturing";
import {
    checkCapabilities,
    mergeCapabilityRows,
    specProgress,
    type PcbRuleField,
    type ParsedSpecConfig,
    type ProjectManufacturer,
    type ProjectSpec,
} from "@/types/manufacturing";
import { CompactSelect } from "./ui";

export interface ProjectOption {
    id: string;
    name: string;
}

interface Release {
    tag: string;
    commit_hash: string;
    full_hash: string;
    date: string;
}

interface NewProductionDialogProps {
    open: boolean;
    projects: ProjectOption[];
    /** Start with this project chosen and fixed (opened from a project's own tab). */
    initialProjectId?: string;
    /** Start with this manufacturer chosen, if the project has it. */
    initialManufacturerId?: string;
    onClose: () => void;
    onCreated: (runId: string) => void;
}

const NO_RELEASE = "";

// --- the form ---------------------------------------------------------------------------------

interface FormState {
    projectId: string;
    manufacturerId: string;
    quantity: string;
    releaseTag: string;
    /** The user chose a release (or none), so a newer one loading must not replace it. */
    releaseTouched: boolean;
    commitSha: string;
    notes: string;
}

type FormAction =
    | { type: "project"; projectId: string }
    | { type: "field"; field: "manufacturerId" | "quantity" | "commitSha" | "notes"; value: string }
    | { type: "release"; tag: string; hash: string }
    | { type: "releasesLoaded"; releases: Release[] }
    | { type: "manufacturersLoaded"; ids: string[] };

function formReducer(state: FormState, action: FormAction): FormState {
    switch (action.type) {
        case "project":
            // A new project brings its own releases, so the release choice starts over.
            return { ...state, projectId: action.projectId, releaseTag: NO_RELEASE, releaseTouched: false, commitSha: "" };
        case "field":
            return { ...state, [action.field]: action.value };
        case "release":
            // A release fills the commit with its revision; none leaves it to the user.
            return { ...state, releaseTag: action.tag, commitSha: action.hash, releaseTouched: true };
        case "releasesLoaded": {
            // Until the user picks, a project's newest release is the default build.
            if (state.releaseTouched || action.releases.length === 0) return state;
            const latest = [...action.releases].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
            return { ...state, releaseTag: latest.tag, commitSha: latest.full_hash };
        }
        case "manufacturersLoaded": {
            // Keep the chosen manufacturer if this project has it; else the only one.
            const keep = action.ids.includes(state.manufacturerId);
            return { ...state, manufacturerId: keep ? state.manufacturerId : action.ids.length === 1 ? action.ids[0] : "" };
        }
    }
}

// --- what a project brings --------------------------------------------------------------------

interface ProjectContext {
    releases: Release[];
    manufacturers: ProjectManufacturer[];
    manufacturersLoaded: boolean;
    boardRules: Record<string, unknown> | null;
}

const NO_CONTEXT: ProjectContext = { releases: [], manufacturers: [], manufacturersLoaded: false, boardRules: null };

/** A project's releases, its attached manufacturers, and the board's own rules. */
function useProjectContext(projectId: string, dispatch: Dispatch<FormAction>): ProjectContext {
    const [context, setContext] = useState<ProjectContext>(NO_CONTEXT);

    useEffect(() => {
        setContext(NO_CONTEXT);
        if (!projectId) return;
        let cancelled = false;
        const patch = (change: Partial<ProjectContext>) => !cancelled && setContext((c) => ({ ...c, ...change }));

        void (async () => {
            try {
                const res = await fetchApi(`/api/projects/${projectId}/releases?limit=100`);
                if (!res.ok) throw new Error();
                const releases = ((await res.json()) as { releases?: Release[] }).releases ?? [];
                if (cancelled) return;
                patch({ releases });
                dispatch({ type: "releasesLoaded", releases });
            } catch {
                patch({ releases: [] });
            }
        })();
        void (async () => {
            try {
                const manufacturers = await listProjectManufacturers(projectId);
                if (cancelled) return;
                patch({ manufacturers });
                dispatch({ type: "manufacturersLoaded", ids: manufacturers.map((m) => m.id) });
            } catch {
                patch({ manufacturers: [] });
            } finally {
                patch({ manufacturersLoaded: true });
            }
        })();
        void extractPcbRules(projectId)
            .then(({ rules }) => patch({ boardRules: rules }))
            .catch(() => patch({ boardRules: null }));
        return () => {
            cancelled = true;
        };
    }, [projectId, dispatch]);

    return context;
}

function useRuleFields(): PcbRuleField[] {
    const [fields, setFields] = useState<PcbRuleField[]>([]);
    useEffect(() => {
        let cancelled = false;
        void getPcbRuleFields()
            .then((result) => !cancelled && setFields(result.fields))
            .catch(() => !cancelled && setFields([]));
        return () => {
            cancelled = true;
        };
    }, []);
    return fields;
}

type FrozenSpec = ProjectSpec & { parsed: ParsedSpecConfig };

/** The manufacturer's one spec: what the run freezes. */
function useFrozenSpec(projectId: string, manufacturerId: string): FrozenSpec | null {
    const [spec, setSpec] = useState<FrozenSpec | null>(null);
    useEffect(() => {
        setSpec(null);
        if (!projectId || !manufacturerId) return;
        let cancelled = false;
        // The per-manufacturer lookup finds (or creates) the spec; the full read has its
        // process capabilities too.
        void getProjectSpecForManufacturer(projectId, manufacturerId)
            .then((s) => getProjectSpec(s.id))
            .then((s) => !cancelled && setSpec(s))
            .catch(() => !cancelled && setSpec(null));
        return () => {
            cancelled = true;
        };
    }, [projectId, manufacturerId]);
    return spec;
}

// --- pieces of the form -----------------------------------------------------------------------

function ManufacturerField({
    projectId,
    context,
    value,
    onChange,
    onClose,
}: {
    projectId: string;
    context: ProjectContext;
    value: string;
    onChange: (id: string) => void;
    onClose: () => void;
}) {
    const none = Boolean(projectId) && context.manufacturersLoaded && context.manufacturers.length === 0;
    return (
        <div className="space-y-1">
            <Label htmlFor="run-mfr">Manufacturer</Label>
            {none ? (
                <p className="border border-dashed p-3 text-sm text-muted-foreground">
                    This project has no manufacturers yet.{" "}
                    <Link
                        to={`/project/${projectId}?section=manufacturing`}
                        onClick={onClose}
                        className="text-primary hover:underline"
                    >
                        Attach one on its Manufacturing tab
                    </Link>
                    , then start the production.
                </p>
            ) : (
                <CompactSelect
                    id="run-mfr"
                    className="h-9"
                    value={value}
                    disabled={!projectId}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">{projectId ? "Select a manufacturer…" : "Choose a project first"}</option>
                    {context.manufacturers.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.name}
                        </option>
                    ))}
                </CompactSelect>
            )}
        </div>
    );
}

function BuildFields({
    form,
    releases,
    dispatch,
}: {
    form: FormState;
    releases: Release[];
    dispatch: Dispatch<FormAction>;
}) {
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <Label htmlFor="run-qty">Quantity ordered</Label>
                    <Input
                        id="run-qty"
                        type="number"
                        min={1}
                        className="h-9"
                        value={form.quantity}
                        onChange={(e) => dispatch({ type: "field", field: "quantity", value: e.target.value })}
                    />
                </div>
                {releases.length > 0 && (
                    <div className="space-y-1">
                        <Label htmlFor="run-release">Release</Label>
                        <CompactSelect
                            id="run-release"
                            className="h-9"
                            value={form.releaseTag}
                            onChange={(e) => {
                                const tag = e.target.value;
                                const release = releases.find((r) => r.tag === tag);
                                dispatch({ type: "release", tag, hash: release ? release.full_hash : "" });
                            }}
                        >
                            {releases.map((r) => (
                                <option key={r.tag} value={r.tag}>
                                    {r.tag} ({r.commit_hash})
                                </option>
                            ))}
                            <option value={NO_RELEASE}>No release, use a commit</option>
                        </CompactSelect>
                    </div>
                )}
            </div>

            {form.releaseTag === NO_RELEASE && (
                <div className="space-y-1">
                    <Label htmlFor="run-commit">Commit (optional)</Label>
                    <Input
                        id="run-commit"
                        className="h-9"
                        placeholder="The revision that was built"
                        value={form.commitSha}
                        onChange={(e) => dispatch({ type: "field", field: "commitSha", value: e.target.value })}
                    />
                </div>
            )}
        </>
    );
}

interface Freeze {
    progress: { set: number; total: number };
    findings: number;
    process: string | null;
}

/** What the run will freeze, and a warning (never a block) about an empty spec or a weak board. */
function FreezeSummary({ freeze, projectId, onClose }: { freeze: Freeze; projectId: string; onClose: () => void }) {
    const emptySpec = freeze.progress.total > 0 && freeze.progress.set === 0;
    return (
        <div className="space-y-1.5 border bg-muted/30 px-3 py-2.5 text-sm">
            <p>
                <span className="text-muted-foreground">Freezes:</span>{" "}
                {freeze.process ? `${freeze.process} spec` : "this spec"},{" "}
                <span className="tabular-nums">
                    {freeze.progress.set} of {freeze.progress.total}
                </span>{" "}
                fields set
            </p>
            {(emptySpec || freeze.findings > 0) && (
                <p className="flex items-start gap-1.5 text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                        {emptySpec ? "The spec is empty. " : ""}
                        {freeze.findings > 0
                            ? `${freeze.findings} ${freeze.findings === 1 ? "rule is" : "rules are"} below the process minimums. `
                            : ""}
                        <Link to={`/project/${projectId}?section=manufacturing`} onClick={onClose} className="underline">
                            Review the spec
                        </Link>
                    </span>
                </p>
            )}
        </div>
    );
}

// --- the dialog -------------------------------------------------------------------------------

/**
 * Start a production: one short form, then the run freezes the manufacturer's
 * spec as it stands. A line under the form says exactly what will be frozen and
 * flags an empty spec or a board below the process minimums. Never blocks.
 */
export function NewProductionDialog({
    open,
    projects,
    initialProjectId,
    initialManufacturerId,
    onClose,
    onCreated,
}: NewProductionDialogProps) {
    const [form, dispatch] = useReducer(formReducer, {
        projectId: initialProjectId ?? "",
        manufacturerId: initialManufacturerId ?? "",
        quantity: "",
        releaseTag: NO_RELEASE,
        releaseTouched: false,
        commitSha: "",
        notes: "",
    });
    const [submitting, setSubmitting] = useState(false);

    const context = useProjectContext(form.projectId, dispatch);
    const ruleFields = useRuleFields();
    const spec = useFrozenSpec(form.projectId, form.manufacturerId);

    const quantity = Number(form.quantity);
    const canSubmit = Boolean(form.projectId && form.manufacturerId && Number.isFinite(quantity) && quantity > 0 && spec);

    const freeze = useMemo<Freeze | null>(() => {
        if (!spec) return null;
        const progress = specProgress(spec.parsed?.sections ?? [], spec.specs ?? {}, new Set(spec.active_sections ?? []));
        const rows = mergeCapabilityRows(
            ruleFields,
            spec.template_capabilities ?? {},
            spec.template_capability_meta ?? {},
        );
        const { findings } = checkCapabilities(rows, context.boardRules);
        return { progress, findings: findings.length, process: spec.template_name ?? null };
    }, [spec, ruleFields, context.boardRules]);

    const handleCreate = async () => {
        if (!canSubmit || !spec) return;
        setSubmitting(true);
        try {
            const { id } = await createRun({
                project_id: form.projectId,
                manufacturer_id: form.manufacturerId,
                spec_id: spec.id,
                commit_sha: form.commitSha.trim(),
                release_tag: form.releaseTag,
                quantity_ordered: quantity,
                notes: form.notes.trim(),
            });
            toast.success("Production created.");
            onCreated(id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create production.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>New production</DialogTitle>
                    <DialogDescription>Record a board order. The manufacturer&rsquo;s spec is frozen onto it.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-1">
                    <div className="space-y-1">
                        <Label htmlFor="run-project">Project</Label>
                        <CompactSelect
                            id="run-project"
                            className="h-9"
                            value={form.projectId}
                            disabled={Boolean(initialProjectId)}
                            onChange={(e) => dispatch({ type: "project", projectId: e.target.value })}
                        >
                            <option value="">Select a project…</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </CompactSelect>
                    </div>

                    <ManufacturerField
                        projectId={form.projectId}
                        context={context}
                        value={form.manufacturerId}
                        onChange={(value) => dispatch({ type: "field", field: "manufacturerId", value })}
                        onClose={onClose}
                    />

                    <BuildFields form={form} releases={context.releases} dispatch={dispatch} />

                    <div className="space-y-1">
                        <Label htmlFor="run-notes">Notes (optional)</Label>
                        <Textarea
                            id="run-notes"
                            rows={2}
                            value={form.notes}
                            onChange={(e) => dispatch({ type: "field", field: "notes", value: e.target.value })}
                        />
                    </div>

                    {freeze && <FreezeSummary freeze={freeze} projectId={form.projectId} onClose={onClose} />}
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleCreate()} disabled={!canSubmit || submitting}>
                        {submitting ? "Creating…" : "Create production"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
