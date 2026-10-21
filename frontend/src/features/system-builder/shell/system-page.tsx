/**
 * `/system/:systemId`: one system's editor (ADR §2.7, CONTRACTS §14). A row
 * of tabs over one or two panes side by side, with selection shared between
 * them: the schematic (root and board sheets), 3D, Review, ICD / Outputs, and
 * one tab per opened B2B mate. Harness tabs follow in stage 4.
 *
 * The open tab, the pane beside it and the open B2B tabs live in the URL
 * (`?tab=…&beside=…&b2b=…`), so a link reopens the same view.
 */
import "../system-builder.css";

import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useWorkspaceData, workspaceSessionKey } from "@/hooks/use-workspace-data";
import { canManageProjects } from "@/lib/roles";
import type { User } from "@/types/auth";

import type { SystemDocument, SystemOp } from "../model/types";
import { useScriptApi } from "../agent/use-script-api";
import { BoardSheetCanvas, type BoardSheetHandle } from "../board/board-sheet-canvas";
import { readUnfolded, writeUnfolded } from "../board/unfolded-store";
import { ReviewPane } from "../review/review-pane";
import { addBoardOps, nextSlotOp, type NewBoard } from "../schematic/edits";
import { AddBodyDialog } from "../three-d/add-body-dialog";
import { addEntryOps } from "../three-d/body-edits";
import type { PartHit } from "../three-d/part-search";
import { RootSheetCanvas, type RootSheetHandle, type Tool } from "../schematic/root-sheet-canvas";
import { buildScene } from "../schematic/scene";
import { SelectionPanel } from "../schematic/selection-panel";
import { useSystemSession } from "../session/use-system-session";
import { B2bPane } from "../b2b/b2b-pane";
import { HarnessPane } from "../harness/harness-pane";
import { mateTitle } from "../b2b/mate-view";
import { OutputsPane } from "../outputs/outputs-pane";
import { ThreeDPane } from "../three-d/three-d-pane";
import { AddBoardDialog } from "./add-board-dialog";
import { HeaderDialogs, type HeaderDialog } from "./header-dialogs";
import { SystemHeader } from "./system-header";
import { TABS, TAB_LABEL, harnessOfTab, mateOfTab, useSystemView, type FixedTab, type TabId } from "./system-view";
import { BoardToolPalette, RootToolPalette } from "./tool-palette";
import { ViewTabs } from "./view-tabs";

/**
 * A finding's objects as the root sheet can show them: a harness's links,
 * wires and other contents are drawn as their block (ends are drawn).
 */
export function drawnSelection(document: SystemDocument, ids: ReadonlySet<string>): Set<string> {
  const out = new Set(ids);
  for (const harness of document.harnesses) {
    const inside = [harness.links, harness.wires, harness.splices, harness.cables, harness.markers].some((items) => items.some((item) => ids.has(item.id)));
    if (inside) out.add(harness.id);
  }
  return out;
}

/** Run an undo or redo, reporting a refusal. */
const run = (work: Promise<unknown> | undefined) =>
  void work?.catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));

/** A tab's label in the row: a fixed tab's, or the opened mate's or harness's name. */
function tabTitle(document: SystemDocument | undefined, id: TabId): string {
  const mate = mateOfTab(id);
  if (mate) return `B2B ${document ? mateTitle(document, mate) : mate}`;
  const harness = harnessOfTab(id);
  if (harness) return document?.harnesses.find((item) => item.id === harness)?.label ?? harness;
  return TAB_LABEL[id as FixedTab];
}

