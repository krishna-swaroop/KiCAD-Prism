import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, ListRestart, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { cancelPrismJob, jobPipeline, throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import type { UserRole } from "@/types/auth";

import * as api from "./api";
import { RunList } from "./RunList";
import { StageRail } from "./StageRail";
import { InspectOutputsStep } from "./steps/InspectOutputsStep";
import { ObserveBuildStep } from "./steps/ObserveBuildStep";
import { PublishStep } from "./steps/PublishStep";
import { IdentityStep } from "./steps/IdentityStep";
import { ManufacturingStep } from "./steps/ManufacturingStep";
import { SourceStep } from "./steps/SourceStep";
import type {
    BuildDetail,
    ManufacturingChoices,
    PipelineState,
    ProjectCommit,
    ReleaseCandidate,
    ReleaseConfiguration,
    ReleaseIdentity,
    ReleaseManufacturing,
    ReleaseSource,
    RunStage,
    StageState,
    StudioView,
    VendorProfile,
} from "./types";

type Props = {
    projectId: string;
    canMutate: boolean;
    userRole?: UserRole;
    defaultCommit?: string;
};

const FULL_SHA = /^[a-f0-9]{40}$/i;

/**
 * Kept below the 20 MB base64 ceiling `CandidateRequest.stackup_pdf_b64`
 * enforces: base64 inflates by 4/3, so the raw file has to stay under ~15 MB.
 * Checking here turns a 422 that arrives at build time into an answer the
 * moment the file is chosen.
 */
const MAX_STACKUP_BYTES = 14_000_000;

/**
 * Base64 without building a megabyte-long string one character at a time.
 *
 * The per-byte `binary += String.fromCharCode(...)` this replaces walked the
 * whole file on the main thread and froze the tab on a large vendor stackup.
 */
function base64FromBytes(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    const parts: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        parts.push(String.fromCharCode(...bytes.subarray(offset, offset + CHUNK)));
    }
    return btoa(parts.join(""));
}

function resolveCommitSelection(value: string, commits: ProjectCommit[]): string {
    const revision = value.trim();
    if (revision === "HEAD") return commits[0]?.full_hash ?? revision;
    return commits.find((commit) => commit.full_hash === revision || commit.hash === revision)?.full_hash ?? revision;
}

