import { useState } from "react";
import { Cable, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import type { SystemBundle, SystemDocument, SystemOp } from "../model/types";
import { removeOps, renameOps } from "./edits";
import { connectorRows } from "./selection-rows";

interface Props {
  document: SystemDocument;
  bundle?: SystemBundle;
  id: string;
  canEdit: boolean;
  apply: (ops: SystemOp[]) => Promise<unknown>;
  onRemoved: () => void;
  projectNames?: Record<string, string>;
  /** Open a mate's B2B tab. */
  onOpenMate?: (mate: string) => void;
  onOpenHarness?: (harness: string) => void;
}

const KICKERS = { board: "BOARD", body: "BODY", entry: "SYSTEM" } as const;

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-[5px] text-[11.5px]">
      <span style={{ color: "var(--sb-muted)" }}>{label}</span>
      <span className={`truncate text-right ${warn ? "font-semibold" : ""}`} style={warn ? { color: "var(--sb-warning)" } : undefined} title={value}>{value}</span>
    </div>
  );
}

/** Facts and the few edits for one selected object (label, remove). Keyed by id, so each selection starts fresh. */
export function SelectionPanel({ document, bundle, id, canEdit, apply, onRemoved, projectNames, onOpenMate, onOpenHarness }: Props) {
  const occurrence = document.occurrences.find((item) => item.id === id);
  const harness = document.harnesses.find((item) => item.id === id);
  const mate = document.mates.find((item) => item.id === id);
  const endHarness = document.harnesses.find((item) => item.ends.some((end) => end.id === id));
  const end = endHarness?.ends.find((item) => item.id === id);
  const label = occurrence?.label ?? harness?.label;
  const [draft, setDraft] = useState(label ?? "");
  const labelOf = (occurrenceId: string) => document.occurrences.find((item) => item.id === occurrenceId)?.label ?? occurrenceId;

  const send = async (ops: SystemOp[]) => {
    try {
      await apply(ops);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  const rename = () => {
    const next = draft.trim();
    if (!next || next === label) return;
    void send(renameOps(document, id, next));
  };

  let title = "Selection";
  let kicker = "SELECT";
  let source = "";
  const facts: [string, string][] = [];
  if (occurrence) {
    title = occurrence.label;
    kicker = KICKERS[occurrence.source.kind as keyof typeof KICKERS] ?? "OCCURRENCE";
    if (occurrence.source.kind === "board") {
      const board = occurrence.source;
      const project = projectNames?.[board.projectId] ?? board.projectId;
      source = board.track.kind === "followed" ? `${project} · follows ${board.track.branch} @ ${board.track.commit.slice(0, 7)}` : `${project} · pinned @ ${board.track.commit.slice(0, 7)}`;
      facts.push(board.track.kind === "followed" ? ["Follows", `${board.track.branch} @ ${board.track.commit.slice(0, 7)}`] : ["Pinned", board.track.commit.slice(0, 7)]);
    } else {
      source = occurrence.source.kind === "entry" ? "published system" : "mechanical part";
    }
  } else if (harness) {
    title = harness.label;
    kicker = "HARNESS";
    source = `${harness.ends.length} ${harness.ends.length === 1 ? "end" : "ends"} · ${harness.links.length} ${harness.links.length === 1 ? "link" : "links"}`;
    facts.push(["Ends", String(harness.ends.length)], ["Links", String(harness.links.length)]);
  } else if (mate) {
    title = "Board-to-board mate";
    kicker = "MATE";
    facts.push(["A", `${labelOf(mate.a.occurrence)}.${mate.a.connector}`], ["B", `${labelOf(mate.b.occurrence)}.${mate.b.connector}`]);
    facts.push(["Orientation", `${mate.orientation.quarterTurns * 90}°${mate.orientation.flip ? ", flipped" : ""}`]);
  } else if (end && endHarness) {
    title = "Harness end";
    kicker = "END";
    facts.push(["Harness", endHarness.label]);
    if (end.site) facts.push(["Site", `${labelOf(end.site.occurrence)}.${end.site.connector}`]);
  } else {
    return null;
  }

  const connectors = occurrence ? connectorRows(document, bundle, occurrence.id) : [];
  return (
    <div className="sb-docs sb-card w-72 text-[12px]" onPointerDown={(event) => event.stopPropagation()}>
      <div className="sb-band flex items-baseline justify-between gap-2 px-3 pb-1.5 pt-2.5">
        <span className="sb-docs-display truncate text-[16px]">{title}</span>
        <span className="shrink-0 text-[9px] tracking-[0.08em]" style={{ color: "var(--sb-muted)" }}>{kicker}</span>
      </div>
      {source && (
        <div className="truncate px-3 py-1.5 text-[10.5px]" style={{ color: "var(--sb-muted)", borderBottom: "1px solid var(--sb-ink)" }} title={source}>{source}</div>
      )}
      {label !== undefined && (
        <div className="px-3 pt-2">
          <Input
            value={draft}
            disabled={!canEdit}
            aria-label="Label"
            className="h-7 rounded-none border-[#1d1d1f] bg-white px-2 text-[12px] text-[#1d1d1f] focus-visible:border-[#1d1d1f] focus-visible:ring-0"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === "Enter") rename();
              event.stopPropagation();
            }}
          />
        </div>
      )}
      <div className="sb-striped mt-2" style={{ borderTop: "0.6px solid var(--sb-rule)" }}>
        {facts.map(([key, value]) => <Row key={key} label={key} value={value} />)}
      </div>
      {connectors.length > 0 && (
        <div style={{ borderTop: "1px solid var(--sb-ink)" }}>
          <div className="flex items-baseline justify-between px-3 py-[5px] text-[10px]" style={{ color: "var(--sb-muted)" }}>
            <span>Connectors</span>
            <span>{connectors.length}</span>
          </div>
          <div className="sb-striped max-h-48 overflow-y-auto">
            {connectors.map((connector) => (
              <div
                key={connector.refdes}
                className="grid grid-cols-[3.2rem_minmax(0,1fr)_1.6rem_4.4rem] items-baseline gap-1 px-3 py-[4px] text-[10.5px]"
                title={`${connector.refdes} · ${connector.value} · ${connector.pins ?? "?"} pins · ${connector.linkedTo}`}
              >
                <span className="truncate font-semibold">{connector.refdes}</span>
                <span className="truncate" style={{ color: "var(--sb-muted)" }}>{connector.value}</span>
                <span className="text-right" style={{ color: "var(--sb-muted)" }}>{connector.pins ?? "—"}</span>
                <span className="truncate text-right" style={{ color: connector.linkedTo === "—" ? "var(--sb-muted)" : "var(--sb-ink)" }}>{connector.linkedTo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 px-3 py-2.5" style={{ borderTop: "0.6px solid var(--sb-rule)" }}>
        {mate && onOpenMate && (
          <button type="button" className="sb-ink-button inline-flex items-center gap-1 px-2 py-1 text-[11px]" onClick={() => onOpenMate(mate.id)}>
            <Unplug className="h-3 w-3" /> Open B2B tab
          </button>
        )}
        {(harness ?? endHarness) && onOpenHarness && (
          <button type="button" className="sb-ink-button inline-flex items-center gap-1 px-2 py-1 text-[11px]" onClick={() => onOpenHarness((harness ?? endHarness)!.id)}>
            <Cable className="h-3 w-3" /> Open harness tab
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="sb-ghost-button inline-flex items-center gap-1 px-2 py-1 text-[11px]"
            onClick={async () => {
              if (await send(removeOps(document, [id]))) onRemoved();
            }}
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
