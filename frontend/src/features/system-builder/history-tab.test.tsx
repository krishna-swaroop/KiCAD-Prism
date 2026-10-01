import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryTab, eventSummary, rowChange } from "./history-tab";
import { instance, systemDocument } from "./test-fixtures";
import type { AuditEvent } from "@/types/system";

afterEach(() => vi.unstubAllGlobals());

const obc = instance("OBC-A");
const doc = systemDocument([obc]);
const labels = new Map([[obc.id, "OBC-A"]]);
const event = (kind: string, payload: Record<string, unknown> | null, patch: Partial<AuditEvent> = {}): AuditEvent => ({
  seq: 1, id: `e-${kind}`, at: "2026-09-30T10:00:00Z", actor: "user:a@x", kind, payload, redacted: false, ...patch,
});

describe("history formatting", () => {
  it("summarises audit events", () => {
    expect(eventSummary(event("baseline_auto_advanced", { instanceId: obc.id, from: "1".repeat(40), to: "2".repeat(40) }), labels))
      .toBe("OBC-A 11111111 → 22222222");
    expect(eventSummary(event("review_applied", { kind: "import", created: 2, updated: 1 }), labels)).toBe("import review: 2 created, 1 updated");
    expect(eventSummary(event("rows_replaced", { rowCount: 4, added: ["x"], removed: [] }), labels)).toBe("4 rows (1 added, 0 removed)");
    expect(eventSummary(event("link_created", null, { redacted: true }), labels)).toBe("on a board you cannot see");
    expect(eventSummary(event("pose_updated", { instanceId: obc.id, before: null, after: { source: "manual" } }), labels))
      .toBe(`${obc.label} moved`);
    expect(eventSummary(event("pose_updated", { instanceId: obc.id, before: { source: "manual" }, after: null }), labels))
      .toBe(`${obc.label} back to its default position`);
    expect(eventSummary(event("poses_reset", { instanceIds: ["a", "b"], sources: ["manual"] }), labels))
      .toBe("2 boards back to the default layout");
  });

  it("describes only what changed in a row", () => {
    expect(rowChange(
      { pinA: "18", pinB: "18", signal: "IRQ", netA: ["PAYLOAD_IRQ#"], netB: ["/IRQ_OUT#"] },
      { pinA: "18", pinB: "18", signal: "IRQ", netA: ["PAYLOAD_INT#"], netB: ["/IRQ_OUT#"] },
    )).toBe("net A PAYLOAD_IRQ# → PAYLOAD_INT#");
  });
});