// react-doctor-disable-next-line no-giant-component - build lifecycle orchestration: polling, stages, uploads, and logs share one state machine
export function ReleaseStudioPanel({
    projectId,
    canMutate,
    userRole,
    defaultCommit = "HEAD",
// react-doctor-disable-next-line prefer-useReducer - the states belong to separate concerns: build lifecycle, detail cache, upload fields
}: Props) {
    const [view, setView] = useState<StudioView>(() => {
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("build")) return "history";
        return "current";
    });
    const [stage, setStage] = useState<RunStage>("source");
    // Set when the user opens a specific run, so a newer build does not pull
    // the view out from under someone reading an older release's evidence.
    const pinnedRef = useRef(
        typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("build")),
    );
    // "New release" opens the Source stage so a revision and configuration can
    // be chosen. Building immediately took that choice away and made the button
    // fire an expensive job on a single click.
    const [drafting, setDrafting] = useState(() => {
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("build")) return false;
        return true;
    });
    const draftingRef = useCommittedRef(drafting);
    const [commits, setCommits] = useState<ProjectCommit[]>([]);
    const [commitsLoading, setCommitsLoading] = useState(true);
    const [commitSha, setCommitSha] = useState(defaultCommit);
    const [variant, setVariant] = useState("");
    const [bomPreset, setBomPreset] = useState("");
    const [source, setSource] = useState<ReleaseSource | null>(null);
    const [ipc, setIpc] = useState<ManufacturingChoices>({ manufacturing: [], assembly: [] });
    const [identity, setIdentity] = useState<ReleaseIdentity>(() => ({
        tag: "",
        document_name: "",
        date: new Date().toISOString().slice(0, 10),
        notes: "",
    }));
    const [manufacturing, setManufacturing] = useState<ReleaseManufacturing>({
        manufacturing_ipc_class: "IPC-6012 Class 2",
        assembly_ipc_class: "IPC-A-610 Class 2",
        solder_mask_colour: "",
        silkscreen_colour: "",
        via_treatment: "",
        vendors: [],
    });
    const [impedanceCsv, setImpedanceCsv] = useState("");
    const [stackupName, setStackupName] = useState("");
    // The stackup upload is read only when a build starts, never on screen.
    const stackupB64Ref = useRef("");
    const [profiles, setProfiles] = useState<VendorProfile[]>([]);
    const [candidates, setCandidates] = useState<ReleaseCandidate[]>([]);
    // The run lives in the URL so it survives a reload and can be shared --
    // an approver following a link must land on the build they were asked
    // about, not on whatever happens to be newest.
    const [selectedBuildId, setSelectedBuildId] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return new URLSearchParams(window.location.search).get("build");
    });
    const selectedBuildIdRef = useCommittedRef(selectedBuildId);
    const detailRequestRef = useRef(0);
    const [detail, setDetail] = useState<BuildDetail | null>(null);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [pipeline, setPipeline] = useState<PipelineState | null>(null);
    const [jobStatus, setJobStatus] = useState("");
    const [jobMessage, setJobMessage] = useState("");
    const [jobPercent, setJobPercent] = useState(0);
    const [liveLogs, setLiveLogs] = useState<string[]>([]);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const activeJobIdRef = useCommittedRef(activeJobId);
    // Read only by the select-build handler; not part of the rendered state.
    const currentBuildIdRef = useRef<string | null>(null);
    // Never let a retained response drive a different selected run.
    const selectedDetail = detail?.build.id === selectedBuildId ? detail : null;
    // A full 40-character SHA is the whole requirement. Membership of the
    // fetched page is not: that list is a convenience, and a release for a
    // commit older than it must not become unreachable. `getSource` resolves
    // the SHA against the commit tree and fails loudly if it names nothing.
    const selectedCommitValid = FULL_SHA.test(commitSha);
    const canStartBuild = canMutate;
    const canSignOff = userRole ? ["admin", "designer", "qa"].includes(userRole) : canMutate;
    const identityComplete = Boolean(identity.tag.trim() && identity.document_name.trim() && identity.date.trim());

    const refreshDetail = useCallback(async (buildId: string) => {
        const request = ++detailRequestRef.current;
        try {
            const value = await api.getBuild(projectId, buildId);
            if (request === detailRequestRef.current && selectedBuildIdRef.current === buildId) {
                setDetail(value);
            }
            return value;
        } catch (cause) {
            // A selection change invalidates this request. Never surface an
            // old response/error over the newly selected run.
            if (request === detailRequestRef.current && selectedBuildIdRef.current === buildId) {
                throw cause;
            }
            return null;
        }
    }, [projectId, selectedBuildIdRef]);

    const refresh = useCallback(async (preferredJobId?: string) => {
        try {
            const [nextCandidates, nextProfiles] = await Promise.all([
                api.listCandidates(projectId),
                api.listVendorProfiles(projectId).catch(() => []),
            ]);
            setCandidates(nextCandidates);
            setProfiles(nextProfiles);
            setError("");
            // Follow the newest run unless the user opened a specific one.
            // The old rule was `current ?? newest`, which set the selection
            // once and never advanced it, so a build you had just triggered
            // never became the selected run.
            const preferredBuild = preferredJobId
                ? nextCandidates.flatMap((item) => item.builds?.length ? item.builds : item.latest_build ? [item.latest_build] : [])
                    .find((build) => build.job_id === preferredJobId)
                : null;
            setSelectedBuildId((current) => {
                // A run being composed has no build yet; refreshing must not
                // drop the user onto the newest finished one.
                if (preferredBuild) return preferredBuild.id;
                if (draftingRef.current) return current;
                if (pinnedRef.current && current) return current;
                return current;
            });
            if (preferredBuild) currentBuildIdRef.current = preferredBuild.id;
            return preferredBuild?.id ?? null;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            return null;
        }
    }, [draftingRef, projectId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Configuration is a revision-scoped input to a new release. It is kept
    // deliberately separate from project history so selecting a commit does
    // not restart candidates, shares, or detail fetches.
    useEffect(() => {
        let cancelled = false;
        if (!selectedCommitValid) {
            setSource(null);
            return;
        }
        void api.getSource(projectId, commitSha)
            .then((next) => {
                if (cancelled) return;
                setSource(next.source);
                setIpc(next.ipc);
                setVariant(next.source.variant || next.source.variants[0] || "default");
                setBomPreset(next.source.default_bom_preset || "");
                setManufacturing((current) => current.vendors.length ? current : { ...current, vendors: profiles.map((item) => item.id) });
            })
            .catch((cause: unknown) => {
                if (cancelled) return;
                setSource(null);
                setError(cause instanceof Error ? cause.message : String(cause));
            });
        return () => { cancelled = true; };
    }, [projectId, commitSha, selectedCommitValid, profiles]);

    useEffect(() => {
        let cancelled = false;
        setCommitsLoading(true);
        void api
            .listProjectCommits(projectId)
            .then((next) => {
                if (cancelled) return;
                setCommits(next);
                setCommitSha((current) => resolveCommitSelection(current, next));
            })
            .catch(() => {
                if (!cancelled) setCommits([]);
            })
            .finally(() => {
                if (!cancelled) setCommitsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    useEffect(() => {
        if (!selectedBuildId) {
            setDetail(null);
            return;
        }
        // Do not render the preceding run while this run's detail is loading.
        // The id guard below is a second line of defence for batched updates.
        setDetail(null);
        // Nothing here reaches a parent: setDetail, setError and refreshDetail
        // are all this component's own, so there is no extra render to save.
        // react-doctor-disable-next-line react-doctor/no-pass-live-state-to-parent
        void refreshDetail(selectedBuildId).catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, [refreshDetail, selectedBuildId]);

    useEffect(() => {
        if (stage !== "publish" || !selectedBuildId) return;
        const timer = window.setInterval(() => {
            void refreshDetail(selectedBuildId).catch(() => undefined);
        }, 3000);
        return () => window.clearInterval(timer);
    }, [refreshDetail, selectedBuildId, stage]);

    useEffect(() => {
        const jobId = selectedDetail?.build.job_id;
        if (!jobId || selectedDetail.build.status !== "running" || activeJobIdRef.current === jobId) return;
        const controller = new AbortController();
        currentBuildIdRef.current = selectedDetail.build.id;
        void watchPrismJob(jobId, {
            signal: controller.signal,
            includeLogs: true,
            onUpdate: (value, logs) => {
                setJobStatus(value.status);
                setJobMessage(value.message);
                setJobPercent(value.percent);
                setLiveLogs(logs);
                const next = jobPipeline(value);
                if (next) setPipeline(next);
            },
        }).then(async () => {
            await refresh(jobId);
            await refreshDetail(selectedDetail.build.id).catch(() => undefined);
        }).catch((cause: unknown) => {
            if (cause instanceof DOMException && cause.name === "AbortError") return;
            setError(cause instanceof Error ? cause.message : String(cause));
        });
        return () => controller.abort();
    }, [activeJobIdRef, refresh, refreshDetail, selectedDetail?.build.id, selectedDetail?.build.job_id, selectedDetail?.build.status]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (selectedBuildId) url.searchParams.set("build", selectedBuildId);
        else url.searchParams.delete("build");
        window.history.replaceState(window.history.state, "", url.toString());
    }, [selectedBuildId]);

    const openRun = useCallback((buildId: string, destination: RunStage = "build") => {
        pinnedRef.current = true;
        // Selecting an already-open library record must retain its detail:
        // React does not rerun the fetch effect for an unchanged build id.
        // Different ids still clear synchronously before their fetch starts.
        if (buildId !== selectedBuildId) {
            setDetail(null);
            setPipeline(null);
            setLiveLogs([]);
            setJobStatus("");
            setJobMessage("");
            setJobPercent(0);
        }
        setStage(destination);
        setSelectedBuildId(buildId);
    }, [selectedBuildId]);

    const run = useCallback(
        async (label: string, action: () => Promise<unknown>, success = "") => {
            const buildId = selectedBuildIdRef.current;
            let completed = false;
            setBusy(label);
            setError("");
            try {
                await action();
                // Governance responses alter the current build detail. Fetch
                // it before showing success, otherwise gates read old facts.
                if (buildId && selectedBuildIdRef.current === buildId) await refreshDetail(buildId);
                completed = true;
                if (success) toast.success(success);
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                // A queued build can fail before a job update reaches us. Its
                // attempt must still enter history and become the selected log.
                await refresh();
                if (!completed && buildId && selectedBuildIdRef.current === buildId) {
                    await refreshDetail(buildId).catch(() => undefined);
                }
                setBusy("");
            }
        },
        [refresh, refreshDetail, selectedBuildIdRef],
    );

    const handleBuild = () => {
        if (!selectedCommitValid) {
            setError("Choose a listed immutable 40-character commit before building.");
            return;
        }
        return run("build", async () => {
            setView("current");
            setStage("build");
            // The worker's first progress update carries the authoritative
            // skeleton, vendor steps included. Nothing here has to guess it.
            setPipeline(null);
            setLiveLogs([]);
            // A new run starts with nothing done. Leaving the previous build
            // selected left its finished detail driving the rail, so a build
            // that had only just been queued showed Source, Outputs, and
            // Publish already ticked -- the last run's state wearing the
            // new run's progress bar. Release the pin too, so refresh() lands
            // on the run being created.
            pinnedRef.current = false;
            setDrafting(false);
            setSelectedBuildId(null);
            setDetail(null);
            const { job } = await api.startBuild(projectId, {
                commit_sha: commitSha,
                variant: variant.trim(),
                board: source?.board,
                schematic: source?.schematic,
                bom_preset: bomPreset,
                identity,
                manufacturing,
                impedance_csv: impedanceCsv,
                stackup_pdf_b64: stackupB64Ref.current,
            });
            setActiveJobId(job.job_id);
            const finished = await watchPrismJob(job.job_id, {
                includeLogs: true,
                onUpdate: (value, logs) => {
                    setJobStatus(value.status);
                    setJobMessage(value.message);
                    setJobPercent(value.percent);
                    setLiveLogs(logs);
                    const next = jobPipeline(value);
                    if (next) setPipeline(next);
                },
            });
            const next = jobPipeline(finished);
            if (next) setPipeline(next);
            const builtId = await refresh(job.job_id);
            if (builtId) {
                pinnedRef.current = true;
                currentBuildIdRef.current = builtId;
                setSelectedBuildId(builtId);
            }
            setActiveJobId(null);
            if (finished.status === "completed") setStage("outputs");
            else setStage("build");
            throwIfJobFailed(finished, "The build failed.");
        }, "Build finished.");
    };

    const handleCancel = async () => {
        const jobId = activeJobId ?? selectedDetail?.build.job_id ?? null;
        if (!jobId || busy === "cancel-build") return;
        setBusy("cancel-build");
        setError("");
        try {
            await cancelPrismJob(jobId);
            setJobStatus("cancel_requested");
            setJobMessage("Cancellation requested");
            toast.message("Cancellation requested.");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy("");
        }
    };

    const selectedCandidate = useMemo(
        () => candidates.find((item) => (item.builds?.length ? item.builds : item.latest_build ? [item.latest_build] : []).some((build) => build.id === selectedBuildId)) ?? selectedDetail?.candidate ?? null,
        [candidates, selectedBuildId, selectedDetail?.candidate],
    );
    const newestBuildId = candidates.flatMap((item) => item.builds?.length ? item.builds : item.latest_build ? [item.latest_build] : [])
        .sort((left, right) => Date.parse(right.completed_at || right.started_at || "") - Date.parse(left.completed_at || left.started_at || ""))[0]?.id ?? null;
    const behind = Boolean(
        selectedBuildId && newestBuildId && selectedBuildId !== newestBuildId,
    );

    const building = Boolean(activeJobId) || selectedDetail?.build.status === "running" || busy === "build";
    const stageStates = useMemo<Record<RunStage, StageState>>(() => {
        const locked = { source: "locked", identity: "locked", manufacturing: "locked", build: "locked", outputs: "locked", publish: "locked" } as const;
        if (drafting) {
            const draft: Record<RunStage, StageState> = { ...locked, source: stage === "source" ? "active" : "done" };
            if (stage === "identity") draft.identity = "active";
            else if (stage !== "source") draft.identity = "done";
            if (stage === "manufacturing") draft.manufacturing = "active";
            else if (stage === "build" || stage === "outputs" || stage === "publish") draft.manufacturing = "done";
            return draft;
        }
        if (building) return { ...locked, source: "done", identity: "done", manufacturing: "done", build: "active" };
        const status = selectedDetail?.build.status;
        if (status === "failed") return { ...locked, source: "done", identity: "done", manufacturing: "done", build: "failed" };
        if (status === "cancelled") return { ...locked, source: "done", identity: "done", manufacturing: "done", build: "cancelled" };
        if (status !== "succeeded") return { ...locked, source: selectedCandidate ? "done" : "active", build: "active" };
        const published = Boolean(selectedDetail?.approvals?.published || selectedDetail?.build.published);
        return {
            source: "done",
            identity: "done",
            manufacturing: "done",
            build: "done",
            outputs: "done",
            publish: published ? "done" : "pending",
        };
    }, [building, drafting, selectedCandidate, selectedDetail?.approvals?.published, selectedDetail?.build.published, selectedDetail?.build.status, stage]);

    const stageSummaries = useMemo<Partial<Record<RunStage, string>>>(
        () => (building ? { build: "running" } : drafting ? { source: "choose a revision" } : {
            source: selectedCandidate
                ? `${selectedCandidate.commit_sha.slice(0, 8)} · ${selectedCandidate.config_key}`
                : undefined,
            build: selectedDetail ? selectedDetail.build.status : undefined,
            outputs: selectedDetail ? `${selectedDetail.members.length} members` : undefined,
            publish: selectedDetail?.forge?.name,
        }),
        [building, drafting, selectedCandidate, selectedDetail],
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1">
                <div className="flex items-center gap-0.5">
                    {([
                        { id: "settings", label: "New release", icon: Settings2 },
                        { id: "current", label: "Current", icon: ListRestart },
                        { id: "history", label: "History", icon: History },
                    ] as const).map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                setView(id);
                                if (id === "settings") {
                                    setDrafting(true);
                                    setView("current");
                                    setStage("source");
                                    setSelectedBuildId(null);
                                    setDetail(null);
                                    return;
                                }
                                setDrafting(false);
                                if (id === "current") {
                                    setSelectedBuildId(currentBuildIdRef.current);
                                    setStage(activeJobId ? "build" : "outputs");
                                } else if (id === "history") {
                                    pinnedRef.current = false;
                                    setSelectedBuildId(null);
                                    setDetail(null);
                                    setStage("build");
                                }
                            }}
                            aria-current={(view === id || (id === "settings" && drafting && !selectedBuildId)) ? "page" : undefined}
                            className={cn(
                                "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm",
                                view === id || (id === "settings" && drafting && !selectedBuildId) ? "bg-muted font-medium" : "text-muted-foreground",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
                {(selectedBuildId || building || drafting) && (
                    <IdentityStrip
                        candidate={selectedCandidate}
                        configuration={selectedDetail?.configuration ?? null}
                        identity={identity}
                        fallbackCommit={commitSha}
                        variant={variant}
                        status={
                            building
                                ? "building"
                                : drafting
                                  ? "new release"
                                  : (selectedDetail?.build.status ?? "loading")
                        }
                        behind={behind}
                        onJumpToLatest={() => {
                            pinnedRef.current = false;
                            if (newestBuildId) openRun(newestBuildId);
                        }}
                    />
                )}
            </header>

            {error && (
                <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
                    {error}
                </div>
            )}
            {view === "settings" ? null : (
                <div className="flex min-h-0 flex-1">
                    {view === "history" && (
                        <ResizablePanel
                            side="left"
                            storageKey="prism.releaseStudio.runHistoryWidth"
                            defaultWidth={288}
                            minWidth={180}
                            maxWidth={480}
                            aria-label="Run history"
                        >
                            <RunList
                                candidates={candidates}
                                selectedBuildId={selectedBuildId}
                                onSelect={(buildId) => {
                                    setDrafting(false);
                                    openRun(buildId);
                                }}
                            />
                        </ResizablePanel>
                    )}

                    {!selectedBuildId && !building && !drafting ? (
                        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                            Select a run, or start a new release.
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1">
                            <ResizablePanel
                                side="left"
                                storageKey="prism.releaseStudio.stageRailWidth"
                                defaultWidth={176}
                                minWidth={140}
                                maxWidth={320}
                                aria-label="Run stages"
                            >
                                <div className="h-full overflow-y-auto p-2">
                                    <StageRail
                                        stage={stage}
                                        states={stageStates}
                                        summaries={stageSummaries}
                                        onSelect={(next) => {
                                            if (stageStates[next] !== "locked") setStage(next);
                                        }}
                                    />
                                </div>
                            </ResizablePanel>
                            <div
                                className={cn(
                                    "min-h-0 min-w-0 flex-1",
                                    stage === "outputs" || stage === "publish"
                                        ? "flex flex-col overflow-hidden p-2"
                                        : "overflow-y-auto p-4",
                                )}
                            >
                                    {stage === "source" && drafting && (
                                        <SourceStep
                                            commits={commits}
                                            commitSha={commitSha}
                                            commitsLoading={commitsLoading}
                                            source={source}
                                            variant={variant}
                                            bomPreset={bomPreset}
                                            canMutate={canStartBuild}
                                            busy={busy}
                                            onCommit={(value) => setCommitSha(resolveCommitSelection(value, commits))}
                                            onBoard={(value) => setSource((current) => current ? { ...current, board: value } : current)}
                                            onSchematic={(value) => setSource((current) => current ? { ...current, schematic: value } : current)}
                                            onVariant={setVariant}
                                            onBomPreset={setBomPreset}
                                            onContinue={() => {
                                                if (!source) return;
                                                void api.saveSourceDefaults(projectId, {
                                                    board: source.board,
                                                    schematic: source.schematic,
                                                    variant,
                                                    bom_preset: bomPreset,
                                                }).catch((cause: unknown) => {
                                                    setError(cause instanceof Error ? cause.message : String(cause));
                                                }).finally(() => setStage("identity"));
                                            }}
                                        />
                                    )}
                                    {stage === "identity" && drafting && (
                                        <IdentityStep
                                            projectId={projectId}
                                            identity={identity}
                                            canMutate={canStartBuild}
                                            busy={busy}
                                            onChange={setIdentity}
                                            onContinue={() => setStage("manufacturing")}
                                        />
                                    )}
                                    {stage === "manufacturing" && drafting && (
                                        <ManufacturingStep
                                            projectId={projectId}
                                            manufacturing={manufacturing}
                                            ipc={ipc}
                                            profiles={profiles}
                                            canMutate={canStartBuild}
                                            busy={busy}
                                            identityComplete={identityComplete}
                                            impedanceCsv={impedanceCsv}
                                            stackupName={stackupName}
                                            onChange={setManufacturing}
                                            onImpedanceCsv={setImpedanceCsv}
                                            onStackup={(file) => {
                                                if (!file) {
                                                    setStackupName("");
                                                    stackupB64Ref.current = "";
                                                    setError("");
                                                    return;
                                                }
                                                if (file.size > MAX_STACKUP_BYTES) {
                                                    setStackupName("");
                                                    stackupB64Ref.current = "";
                                                    setError(
                                                        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. `
                                                        + `The stackup PDF must be under ${MAX_STACKUP_BYTES / 1_000_000} MB.`,
                                                    );
                                                    return;
                                                }
                                                setStackupName(file.name);
                                                setError("");
                                                void file.arrayBuffer().then((buffer) => {
                                                    stackupB64Ref.current = base64FromBytes(new Uint8Array(buffer));
                                                });
                                            }}
                                            onBuild={() => void handleBuild()}
                                        />
                                    )}
                                    {stage === "source" && !drafting && selectedDetail && (
                                        <SourceDetails detail={selectedDetail} />
                                    )}
                                    {stage === "identity" && !drafting && selectedDetail && (
                                        <IdentityDetails configuration={selectedDetail.configuration ?? null} />
                                    )}
                                    {stage === "manufacturing" && !drafting && selectedDetail && (
                                        <ManufacturingDetails configuration={selectedDetail.configuration ?? null} />
                                    )}
                                    {stage === "build" && (
                                        <ObserveBuildStep
                                            pipeline={pipeline}
                                            jobStatus={jobStatus}
                                            message={jobMessage}
                                            percent={jobPercent}
                                            projectId={projectId}
                                            buildId={selectedBuildId}
                                            liveLogs={liveLogs}
                                            errorCode={selectedDetail?.build.error_code ?? ""}
                                            errorMessage={selectedDetail?.build.error_message ?? ""}
                                            canCancel={Boolean(activeJobId ?? selectedDetail?.build.job_id) && canMutate && (jobStatus || selectedDetail?.build.status) !== "cancel_requested" && selectedDetail?.build.status !== "succeeded" && selectedDetail?.build.status !== "failed" && selectedDetail?.build.status !== "cancelled"}
                                            cancelling={busy === "cancel-build"}
                                            onCancel={() => void handleCancel()}
                                        />
                                    )}
                                    {stage === "outputs" && selectedDetail && (
                                        <InspectOutputsStep
                                            projectId={projectId}
                                            detail={selectedDetail}
                                            profiles={profiles}
                                            busy={busy}
                                            onContinue={() => setStage("publish")}
                                            onRun={run}
                                            onRefresh={() => selectedBuildId ? refreshDetail(selectedBuildId) : undefined}
                                        />
                                    )}
                                    {stage === "outputs" && !selectedDetail && <LockedStage />}
                                    {stage === "publish" && selectedDetail && (
                                        <PublishStep
                                            projectId={projectId}
                                            detail={selectedDetail}
                                            canMutate={canSignOff}
                                            busy={busy}
                                            onRun={run}
                                        />
                                    )}
                                    {stage === "publish" && !selectedDetail && <LockedStage />}
                                    {stage !== "source" && stage !== "identity" && stage !== "manufacturing" && stage !== "build" && stage !== "outputs" && stage !== "publish" && <LockedStage />}
                                </div>
                            </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ReleaseStudioPanel;

function IdentityStrip({
    candidate,
    configuration,
    identity,
    fallbackCommit,
    variant,
    status,
    behind,
    onJumpToLatest,
}: {
    candidate: ReleaseCandidate | null;
    configuration: ReleaseConfiguration | null;
    identity: ReleaseIdentity;
    fallbackCommit: string;
    variant: string;
    status: string;
    behind: boolean;
    onJumpToLatest: () => void;
}) {
    const commit = candidate?.commit_sha || fallbackCommit;
    const resolvedVariant = candidate?.variant || variant || configuration?.default_variant || "default";
    const documentName = configuration?.document_number || identity.document_name || "—";
    const revision = configuration?.revision || identity.tag || "—";
    return (
        <div
            aria-label="Release identity"
            className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5 text-xs leading-none"
        >
            <span className="font-mono text-muted-foreground">{commit.slice(0, 12) || "HEAD"}</span>
            <Badge variant="outline" className="h-5 px-1.5">{status}</Badge>
            <span className="text-muted-foreground">{resolvedVariant}</span>
            <span className="truncate">{documentName}</span>
            <span className="text-muted-foreground">Rev {revision}</span>
            {behind && (
                <Button size="xs" variant="outline" onClick={onJumpToLatest}>
                    Jump to latest
                </Button>
            )}
        </div>
    );
}

function LockedStage() {
    return <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">Locked until the build finishes.</div>;
}

function SourceDetails({ detail }: { detail: BuildDetail }) {
    const source = detail.candidate;
    const configuration = detail.configuration;
    const rows: [string, string][] = [
        ["Commit", source?.commit_sha || "—"],
        ["Board", configuration?.board_rel || "—"],
        ["Schematic", configuration?.schematic_rel || "—"],
        ["Variant", source?.variant || configuration?.default_variant || "default"],
    ];
    return <SnapshotDetails title="Source" rows={rows} />;
}

function IdentityDetails({ configuration }: { configuration: ReleaseConfiguration | null }) {
    return (
        <SnapshotDetails
            title="Release identity"
            rows={[
                ["Tag", configuration?.revision || "—"],
                ["Document Name", configuration?.document_number || "—"],
                ["Date", configuration?.release_date || "—"],
                ["Release notes", configuration?.release_notes || "—"],
            ]}
        />
    );
}

function snapshotSpec(configuration: ReleaseConfiguration | null, key: string): string {
    // synthesize_configuration stores IPC/finish callouts under fields[]; identity
    // stays at the document root. History must read the same shape the cover uses.
    const nested = configuration?.fields?.[key];
    const top = (configuration as Record<string, unknown> | null)?.[key];
    const value = (typeof nested === "string" && nested) || (typeof top === "string" && top) || "";
    return value.trim() || "—";
}

function ManufacturingDetails({ configuration }: { configuration: ReleaseConfiguration | null }) {
    return (
        <SnapshotDetails
            title="Manufacturing and assembly"
            rows={[
                ["Manufacturing IPC class", snapshotSpec(configuration, "manufacturing_ipc_class")],
                ["Assembly IPC class", snapshotSpec(configuration, "assembly_ipc_class")],
                ["Solder mask colour", snapshotSpec(configuration, "solder_mask_colour")],
                ["Silkscreen colour", snapshotSpec(configuration, "silkscreen_colour")],
                ["Via treatment", snapshotSpec(configuration, "via_treatment")],
                ["Vendors", (configuration?.vendors || []).join(", ") || "—"],
            ]}
        />
    );
}

function SnapshotDetails({ title, rows }: { title: string; rows: [string, string][] }) {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">{title}</h3>
            <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                {rows.map(([label, value]) => (
                    <div key={label} className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="break-all text-sm">{value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
