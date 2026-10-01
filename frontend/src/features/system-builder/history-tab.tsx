import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, FileJson, FileSpreadsheet, FileText, GitCompare, Layers, PackageCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canWriteCatalog } from "@/lib/roles";
import { createSnapshot, diffSnapshot, getHistory, icdUrl, listSnapshots, manifestUrl, publishSnapshot } from "@/lib/systems-api";
import type { AuditEvent, RowFields, SnapshotDiff, SnapshotMeta, SystemDocument } from "@/types/system";

import type { SystemTabProps } from "./system-tab-content";
import { shortSha } from "./system-format";
import { PublicationBadge, PublishDialog } from "./publish-dialog";
import { useSystemMutation } from "./use-system-mutation";

const LIVE = "live";

/** One line describing an audit event, with board labels where the payload names an instance. */
export function eventSummary(event: AuditEvent, labels: Map<string, string>): string {
  if (event.redacted || !event.payload) {
    return event.redacted ? "on a board you cannot see" : "";
  }
  const p = event.payload as Record<string, unknown>;
  const board = typeof p.instanceId === "string" ? labels.get(p.instanceId) ?? "a removed board" : null;
  switch (event.kind) {
    case "instance_added":
    case "instance_removed":
      return String(p.label ?? board ?? "");
    case "review_applied":
      if (p.kind === "import") {
        return `import review: ${p.created ?? 0} created, ${p.updated ?? 0} updated`;
      }
      return `${board ?? ""} ${shortSha(p.from as string)} → ${shortSha(p.to as string)}`.trim();
    case "baseline_auto_advanced":
    case "baseline_rebased":
      return `${board ?? ""} ${shortSha(p.from as string)} → ${shortSha(p.to as string)}`.trim();
    case "rows_replaced":
      return `${p.rowCount ?? 0} rows (${(p.added as unknown[] | undefined)?.length ?? 0} added, ${(p.removed as unknown[] | undefined)?.length ?? 0} removed)`;
    case "snapshot_created":
      return String(p.name ?? "");
    case "import_committed":
      return `${p.created ?? 0} created, ${p.updated ?? 0} updated`;
    case "port_override_set":
      return `${board ?? ""} ${String(p.after ?? "reset")}`.trim();
    case "review_item_decided":
      return String(p.decision ?? "");
    case "pose_updated":
      return `${board ?? ""} ${p.after ? "moved" : "back to its default position"}`.trim();
    case "poses_reset": {
      const count = (p.instanceIds as unknown[] | undefined)?.length ?? 0;
      return `${count} ${count === 1 ? "board" : "boards"} back to the default layout`;
    }
    default:
      return board ?? "";
  }
}

/** Only what changed in a row, e.g. "net A PAYLOAD_IRQ# → PAYLOAD_INT#". */
export function rowChange(before: RowFields, after: RowFields): string {
  const nets = (value: string[] | null) => (value?.length ? value.join(" | ") : "no net");
  const parts: string[] = [];
  if (before.pinA !== after.pinA) parts.push(`pin A ${before.pinA ?? "—"} → ${after.pinA ?? "—"}`);
  if (before.pinB !== after.pinB) parts.push(`pin B ${before.pinB ?? "—"} → ${after.pinB ?? "—"}`);
  if (before.signal !== after.signal) parts.push(`signal ${before.signal || "—"} → ${after.signal || "—"}`);
  if (nets(before.netA) !== nets(after.netA)) parts.push(`net A ${nets(before.netA)} → ${nets(after.netA)}`);
  if (nets(before.netB) !== nets(after.netB)) parts.push(`net B ${nets(before.netB)} → ${nets(after.netB)}`);
  return parts.join("; ");
}

function rowText(row: Pick<RowFields, "pinA" | "pinB" | "signal">): string {
  return `${row.pinA ?? "—"} ↔ ${row.pinB ?? "—"}${row.signal ? ` (${row.signal})` : ""}`;
}

export function HistoryTab({ systemId, document, etag, canEdit, user, reload }: SystemTabProps) {
  // Taking a snapshot does not bump the version, so both lists also follow this counter.
  const [snapshotsTaken, setSnapshotsTaken] = useState(0);
  const refresh = `${etag}#${snapshotsTaken}`;
  return (
    <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[1fr_1fr]">
      <SnapshotsSection systemId={systemId} document={document} etag={etag} refresh={refresh} canEdit={canEdit} reload={reload}
        canPublish={canEdit && canWriteCatalog(user?.role)}
        onTaken={() => setSnapshotsTaken((count) => count + 1)} />
      <AuditLog systemId={systemId} document={document} refresh={refresh} />
    </div>
  );
}