describe("HistoryTab", () => {
  it("takes a snapshot with If-Match, re-reads both lists, and compares against live", async () => {
    const calls: [string, RequestInit][] = [];
    let snapshots: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push([url, init]);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { "Content-Type": "application/json", ETag: '"sys:sys_1:3"' },
      });
      if (url.includes("/history")) return json({ events: [event("link_created", {})], nextCursor: null });
      if (url.includes("/diff")) {
        return json({ snapshotId: "ssn_1", against: "live", boards: [{ instanceId: obc.id, label: "OBC-A", status: "rebased", before: "a".repeat(40), after: "b".repeat(40) }],
          links: [] });
      }
      if (url.endsWith("/snapshots") && init.method === "POST") {
        snapshots = [{ id: "ssn_1", name: "CDR", note: "", createdBy: "user:a@x", createdAt: "2026-09-30T10:00:00Z",
          digest: "sha256:abcdef0123456789abcdef", openReviewCount: 1, rendererVersion: "1" }];
        return json(snapshots[0], 201);
      }
      if (url.endsWith("/snapshots")) return json(snapshots);
      return json({});
    }));
    render(<HistoryTab systemId="sys_1" document={doc} etag='"sys:sys_1:3"' canEdit user={null} reload={vi.fn(async () => undefined)} onNavigate={vi.fn()} />);
    expect(await screen.findByText("No snapshots yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Live ICD/ }).getAttribute("href")).toBe("/api/systems/sys_1/icd.html");

    fireEvent.click(screen.getByRole("button", { name: /Take snapshot/ }));
    fireEvent.change(await screen.findByLabelText("Snapshot name"), { target: { value: " CDR " } });
    fireEvent.click(screen.getByRole("button", { name: "Take snapshot" }));
    expect(await screen.findByText("1 unreviewed")).toBeTruthy();
    const post = calls.find(([url, init]) => url.endsWith("/snapshots") && init.method === "POST")!;
    expect(JSON.parse(String(post[1].body))).toEqual({ name: "CDR", note: "" });
    expect(new Headers(post[1].headers).get("If-Match")).toBe('"sys:sys_1:3"');
    await waitFor(() => expect(calls.filter(([url]) => url.includes("/history"))).toHaveLength(2));
    expect(screen.getByRole("link", { name: "ICD of CDR" }).getAttribute("href")).toBe("/api/systems/sys_1/snapshots/ssn_1/icd.html");

    fireEvent.click(screen.getByRole("button", { name: "Compare CDR" }));
    expect(await screen.findByText("rebased")).toBeTruthy();
    expect(calls.some(([url]) => url.endsWith("/snapshots/ssn_1/diff?against=live"))).toBe(true);
  });

  it("hides snapshot creation from viewers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("history") ? { events: [], nextCursor: null } : []), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));
    render(<HistoryTab systemId="sys_1" document={doc} etag="e" canEdit={false} user={null} reload={vi.fn()} onNavigate={vi.fn()} />);
    expect(await screen.findByText("No snapshots yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Take snapshot/ })).toBeNull();
  });
  it("offers the manifest only for snapshots that have one", async () => {
    const meta = { note: "", createdBy: "user:a@x", createdAt: "2026-09-30T10:00:00Z", digest: "sha256:abcdef0123456789abcdef",
      openReviewCount: 0, rendererVersion: "2" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/history") ? { events: [], nextCursor: null }
        : [{ ...meta, id: "ssn_new", name: "CDR", manifestSchema: "prism.system_manifest.v1", connectivityDigest: "sha256:c" },
          { ...meta, id: "ssn_old", name: "PDR", manifestSchema: null, connectivityDigest: null }];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<HistoryTab systemId="sys_1" document={doc} etag="e" canEdit={false} user={null} reload={vi.fn()} onNavigate={vi.fn()} />);
    const link = await screen.findByRole("link", { name: "Manifest of CDR" });
    expect(link.getAttribute("href")).toBe("/api/systems/sys_1/snapshots/ssn_new/manifest");
    expect(link.getAttribute("download")).toBe("CDR.manifest.json");
    expect(screen.queryByRole("link", { name: "Manifest of PDR" })).toBeNull();
  });
  it("publishes a snapshot, asking for the IPN on the first publish, and badges published ones", async () => {
    const meta = { note: "", createdBy: "user:a@x", createdAt: "2026-09-30T10:00:00Z", digest: "sha256:abcdef0123456789abcdef",
      openReviewCount: 0, rendererVersion: "2", manifestSchema: "prism.system_manifest.v1", connectivityDigest: "sha256:c" };
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push([url, init]);
      const body = url.includes("/history") ? { events: [], nextCursor: null }
        : url.endsWith("/publish") ? { componentId: "cmp_1", revisionId: "rev_1", version: 1, releaseStatus: "open" }
          : [{ ...meta, id: "ssn_cdr", name: "CDR", publication: null },
            { ...meta, id: "ssn_pdr", name: "PDR", publication: { componentId: "cmp_1", revisionId: "rev_0", version: 1, releaseStatus: "released" } }];
      return new Response(JSON.stringify(body), { status: url.endsWith("/publish") ? 201 : 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<HistoryTab systemId="sys_1" document={doc} etag="e" canEdit user={{ role: "designer" } as never} reload={vi.fn(async () => undefined)} onNavigate={vi.fn()} />);
    const badge = await screen.findByRole("link", { name: /Catalog v1 · released/ });
    expect(badge.getAttribute("href")).toBe("/?section=library-manager&component=cmp_1");
    expect(screen.queryByRole("button", { name: "Publish PDR" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publish CDR" }));
    const publish = await screen.findByRole("button", { name: "Publish" });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Internal part number"), { target: { value: "IPN-7" } });
    fireEvent.click(publish);
    await waitFor(() => expect(calls.some(([url]) => url.endsWith("/publish"))).toBe(true));
    const [, init] = calls.find(([url]) => url.endsWith("/publish"))!;
    expect(JSON.parse(String(init.body))).toEqual({ ipn: "IPN-7", name: "Stack" });
  });

  it("hides publishing from designers without catalog write access", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/history") ? { events: [], nextCursor: null }
      : [{ id: "ssn_cdr", name: "CDR", note: "", createdBy: "u", createdAt: "2026-09-30T10:00:00Z", digest: "sha256:abcdef0123456789abcdef",
        openReviewCount: 0, rendererVersion: "2", manifestSchema: "prism.system_manifest.v1", publication: null }]),
    { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<HistoryTab systemId="sys_1" document={doc} etag="e" canEdit user={{ role: "qa" } as never} reload={vi.fn()} onNavigate={vi.fn()} />);
    await screen.findByText("CDR");
    expect(screen.queryByRole("button", { name: "Publish CDR" })).toBeNull();
  });
  it("links the all-levels ICD only when the system has subsystems", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/history") ? { events: [], nextCursor: null } : []),
      { status: 200, headers: { "Content-Type": "application/json" } })));
    const withChild = systemDocument([obc, instance("CNDH", { kind: "assembly" })]);
    const { unmount } = render(<HistoryTab systemId="sys_1" document={withChild} etag="e" canEdit={false} user={null} reload={vi.fn()} onNavigate={vi.fn()} />);
    expect((await screen.findByRole("link", { name: /All levels/ })).getAttribute("href")).toBe("/api/systems/sys_1/icd.html?depth=all");
    unmount();
    render(<HistoryTab systemId="sys_1" document={doc} etag="e" canEdit={false} user={null} reload={vi.fn()} onNavigate={vi.fn()} />);
    await screen.findByText("No snapshots yet.");
    expect(screen.queryByRole("link", { name: /All levels/ })).toBeNull();
  });
});
