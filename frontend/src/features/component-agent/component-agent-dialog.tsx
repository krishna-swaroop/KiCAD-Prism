import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import type { CatalogComponent } from "@/types/catalog";

type AgentTask = {
  id: string;
  status: string;
  message: string;
  error_message?: string;
  payload: { component_id?: string };
  result?: {
    agent_status?: string;
    decision?: string;
    question?: string;
    review_required?: boolean;
    spec?: { pins?: unknown[]; units?: Array<{ name: string; pin_numbers: string[] }> };
    documents?: Array<{ id: string; url: string; sha256: string; pages: number }>;
    candidates?: { files?: Partial<Record<"symbol" | "footprint", { filename: string }>>; findings?: Array<{ code: string; path: string; detail: string }>; warnings?: Array<{ code: string; path: string; detail: string }> };
  };
};
type AgentTrace = Array<{ id: string; finish?: string; content: Array<{ type: string; text?: string; name?: string; state?: string }> }>;
type AgentActivity = { id: string; status: string; trace: AgentTrace };
const terminal = new Set(["completed", "failed", "cancelled"]);

export function observeAgentActivity(id: string, onUpdate: (activity: AgentActivity) => void): () => void {
  let closed = false;
  const source = new EventSource(`/api/catalog/agent-tasks/${encodeURIComponent(id)}/events`, { withCredentials: true });
  source.addEventListener("activity", event => { if (!closed) onUpdate(JSON.parse((event as MessageEvent).data) as AgentActivity); });
  const stop = () => { closed = true; source.close(); };
  source.addEventListener("end", stop);
  return stop;
}