interface SnapshotsProps {
  systemId: string;
  document: SystemDocument;
  etag: string;
  /** Changes whenever the lists must be re-read. */
  refresh: string;
  onTaken: () => void;
  canEdit: boolean;
  /** Designers who may also write to the catalog (CONTRACTS_P2 §3.3). */
  canPublish: boolean;
  reload: () => Promise<void>;
}

function SnapshotsSection({ systemId, document, etag, refresh, canEdit, canPublish, reload, onTaken }: SnapshotsProps) {
  const [publishing, setPublishing] = useState<SnapshotMeta | null>(null);
  const [snapshots, setSnapshots] = useState<{ refresh: string; items: SnapshotMeta[] } | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [taking, setTaking] = useState(false);
  const [compare, setCompare] = useState<{ snapshotId: string; against: string } | null>(null);
  const [diff, setDiff] = useState<{ key: string; body: SnapshotDiff } | null>(null);
  const { busy, run } = useSystemMutation(reload);

  useEffect(() => {
    let cancelled = false;
    listSnapshots(systemId).then((items) => !cancelled && setSnapshots({ refresh, items })).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [systemId, refresh]);

  const compareKey = compare ? `${compare.snapshotId}:${compare.against}:${etag}` : null;
  useEffect(() => {
    if (!compare || !compareKey) return;
    let cancelled = false;
    diffSnapshot(systemId, compare.snapshotId, compare.against)
      .then((body) => !cancelled && setDiff({ key: compareKey, body }))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not compare"));
    return () => {
      cancelled = true;
    };
  }, [systemId, compare, compareKey]);

  const take = async () => {
    const done = await run("snapshot", () => createSnapshot(systemId, etag, { name: name.trim(), note: note.trim() }),
      `Snapshot ${name.trim()} created`);
    if (done) {
      setName("");
      setNote("");
      setTaking(false);
      onTaken();
    }
  };

  const items = snapshots?.items ?? [];
  const shown = diff && diff.key === compareKey ? diff.body : null;
  const openReviews = document.openReviewCount;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Snapshots and ICD</h2>
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" onClick={() => setTaking(true)}><Camera className="mr-1 h-4 w-4" /> Take snapshot</Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href={icdUrl(systemId, "html")} target="_blank" rel="noreferrer"><FileText className="mr-1 h-4 w-4" /> Live ICD</a>
          </Button>
          {document.instances.some((instance) => instance.kind === "assembly") && (
            <Button asChild variant="outline" size="sm">
              <a href={icdUrl(systemId, "html", undefined, "all")} target="_blank" rel="noreferrer"
                title="This system's links and every subsystem's own links">
                <Layers className="mr-1 h-4 w-4" /> All levels
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href={icdUrl(systemId, "csv")} download><FileSpreadsheet className="mr-1 h-4 w-4" /> CSV</a>
          </Button>
        </div>
      </div>

      <Dialog open={taking} onOpenChange={setTaking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take a snapshot</DialogTitle>
            <DialogDescription>
              A snapshot freezes every board's baseline, the links and pins, and the findings under a name, for a design
              review or a release. It never changes afterwards.
              {openReviews > 0 && ` It will record that ${openReviews} ${openReviews === 1 ? "change is" : "changes are"} still unreviewed.`}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void take(); }}>
            <div className="grid gap-2">
              <Label htmlFor="snapshot-name">Name</Label>
              <Input id="snapshot-name" aria-label="Snapshot name" placeholder="e.g. CDR" value={name} maxLength={200}
                onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="snapshot-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="snapshot-note" aria-label="Snapshot note" rows={3} value={note} maxLength={4000}
                onChange={(event) => setNote(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTaking(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || busy !== null}>
                {busy === "snapshot" ? "Saving…" : "Take snapshot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No snapshots yet.</p>
      ) : (
        <ul className="divide-y border">
          {items.map((snapshot) => (
            <li key={snapshot.id} className="space-y-1 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{snapshot.name}</span>
                {snapshot.openReviewCount > 0 && (
                  <Badge variant="warning">{snapshot.openReviewCount} unreviewed</Badge>
                )}
                {snapshot.publication && <PublicationBadge publication={snapshot.publication} />}
                <span className="text-xs text-muted-foreground">
                  {new Date(snapshot.createdAt).toLocaleString()} · {snapshot.createdBy.replace(/^user:/, "")}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <a href={icdUrl(systemId, "html", snapshot.id)} target="_blank" rel="noreferrer" aria-label={`ICD of ${snapshot.name}`}>
                      <FileText className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href={icdUrl(systemId, "csv", snapshot.id)} download aria-label={`CSV of ${snapshot.name}`}>
                      <FileSpreadsheet className="h-4 w-4" />
                    </a>
                  </Button>
                  {canPublish && snapshot.manifestSchema && !snapshot.publication && (
                    <Button variant="ghost" size="sm" aria-label={`Publish ${snapshot.name}`} title="Publish to the catalog"
                      onClick={() => setPublishing(snapshot)}>
                      <PackageCheck className="h-4 w-4" />
                    </Button>
                  )}
                  {snapshot.manifestSchema && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={manifestUrl(systemId, snapshot.id)} download={`${snapshot.name}.manifest.json`}
                        aria-label={`Manifest of ${snapshot.name}`} title="Download the system manifest (JSON)">
                        <FileJson className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" aria-label={`Compare ${snapshot.name}`}
                    onClick={() => setCompare({ snapshotId: snapshot.id, against: LIVE })}>
                    <GitCompare className="h-4 w-4" />
                  </Button>
                </span>
              </div>
              {snapshot.note && <p className="text-xs text-muted-foreground">{snapshot.note}</p>}
              <p className="font-mono text-[11px] text-muted-foreground" title={snapshot.digest}>{snapshot.digest.slice(0, 19)}…</p>
            </li>
          ))}
        </ul>
      )}

      {publishing && (
        <PublishDialog snapshot={publishing} systemName={document.system.name}
          firstPublish={!document.system.catalogComponentId} busy={busy === "publish"}
          onClose={() => setPublishing(null)}
          onPublish={async (fields) => {
            const done = await run("publish", () => publishSnapshot(systemId, publishing.id, fields),
              `${publishing.name} published to the catalog`);
            if (done) {
              setPublishing(null);
              onTaken();
            }
          }} />
      )}

      {compare && (
        <div className="space-y-3 border p-3" aria-label="Snapshot comparison">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{items.find((s) => s.id === compare.snapshotId)?.name}</span>
            <span className="text-muted-foreground">compared with</span>
            <Select value={compare.against} onValueChange={(value) => setCompare({ ...compare, against: value })}>
              <SelectTrigger aria-label="Compare with" className="h-8 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={LIVE}>the live system</SelectItem>
                {items.map((s) => (s.id === compare.snapshotId ? null : <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setCompare(null)}>Close</Button>
          </div>
          {!shown ? (
            <p className="text-sm text-muted-foreground">Comparing…</p>
          ) : shown.boards.length === 0 && shown.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No differences.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {shown.boards.map((board) => (
                <p key={board.instanceId}>
                  <Badge variant="outline">{board.status}</Badge> <span className="font-medium">{board.label}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{shortSha(board.before)} → {shortSha(board.after)}</span>
                </p>
              ))}
              {shown.links.map((link) => (
                <div key={link.linkId} className="space-y-1">
                  <p><Badge variant="outline">{link.status}</Badge> <span className="font-medium">{link.name || "Unnamed link"}</span></p>
                  <ul className="space-y-0.5 pl-4 font-mono text-xs">
                    {link.rows.added.map((row) => <li key={`a-${row.id}`} className="text-success">+ {rowText(row)}</li>)}
                    {link.rows.removed.map((row) => <li key={`r-${row.id}`} className="text-destructive">− {rowText(row)}</li>)}
                    {link.rows.changed.map((row) => (
                      <li key={`c-${row.id}`} className="text-warning">
                        ~ {row.before.pinA ?? "—"} ↔ {row.before.pinB ?? "—"}: {rowChange(row.before, row.after)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AuditLog({ systemId, document, refresh }: { systemId: string; document: SystemDocument; refresh: string }) {
  const [page, setPage] = useState<{ refresh: string; events: AuditEvent[]; next: number | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const labels = new Map(document.instances.map((instance) => [instance.id, instance.label]));

  // The newest page is re-read whenever the system moves on; older pages load on demand.
  useEffect(() => {
    let cancelled = false;
    getHistory(systemId, null, 50)
      .then((body) => !cancelled && setPage({ refresh, events: body.events, next: body.nextCursor }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [systemId, refresh]);

  const more = async () => {
    if (!page?.next) return;
    setLoadingMore(true);
    try {
      const body = await getHistory(systemId, page.next, 50);
      setPage({ ...page, events: [...page.events, ...body.events], next: body.nextCursor });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Activity</h2>
      {!page ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <ul className="divide-y rounded-md border text-sm">
            {page.events.map((event) => (
              <li key={event.id} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2">
                <span>
                  <span className="font-medium">{event.kind.replace(/_/g, " ")}</span>{" "}
                  <span className="text-muted-foreground">{eventSummary(event, labels)}</span>
                </span>
                <span className="text-right text-xs text-muted-foreground">{new Date(event.at).toLocaleString()}</span>
                <span className="col-span-2 text-xs text-muted-foreground">
                  {event.actor === "system:detection" ? "Detection" : event.actor.replace(/^user:/, "")}
                </span>
              </li>
            ))}
          </ul>
          {page.next && (
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void more()}>
              {loadingMore ? "Loading…" : "Load older"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
