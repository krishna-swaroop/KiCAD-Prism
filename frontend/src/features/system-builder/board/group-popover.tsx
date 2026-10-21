import { useState } from "react";

import { Input } from "@/components/ui/input";

import type { BundlePin } from "../model/types";
import { proposeGroup } from "./grouping";

interface Props {
  connector: string;
  /** The selected pads, in the order they will be stored. */
  pins: Pick<BundlePin, "pad" | "net">[];
  refusal: (name: string) => string | null;
  onGroup: (name: string, fold: boolean) => void;
  onCancel: () => void;
}

/**
 * G (§14.3): name the selected wires as a sub-port. The name and members are
 * proposed from the nets; the name is editable. Mounted per selection.
 */
export function GroupPopover({ connector, pins, refusal, onGroup, onCancel }: Props) {
  const proposed = proposeGroup(pins);
  const [name, setName] = useState(proposed.name);
  const problem = refusal(name);
  const submit = (fold: boolean) => {
    if (!problem) onGroup(name.trim(), fold);
  };
  return (
    <dialog
      open
      className="sb-docs sb-card static m-0 block w-80 p-0 text-[12px]"
      aria-label="Group as a sub-port"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className="sb-band flex items-baseline justify-between px-3 py-2">
        <span className="sb-docs-display truncate text-[15px]">Group {pins.length} {pins.length === 1 ? "wire" : "wires"} on {connector}</span>
        <kbd className="border border-[#1d1d1f] px-1 text-[10px]">G</kbd>
      </div>
      <div className="space-y-2 p-3">
        <Input
          autoFocus
          value={name}
          aria-label="Sub-port name"
          className="h-7 rounded-none border-[#1d1d1f] bg-white px-2 text-[12px] text-[#1d1d1f] dark:bg-white focus-visible:border-[#1d1d1f] focus-visible:ring-0"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit(event.shiftKey);
          }}
        />
        <div className="sb-striped max-h-32 overflow-y-auto text-[10.5px]" style={{ borderTop: "0.6px solid var(--sb-rule)", borderBottom: "0.6px solid var(--sb-rule)" }}>
          {pins.map((pin, index) => (
            <div key={pin.pad} className="px-1 py-0.5">
              {pin.pad} · {pin.net ?? "no net"} → <span className="text-[#0284c7]">{proposed.members[index]}</span>
            </div>
          ))}
        </div>
        <div className="text-[10.5px]" style={{ color: "var(--sb-muted)" }}>
          {name.trim() || "…"}{`{${proposed.members.join(" ")}}`}
        </div>
        {problem && <p className="text-[11px]" role="alert" style={{ color: "var(--sb-warning)" }}>{problem}</p>}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="sb-ink-button px-2 py-1 text-[11px]" onClick={() => submit(false)} disabled={Boolean(problem)}>Group ↵</button>
          <button type="button" className="sb-ghost-button px-2 py-1 text-[11px]" onClick={() => submit(true)} disabled={Boolean(problem)} title="Shift+Enter">Group and fold</button>
          <button type="button" className="sb-ghost-button px-2 py-1 text-[11px]" onClick={onCancel}>Esc</button>
        </div>
      </div>
    </dialog>
  );
}