export function observeAgentTask(id: string, onUpdate: (task: AgentTask) => void, onError: (error: Error) => void): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const result = await fetchJson<AgentTask>(`/api/catalog/agent-tasks/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      onUpdate(result);
      if (!terminal.has(result.status)) timer = setTimeout(() => void poll(), 1500);
    } catch (reason) {
      if (!controller.signal.aborted) onError(reason instanceof Error ? reason : new Error(String(reason)));
    }
  };
  void poll();
  return () => { controller.abort(); if (timer !== undefined) clearTimeout(timer); };
}

export function ComponentAgentButton({ component, onAttached }: { component?: CatalogComponent; onAttached?: () => void }) {
  const [params, setParams] = useSearchParams();
  const taskId = params.get("agentTask") || "";
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ id: string; task: AgentTask } | null>(null);
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [manufacturer, setManufacturer] = useState("");
  const [mpn, setMpn] = useState("");
  const [sources, setSources] = useState("");
  const [instructions, setInstructions] = useState("");
  const [thinking, setThinking] = useState(false);
  const task = loaded?.id === taskId ? loaded.task : null;
  const visible = open || Boolean(taskId);
  const running = Boolean(taskId && (!task || !terminal.has(task.status)));

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<{ enabled: boolean }>("/api/catalog/agent-config", { signal: controller.signal })
      .then(result => setEnabled(result.enabled)).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!taskId) return;
    return observeAgentTask(taskId, result => { setLoaded({ id: taskId, task: result }); setError(""); }, reason => setError(reason.message));
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    return observeAgentActivity(taskId, setActivity);
  }, [taskId]);

  const setTaskId = (id: string) => setParams(current => {
    const next = new URLSearchParams(current);
    if (id) next.set("agentTask", id); else next.delete("agentTask");
    return next;
  });
  const launch = async () => {
    setBusy(true); setError("");
    try {
      const result = await fetchJson<{ job_id: string }>("/api/catalog/agent-tasks", { method: "POST", body: JSON.stringify({
        manufacturer: component?.manufacturer || manufacturer.trim(), mpn: component?.mpn || mpn.trim(),
        component_id: component?.id || "", expected_revision_id: component?.current_revision_id || "",
        source_urls: sources.split("\n").map(s => s.trim()).filter(Boolean), thinking, instructions,
      }) });
      setTaskId(result.job_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const attach = async (kind: "symbol" | "footprint") => {
    if (!component) return;
    setBusy(true);
    try {
      await fetchJson(`/api/catalog/agent-tasks/${encodeURIComponent(taskId)}/attach/${kind}`, { method: "POST", body: JSON.stringify({ expected_revision_id: component.current_revision_id }) });
      toast.success(`Candidate ${kind} attached to a new revision. Run validation and review the source pinout before QA.`);
      onAttached?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await fetchJson(`/api/catalog/agent-tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const files = task?.result?.candidates?.files || {};
  const outcome = task?.status === "completed"
    ? task.result?.decision === "needs_input" ? "Research needs engineering input"
      : Object.keys(files).length ? "Candidate ready for engineering review" : "Proposal rejected by spec checks"
    : task?.result?.agent_status === "queued" ? "Queued; waiting for the model slot" : task?.message || "Loading research task…";
  return <>
    <Button size="sm" variant="outline" disabled={!enabled} title={enabled ? "Research an exact part and prepare review candidates" : "Component agent is not configured"} onClick={() => { setOpen(true); setSources(component?.datasheet_url || ""); }}><Bot className="h-4 w-4" /> Component agent</Button>
    <Dialog open={visible} onOpenChange={value => { setOpen(value); if (!value) setTaskId(""); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Component agent</DialogTitle><DialogDescription>Research manufacturer evidence and prepare a draft for engineering review.</DialogDescription></DialogHeader>
        {!taskId ? <div className="space-y-4">
          {component ? <p className="text-sm">{component.manufacturer} · {component.mpn}</p> : <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="agent-manufacturer">Manufacturer</Label><Input id="agent-manufacturer" value={manufacturer} onChange={e => setManufacturer(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="agent-mpn">Exact part number</Label><Input id="agent-mpn" value={mpn} onChange={e => setMpn(e.target.value)} /></div></div>}
          <div className="space-y-2"><Label htmlFor="agent-sources">Manufacturer document URLs (optional, one per line)</Label><Textarea id="agent-sources" value={sources} onChange={e => setSources(e.target.value)} placeholder="https://…/datasheet.pdf" /><p className="text-xs text-muted-foreground">Leave empty to research from the part number. Web search requires a configured search provider.</p></div>
          <div className="space-y-2"><Label htmlFor="agent-instructions">Engineering instructions or answer to an earlier question</Label><Textarea id="agent-instructions" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Partition I/O by bank and keep power domains in separate units." /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={thinking} onChange={e => setThinking(e.target.checked)} /> Enable model thinking</label>
          <Button disabled={busy || !enabled || !(component?.mpn || mpn.trim()) || !(component?.manufacturer || manufacturer.trim())} onClick={() => void launch()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} Start research</Button>
        </div> : <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm" role="status">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{outcome}</p>
          <p className="break-all text-xs text-muted-foreground">Task {taskId} · {task?.status || "loading"}</p>
          <details open className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Model activity</summary>
            <div className="mt-3 max-h-80 space-y-3 overflow-y-auto" aria-label="Live model responses">
              {activity?.id === taskId && activity.trace.length ? [...activity.trace].reverse().map(message => <div key={message.id} className="space-y-2">
                {message.content.map(part => part.type === "text" || part.type === "reasoning" ? <div key={part.type}><p className="text-xs font-medium text-muted-foreground">{part.type === "reasoning" ? "Thinking" : "Response"}</p><pre className="whitespace-pre-wrap break-words text-xs">{part.text || "Generating…"}</pre></div> : part.type === "tool" ? <p className="text-xs text-muted-foreground" key={part.name}>{part.name} · {part.state}</p> : null)}
              </div>) : <p className="text-xs text-muted-foreground">Waiting for model activity…</p>}
            </div>
          </details>
          {task?.result?.question ? <p className="rounded-md border p-3 text-sm">{task.result.question}</p> : null}
          {task?.result?.spec ? <div className="space-y-2"><p className="text-sm">{task.result.spec.pins?.length || 0} pins · {task.result.spec.units?.length || 0} units</p>{task.result.spec.units?.map(unit => <p className="text-xs text-muted-foreground" key={unit.name}>{unit.name}: {unit.pin_numbers.length} pins</p>)}<details><summary className="cursor-pointer text-sm">Inspect ComponentSpec</summary><pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(task.result.spec, null, 2)}</pre></details></div> : null}
          {task?.result?.documents?.map(doc => <p className="break-all text-xs text-muted-foreground" key={doc.id}><a className="text-primary underline" href={doc.url} target="_blank" rel="noreferrer">{doc.url}</a><br />SHA256 {doc.sha256} · {doc.pages} pages</p>)}
          {task?.result?.candidates?.findings?.map(finding => <p className="text-xs text-destructive" key={`${finding.code}:${finding.path}:${finding.detail}`}>{finding.code}: {finding.detail}</p>)}
          {task?.result?.candidates?.warnings?.length ? <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Footprint assumptions and review warnings ({task.result.candidates.warnings.length})</summary><div className="mt-2 space-y-2">{task.result.candidates.warnings.map(warning => <p className="text-xs text-muted-foreground" key={`${warning.code}:${warning.path}:${warning.detail}`}>{warning.path}: {warning.detail}</p>)}</div></details> : null}
          {Object.entries(files).map(([kind, file]) => <div className="flex flex-wrap items-center gap-2" key={kind}><Button asChild variant="outline" size="sm"><a href={`/api/catalog/agent-tasks/${encodeURIComponent(taskId)}/candidates/${kind}`}><Download className="h-4 w-4" />{file.filename}</a></Button>{component && task?.payload.component_id === component.id ? <Button size="sm" disabled={busy} onClick={() => void attach(kind as "symbol" | "footprint")}>Attach candidate {kind}</Button> : null}</div>)}
          {task?.result?.review_required ? <p className="text-xs text-muted-foreground">Source pinout review and catalog validation are required before requesting QA review.</p> : null}
          {running ? <Button variant="outline" disabled={busy} onClick={() => void cancel()}>Cancel research</Button> : <Button variant="outline" onClick={() => { setTaskId(""); setOpen(true); }}>Start another attempt</Button>}
        </div>}
        {error || task?.error_message ? <p role="alert" className="text-sm text-destructive">{error || task?.error_message}</p> : null}
      </DialogContent>
    </Dialog>
  </>;
}
