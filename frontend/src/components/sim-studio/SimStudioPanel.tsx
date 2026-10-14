import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Eye, Loader2, Play, Plus, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import * as api from "./api";
import { installSimStudioScriptApi } from "./script-api";
import { RunResultView } from "./RunResultView";
import type { CatalogEntry, SetupRecord, SetupRecordSummary, SetupReport, SimRun } from "./types";

type Props = {
    projectId: string;
    canMutate: boolean;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Simulation Studio (sim-adr-0017): pick a simulation, then set it up. Each
 * kind gets its own setup flow; until the DC flow is designed this shows the
 * setup's definitions, its validation and the raw document. The setup can be
 * built through `window.prismSimStudio` (see ./script-api.ts).
 */
export function SimStudioPanel({ projectId, canMutate }: Props) {
    const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
    const [kind, setKind] = useState("dc-drop");
    const [setups, setSetups] = useState<SetupRecordSummary[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [record, setRecord] = useState<SetupRecord | null>(null);
    const [report, setReport] = useState<SetupReport | null>(null);
    const [checking, setChecking] = useState(false);
    const [draftName, setDraftName] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [runs, setRuns] = useState<SimRun[]>([]);
    const [viewedRun, setViewedRun] = useState<string | null>(null);
    const viewRun = useCallback((runId: string) => setViewedRun(runId), []);
    const shownRun = runs.find((run) => run.run_id === viewedRun) ?? null;

    const active = runs.some((run) => run.status === "queued" || run.status === "running");
    useEffect(() => {
        let cancelled = false;
        const load = () => api.listRuns(projectId)
            .then((value) => { if (!cancelled) setRuns(value); })
            .catch(() => undefined);
        void load();
        const timer = active ? window.setInterval(load, 2500) : undefined;
        return () => { cancelled = true; if (timer) window.clearInterval(timer); };
    }, [projectId, reloadKey, active]);

    useEffect(() => {
        let cancelled = false;
        api.readCatalog()
            .then((value) => { if (!cancelled) setCatalog(value.entries); })
            .catch((error) => toast.error(message(error)));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        api.listSetups(projectId)
            .then((value) => { if (!cancelled) setSetups(value); })
            .catch((error) => toast.error(message(error)));
        return () => { cancelled = true; };
    }, [projectId, reloadKey]);

    useEffect(() => {
        setReport(null);
        if (!selected) {
            setRecord(null);
            return;
        }
        let cancelled = false;
        api.readSetup(projectId, selected)
            .then((value) => { if (!cancelled) setRecord(value); })
            .catch((error) => toast.error(message(error)));
        return () => { cancelled = true; };
    }, [projectId, selected, reloadKey]);

    useEffect(() => installSimStudioScriptApi(projectId, {
        onChange: (setupId) => {
            if (setupId) setSelected(setupId);
            setReloadKey((key) => key + 1);
        },
        onOpen: (setupId) => setSelected(setupId),
        onView: viewRun,
    }), [projectId, viewRun]);

    const check = useCallback(async (stage: "validate" | "preflight") => {
        if (!selected) return;
        setChecking(true);
        try {
            setReport(await api.checkSetup(projectId, selected, stage));
        } catch (error) {
            toast.error(message(error));
        } finally {
            setChecking(false);
        }
    }, [projectId, selected]);

    const draft = async () => {
        const name = draftName.trim();
        if (!name) return;
        try {
            const created = await api.draftSetup(projectId, kind, name);
            setDraftName("");
            setSelected(created.setup_id);
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast.error(message(error));
        }
    };

    const submit = async () => {
        if (!record) return;
        try {
            await api.submitSetup(projectId, record.setup_id, record.etag, record.setup.analyses[0]?.id ?? "dc");
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast.error(message(error));
        }
    };

    const toggleRail = async (railId: string) => {
        if (!record) return;
        const analysis = record.setup.analyses[0];
        const rails = analysis.rails.includes(railId)
            ? analysis.rails.filter((rail) => rail !== railId)
            : [...analysis.rails, railId];
        try {
            setRecord(await api.patchSetup(projectId, record.setup_id, record.etag, [
                { op: "replace", path: "/analyses/0/rails", value: rails },
            ]));
            setReport(null);
        } catch (error) {
            toast.error(message(error));
            setReloadKey((key) => key + 1);
        }
    };

    const visible = setups.filter((item) => item.kind === kind);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:flex-row">
            <aside className="flex w-full shrink-0 flex-col gap-4 md:w-72">
                <section aria-label="Simulations" className="space-y-2">
                    <h2 className="text-sm font-semibold">Simulations</h2>
                    {catalog === null && <Loader2 className="h-4 w-4 animate-spin" />}
                    {catalog?.map((entry) => (
                        <button
                            key={entry.kind}
                            type="button"
                            disabled={entry.status !== "available"}
                            onClick={() => { setKind(entry.kind); setSelected(null); }}
                            className={cn(
                                "w-full rounded-md border p-3 text-left text-sm transition-colors",
                                entry.kind === kind ? "border-primary bg-primary/5" : "hover:bg-muted",
                                entry.status !== "available" && "cursor-not-allowed opacity-60",
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{entry.display_name}</span>
                                {entry.status === "planned" && <Badge variant="outline">Planned</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{entry.summary}</p>
                        </button>
                    ))}
                </section>
                <section aria-label="Setups" className="space-y-2">
                    <h2 className="text-sm font-semibold">Setups</h2>
                    {canMutate && (
                        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void draft(); }}>
                            <Input
                                aria-label="New setup name"
                                placeholder="New setup name"
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                            />
                            <Button type="submit" size="icon" aria-label="Draft setup" disabled={!draftName.trim()}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </form>
                    )}
                    {visible.length === 0 && <p className="text-xs text-muted-foreground">No setups yet.</p>}
                    {visible.map((item) => (
                        <button
                            key={item.setup_id}
                            type="button"
                            onClick={() => setSelected(item.setup_id)}
                            className={cn(
                                "w-full rounded-md px-3 py-2 text-left text-sm",
                                item.setup_id === selected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                            )}
                        >
                            {item.name}
                            <span className="block text-xs opacity-70">rev {item.revision}</span>
                        </button>
                    ))}
                </section>
            </aside>
            <main className="min-w-0 flex-1 space-y-4">
                {!record && <p className="text-sm text-muted-foreground">Select or draft a setup.</p>}
                {record && (
                    <SetupOverview
                        record={record}
                        report={report}
                        checking={checking}
                        canMutate={canMutate}
                        onCheck={check}
                        onToggleRail={toggleRail}
                        onSubmit={submit}
                    />
                )}
                <RunList
                    runs={runs.filter((run) => !record || run.setup_id === record.setup_id)}
                    viewed={viewedRun}
                    onView={viewRun}
                />
                {shownRun?.status === "succeeded" && (
                    <RunResultView key={shownRun.run_id} projectId={projectId} run={shownRun} canMutate={canMutate} />
                )}
            </main>
        </div>
    );
}

function SetupOverview({ record, report, checking, canMutate, onCheck, onToggleRail, onSubmit }: {
    record: SetupRecord;
    report: SetupReport | null;
    checking: boolean;
    canMutate: boolean;
    onCheck: (stage: "validate" | "preflight") => void;
    onToggleRail: (railId: string) => void;
    onSubmit: () => void;
}) {
    const { setup } = record;
    const solved = new Set(setup.analyses[0]?.rails ?? []);
    return (
        <>
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold">{setup.name}</h2>
                    <p className="text-xs text-muted-foreground">
                        Revision {record.revision} · {record.source.commit ? record.source.commit.slice(0, 8) : "working copy"}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={checking} onClick={() => onCheck("validate")}>Validate</Button>
                    <Button size="sm" disabled={checking} onClick={() => onCheck("preflight")}>
                        {checking ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Activity className="mr-2 h-3.5 w-3.5" />}
                        Preflight
                    </Button>
                    {canMutate && (
                        <Button size="sm" variant="secondary" disabled={checking} onClick={onSubmit}>
                            <Play className="mr-2 h-3.5 w-3.5" />
                            Run
                        </Button>
                    )}
                </div>
            </header>
            {report && <ReportView report={report} />}
            <section aria-label="Rails" className="space-y-1">
                <h3 className="text-sm font-semibold">Rails</h3>
                {setup.rails.length === 0 && <p className="text-xs text-muted-foreground">No rails.</p>}
                {setup.rails.map((rail) => (
                    <label key={rail.id} className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={solved.has(rail.id)}
                            disabled={!canMutate}
                            onChange={() => onToggleRail(rail.id)}
                        />
                        <span className="font-mono">{rail.net.split(":").slice(1).join(":")}</span>
                        <span>{rail.voltage_v} V</span>
                        {rail.inferred && <Badge variant="outline" title="Proposed from the net name; edit it if it is wrong">assumed</Badge>}
                    </label>
                ))}
            </section>
            <Definitions title="Terminals" items={setup.terminals.map((t) => `${t.id}: ${t.positive.join(", ")}${t.reference.length ? ` / ref ${t.reference.join(", ")}` : ""}`)} />
            <Definitions title="Sources" items={setup.sources.map((s) => `${s.id}: rail ${s.rail} at ${s.terminal}`)} />
            <Definitions title="Loads" items={setup.loads.map((l) => `${l.id}: ${l.current_a} A from rail ${l.rail} at ${l.terminal}`)} />
            <Definitions title="Probes" items={setup.probes.map((p) => `${p.id}: ${p.terminal}`)} />
            <details>
                <summary className="cursor-pointer text-sm font-semibold">Setup document</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(setup, null, 2)}</pre>
            </details>
        </>
    );
}

function Definitions({ title, items }: { title: string; items: string[] }) {
    return (
        <section aria-label={title} className="space-y-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            {items.length === 0
                ? <p className="text-xs text-muted-foreground">None yet.</p>
                : <ul className="space-y-0.5 font-mono text-xs">{items.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>
    );
}

function ReportView({ report }: { report: SetupReport }) {
    return (
        <section aria-label="Setup report" className="space-y-1 rounded-md border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
                {report.ok
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <ShieldAlert className="h-4 w-4 text-destructive" />}
                {report.stage === "preflight" ? "Preflight" : "Validation"}: {report.ok ? "ready" : "needs changes"}
            </p>
            <ul className="space-y-1 text-xs">
                {report.issues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className="flex gap-2">
                        {issue.severity === "error"
                            ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                            : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                        <span>{issue.message} <span className="font-mono text-muted-foreground">{issue.path}</span></span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function RunList({ runs, viewed, onView }: { runs: SimRun[]; viewed: string | null; onView: (runId: string) => void }) {
    if (runs.length === 0) return null;
    return (
        <section aria-label="Runs" className="space-y-1">
            <h3 className="text-sm font-semibold">Runs</h3>
            <ul className="space-y-1 text-sm">
                {runs.map((run) => (
                    <li key={run.run_id} className="flex items-center gap-2">
                        <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
                        <span className="font-mono text-xs">{run.run_id}</span>
                        <span className="text-xs text-muted-foreground">
                            rev {run.setup_revision} · {new Date(run.created_at).toLocaleString()}
                        </span>
                        {(run.status === "queued" || run.status === "running") && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {run.status === "succeeded" && (
                            <Button
                                size="sm"
                                variant={viewed === run.run_id ? "secondary" : "ghost"}
                                onClick={() => onView(run.run_id)}
                            >
                                <Eye className="mr-1 h-3.5 w-3.5" /> View result
                            </Button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