export function SystemPage({ user }: { user: User | null }) {
  const { systemId = "" } = useParams();
  const navigate = useNavigate();
  const view = useSystemView();
  const { openMates, openHarnesses, tab, beside, sheet, setView, openMate, openHarness, openRoute } = view;
  const { session, state } = useSystemSession(systemId, user?.email ?? "");
  const { projects } = useWorkspaceData({ sessionKey: workspaceSessionKey(user) });
  const projectList = useMemo(() => projects.map((project) => ({ id: project.id, name: project.display_name || project.name })), [projects]);
  const projectNames = useMemo(() => Object.fromEntries(projectList.map((project) => [project.id, project.name])), [projectList]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tool, setTool] = useState<Tool>("select");
  const canvas = useRef<RootSheetHandle>(null);
  const boardCanvas = useRef<BoardSheetHandle>(null);
  const [addingBoard, setAddingBoard] = useState(false);
  const [placingSystem, setPlacingSystem] = useState(false);
  // The header's dialogs (§15.4).
  const [headerDialog, setHeaderDialog] = useState<HeaderDialog | null>(null);
  // The B2B tab's selected row, lit on both boards in the 3D tab.
  const [lit, setLit] = useState<{ key: string; members: { occurrence: string; net: string }[]; parts: { occurrence: string; reference: string }[] } | null>(null);
  // Unfolded connectors per board: per user and system, in browser storage (§14.1).
  const [unfoldedMap, setUnfoldedMap] = useState<Record<string, Set<string>>>({});
  const unfoldedFor = (occurrence: string) => unfoldedMap[occurrence] ?? readUnfolded(systemId, occurrence);
  const setUnfoldedFor = (occurrence: string, next: Set<string>) => {
    writeUnfolded(systemId, occurrence, next);
    setUnfoldedMap((current) => ({ ...current, [occurrence]: next }));
  };

  const record = state.record;
  const document = record?.document;
  const canEdit = canManageProjects(user?.role) && Boolean(record);
  const findings = state.bundle?.findings ?? [];
  const openFindings = findings.filter((finding) => !finding.waived && finding.severity !== "info").length;

  const apply = (ops: SystemOp[]) => {
    if (!session) return Promise.reject(new Error("The system is not loaded yet"));
    return session.apply(ops);
  };

  useScriptApi(session, state, {
    open: (occurrence) => openSheet(occurrence),
    select: (ids) => setSelected(new Set(ids)),
    unfold: (occurrence, connector, unfolded) => {
      const next = new Set(unfoldedFor(occurrence));
      if (unfolded) next.add(connector);
      else next.delete(connector);
      setUnfoldedFor(occurrence, next);
    },
    isUnfolded: (occurrence, connector) => unfoldedFor(occurrence).has(connector),
    openMate: (mate) => openMate(mate),
    openHarness: (harness) => openHarness(harness),
  });

  useHotkeys([
    { combo: "mod+z", handler: () => run(session?.undo()) },
    { combo: "mod+shift+z", handler: () => run(session?.redo()) },
  ], { enabled: canEdit });

  const openSheet = (occurrence: string | null) => {
    view.openSheet(occurrence);
    if (occurrence) setSelected(new Set());
  };
  const closeTab = (id: TabId) => {
    view.closeTab(id);
    if (mateOfTab(id)) setLit(null);
  };

  const addBoard = async (board: NewBoard) => {
    if (!document) return;
    const scene = buildScene(document, state.bundle, { projectNames });
    const { ops, occurrence } = addBoardOps(document, scene, board);
    await apply(ops);
    setAddingBoard(false);
    setSelected(new Set([occurrence]));
    // After the new document has drawn, so the fit includes the new board.
    requestAnimationFrame(() => canvas.current?.fit());
  };

  const placeSystem = async (system: PartHit) => {
    if (!document) return;
    const scene = buildScene(document, state.bundle, { projectNames });
    const { ops, occurrence } = addEntryOps(document, system);
    await apply([...ops, nextSlotOp(scene, occurrence)]);
    setPlacingSystem(false);
    setSelected(new Set([occurrence]));
    requestAnimationFrame(() => canvas.current?.fit());
  };

  if (state.loadError) {
    return (
      <div className="flex h-app-viewport flex-col items-center justify-center gap-3 bg-background text-sm">
        <p className="text-destructive">{state.loadError}</p>
        <Button variant="outline" onClick={() => navigate("/")}>Back to the workspace</Button>
      </div>
    );
  }

  const single = selected.size === 1 ? [...selected][0] : null;
  const pane = (id: TabId) => {
    if (!document) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;
    const sheetOccurrence = sheet ? document.occurrences.find((item) => item.id === sheet) : undefined;
    if (id === "schematic" && sheetOccurrence) {
      return (
        <div className="relative flex h-full flex-col">
          <div className="sb-docs flex h-8 shrink-0 items-center gap-1.5 border-b border-[#9a9aa0] bg-[#fbfbf9] px-3 text-xs text-[#6b6b70]">
            <button type="button" className="hover:underline" onClick={() => openSheet(null)}>{record?.name ?? "Root"}</button>
            <span>›</span>
            <span className="font-medium text-[#1d1d1f]">{sheetOccurrence.label}</span>
            <span className="ml-2 text-[#6b6b70]">Alt/⌥+Backspace to leave</span>
          </div>
          <div className="relative min-h-0 flex-1">
            <BoardSheetCanvas
              ref={boardCanvas}
              key={sheetOccurrence.id}
              unfolded={unfoldedFor(sheetOccurrence.id)}
              onUnfoldedChange={(next) => setUnfoldedFor(sheetOccurrence.id, next)}
              document={document}
              bundle={state.bundle}
              occurrence={sheetOccurrence.id}
              canEdit={canEdit}
              apply={apply}
              onLeave={() => openSheet(null)}
              systemName={record?.name ?? document.name}
              version={record?.version}
              bundleKey={state.bundleAnswer?.key}
            />
            <BoardToolPalette onUp={() => openSheet(null)} onFit={() => boardCanvas.current?.fit()} />
          </div>
        </div>
      );
    }
    if (id === "schematic") {
      return (
        <div className="relative h-full">
          <RootSheetCanvas
            document={document}
            bundle={state.bundle}
            projectNames={projectNames}
            selected={selected}
            onSelect={setSelected}
            canEdit={canEdit}
            apply={apply}
            tool={tool}
            onToolChange={setTool}
            ref={canvas}
            onEnter={(occurrence) => openSheet(occurrence)}
            onOpenHarness={openHarness}
            systemName={record?.name ?? document.name}
            version={record?.version}
            bundleKey={state.bundleAnswer?.key}
          />
          {single && (
            <div className="absolute right-3 top-3 z-20">
              <SelectionPanel key={`${single}:${record?.version}`} document={document} bundle={state.bundle} id={single} canEdit={canEdit} apply={apply} onRemoved={() => setSelected(new Set())} projectNames={projectNames} onOpenMate={openMate} onOpenHarness={openHarness} />
            </div>
          )}
          <RootToolPalette tool={tool} canEdit={canEdit} onTool={setTool} onAddBoard={() => setAddingBoard(true)} onPlaceSystem={() => setPlacingSystem(true)} onFit={() => canvas.current?.fit()} />
        </div>
      );
    }
    const harness = harnessOfTab(id);
    if (harness) {
      return (
        <HarnessPane
          key={harness}
          document={document}
          bundle={state.bundle ?? null}
          systemId={systemId}
          harness={harness}
          canEdit={canEdit}
          busy={state.saving}
          apply={apply}
          selected={selected}
          onSelect={setSelected}
          onRouteIn3D={() => { openRoute(harness); setSelected(new Set([harness])); }}
        />
      );
    }
    const mate = mateOfTab(id);
    if (mate) {
      return (
        <B2bPane
          key={mate}
          document={document}
          bundle={state.bundle ?? null}
          mate={mate}
          canEdit={canEdit}
          busy={state.saving}
          apply={apply}
          onRow={(row, view) => {
            if (!row) return setLit(null);
            const members = [
              ...(row.aNet ? [{ occurrence: view.a.occurrence, net: row.aNet }] : []),
              ...(row.bNet ? [{ occurrence: view.b.occurrence, net: row.bNet }] : []),
            ];
            setLit({ key: `b2b:${mate}:${row.aPad ?? ""}:${row.bPad ?? ""}`, members, parts: [{ occurrence: view.a.occurrence, reference: view.a.connector }, { occurrence: view.b.occurrence, reference: view.b.connector }] });
          }}
        />
      );
    }
    if (id === "review") {
      return (
        <ReviewPane
          document={document}
          answer={state.bundleAnswer}
          findings={findings}
          stale={state.bundleStale}
          canEdit={canEdit}
          apply={apply}
          onSelect={(ids) => {
            setSelected(drawnSelection(document, ids));
            if (tab !== "schematic" && beside !== "schematic") setView({ beside: "schematic" });
          }}
        />
      );
    }
    if (id === "outputs") {
      return <OutputsPane systemId={systemId} document={document} name={record?.name ?? document.name} />;
    }
    return (
      <ThreeDPane
        document={document}
        bundle={state.bundle ?? null}
        projectNames={projectNames}
        selected={selected}
        onSelect={setSelected}
        canEdit={canEdit}
        busy={state.saving}
        apply={apply}
        lit={lit}
        onOpenMate={openMate}
        onOpenHarness={openHarness}
      />
    );
  };

  return (
    <div className="flex h-app-viewport flex-col bg-background text-foreground">
      <SystemHeader
        name={record?.name}
        folderId={record?.folderId}
        version={record?.version}
        state={state}
        canEdit={canEdit}
        onUndo={() => run(session?.undo())}
        onRedo={() => run(session?.redo())}
        onOutputs={() => setView({ tab: "outputs" })}
        onSnapshot={record ? () => setHeaderDialog("snapshot") : undefined}
        onCommitGit={record ? () => setHeaderDialog("git") : undefined}
        onPublish={() => setHeaderDialog("publish")}
      />
      <ViewTabs
        tabs={[...TABS, ...openMates.map((mate) => `b2b:${mate}` as TabId), ...openHarnesses.map((item) => `harness:${item}` as TabId)].map((id) => ({
          id,
          label: tabTitle(document, id),
          closable: Boolean(mateOfTab(id) || harnessOfTab(id)),
          ...(mateOfTab(id) ? { swatch: "bg-zinc-400" } : harnessOfTab(id) ? { swatch: "bg-amber-500" } : {}),
          count: id === "review" ? openFindings : 0,
        }))}
        tab={tab}
        beside={beside}
        besideLabel={beside ? tabTitle(document, beside) : null}
        onPick={(id) => setView({ tab: id as TabId, beside: beside === id ? null : beside })}
        onClose={(id) => closeTab(id as TabId)}
        onCloseBeside={() => setView({ beside: null })}
        onSideBySide={() => setView({ beside: TABS.find((id) => id !== tab && id !== "3d") ?? null })}
      />
      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1" aria-label={tabTitle(document, tab)}>{pane(tab)}</section>
        {beside && (
          <section className="min-w-0 flex-1 border-l" aria-label={tabTitle(document, beside)}>{pane(beside)}</section>
        )}
      </main>
      {addingBoard && (
        <AddBoardDialog
          projects={projects}
          existingLabels={document?.occurrences.map((item) => item.label) ?? []}
          onClose={() => setAddingBoard(false)}
          onAdd={addBoard}
        />
      )}
      {placingSystem && <AddBodyDialog adding="entry" onClose={() => setPlacingSystem(false)} onAdd={placeSystem} />}
      <HeaderDialogs
        open={headerDialog}
        state={state}
        projects={projectList}
        onClose={() => setHeaderDialog(null)}
        onImported={() => run(session?.reload())}
      />
    </div>
  );
}
