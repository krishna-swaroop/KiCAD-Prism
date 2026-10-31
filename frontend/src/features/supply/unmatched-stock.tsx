import { useCallback, useState } from "react";
import { EyeOff, Link2, LibraryBig, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AsyncSearchPicker } from "@/components/workspace/async-search-picker";
import { listComponents } from "@/components/workspace/catalog-client";
import { CreateComponentDialog } from "@/components/workspace/create-component-dialog";
import type { CatalogComponent } from "@/types/catalog";
import type { InventorySource, InventoryUnmatchedPart } from "@/types/supply";
import { CollapsibleSection } from "./collapsible-section";
import { invalidateSupply, useLoaded } from "./use-loaded";
import { countUnmatchedParts, linkUnmatchedPart, listInventorySources, listUnmatchedParts, setUnmatchedIgnored, type UnmatchedGroup } from "./inventory-api";
import { SearchBox } from "./search-box";
import { clockTime } from "./supply-format";

const REASON: Record<InventoryUnmatchedPart["reason"], string> = {
  no_component: "No component",
  sap_code_shared: "SAP code on several components",
  mpn_shared: "MPN on several components",
};

// Some inventory servers list every part under this maker until it knows the real one; it is not worth copying into a new component.
const UNKNOWN_MAKER = "unknown manufacturer";

/** A part number as the backend's match key reads it: letters and digits, upper case. */
const numberKey = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Whether a stores item and a component are the same part: the same MPN, or the same SAP code. */
export function sameIdentity(part: Pick<InventoryUnmatchedPart, "mpn" | "ipn">, component: Pick<CatalogComponent, "mpn" | "sap_code">): boolean {
  const mpn = numberKey(part.mpn);
  return (mpn !== "" && mpn === numberKey(component.mpn)) || (part.ipn.trim() !== "" && part.ipn.trim() === (component.sap_code ?? "").trim());
}

/** When the source is read next (`clockTime`): "18:10" today, "tomorrow 06:10", "29 Oct 18:10" later. */
function nextRead(source: InventorySource): string {
  if (!source.last_sync_at) return "";
  const when = new Date(new Date(source.last_sync_at).getTime() + source.interval_hours * 3_600_000);
  return Number.isNaN(when.getTime()) ? "" : clockTime(when.toISOString());
}

/** The stores item next to the component it is about to be linked to, field by field. */
function LinkCheck({ part, component, busy, onCancel, onConfirm }: {
  part: InventoryUnmatchedPart; component: CatalogComponent; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const same = sameIdentity(part, component);
  const rows: Array<[string, string, string]> = [
    ["Name", part.name, component.name],
    ["Maker", part.manufacturer.trim().toLowerCase() === UNKNOWN_MAKER ? "" : part.manufacturer, component.manufacturer],
    ["MPN", part.mpn, component.mpn],
    ["SAP", part.ipn, component.sap_code ?? ""],
    ["Value", "", component.value],
  ];
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link stores item</DialogTitle>
          <DialogDescription className="sr-only">The stores item and the component, side by side</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="w-20 py-1 font-normal" /><th className="py-1 font-normal">Stores</th><th className="py-1 font-normal">Component</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(([label, left, right]) => {
              const differs = label === "MPN" || label === "SAP" ? Boolean(left && right && numberKey(left) !== numberKey(right)) : false;
              return (
                <tr key={label} className={differs ? "text-destructive" : undefined}>
                  <td className="py-1.5 text-xs text-muted-foreground">{label}</td>
                  <td className="max-w-64 truncate py-1.5" title={left}>{left || "-"}</td>
                  <td className="max-w-64 truncate py-1.5" title={right}>{right || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={same ? "default" : "destructive"} disabled={busy} onClick={onConfirm}>{same ? "Link" : "Link anyway"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Waiting {
  source: InventorySource;
  part: InventoryUnmatchedPart;
}

/** Rows asked for at a time, across every source. */
export const UNMATCHED_PAGE = 50;

const GROUPS: Array<{ key: UnmatchedGroup; label: string }> = [
  { key: "waiting", label: "Waiting" },
  { key: "no_component", label: REASON.no_component },
  { key: "sap_code_shared", label: REASON.sap_code_shared },
  { key: "mpn_shared", label: REASON.mpn_shared },
  { key: "linked", label: "Linked" },
  { key: "ignored", label: "Ignored" },
];

const EMPTY_COUNTS: Record<UnmatchedGroup, number> = { waiting: 0, no_component: 0, sap_code_shared: 0, mpn_shared: 0, linked: 0, ignored: 0 };

/** The first `shown` unmatched parts with stock across every source in `group`, waiting ones first and largest first, narrowed by
 * `query`; null until loaded. `counts` are each group's size across the sources, `more` whether any were left out. */
function useUnmatched(query: string, shown: number, group: UnmatchedGroup) {
  const fetcher = useCallback(async (signal: AbortSignal) => {
    // A source whose parts were all linked counts none unmatched, but its linked rows stay until the next read.
    const sources = await listInventorySources(signal);
    // One row past the page tells whether a source has more.
    const [lists, counted] = await Promise.all([
      Promise.all(sources.map(async (source) => (
        await listUnmatchedParts(source.id, signal, { q: query, limit: shown + 1, group })).map((part) => ({ source, part })))),
      Promise.all(sources.map((source) => countUnmatchedParts(source.id, signal))),
    ]);
    const counts = { ...EMPTY_COUNTS };
    for (const each of counted) for (const key of Object.keys(counts) as UnmatchedGroup[]) counts[key] += each[key] ?? 0;
    const all = lists.flat().sort((a, b) => Number(Boolean(a.part.linked_component_id)) - Number(Boolean(b.part.linked_component_id)) || b.part.quantity - a.part.quantity);
    return { items: all.slice(0, shown), counts, more: all.length > shown };
  }, [query, shown, group]);
  const loaded = useLoaded(`inventory/unmatched/${group}|${shown}|${query}`, fetcher, "Could not load the unmatched stock");
  return loaded.status === "error" ? { items: [], counts: EMPTY_COUNTS, more: false } : loaded.data;
}

const keyOf = (item: Waiting) => `${item.source.id}/${item.part.remote_part}`;

/** Supply > Review: stock a local inventory server holds for parts no component matched, by group. QA and admins link
 * them one at a time, or set many aside at once (and bring them back from Ignored). */
export function UnmatchedStockSection({ canDecide, onDecided }: { canDecide: boolean; onDecided?: () => void }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(UNMATCHED_PAGE);
  const [group, setGroup] = useState<UnmatchedGroup>("waiting");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = useUnmatched(query, shown, group);
  const total = state ? Object.values(state.counts).reduce((sum, count) => sum + count, 0) : 0;
  if (!state || (total === 0 && !query)) return null;
  const done = () => { setPicked(new Set()); void invalidateSupply("inventory"); onDecided?.(); };
  const shownKeys = state.items.map(keyOf);
  const pickedItems = state.items.filter((item) => picked.has(keyOf(item)));
  const restoring = group === "ignored";
  const toggle = (key: string) => setPicked((now) => {
    const next = new Set(now);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const choose = (next: UnmatchedGroup) => { setGroup(next); setShown(UNMATCHED_PAGE); setPicked(new Set()); };
  // Each source is asked for its own parts, so a selection across sources is one call per source.
  const apply = async () => {
    setBusy(true);
    try {
      const bySource = new Map<string, string[]>();
      for (const item of pickedItems) bySource.set(item.source.id, [...(bySource.get(item.source.id) ?? []), item.part.remote_part]);
      const results = await Promise.all([...bySource].map(([sourceId, parts]) => setUnmatchedIgnored(sourceId, parts, !restoring)));
      const changed = results.reduce((sum, result) => sum + result.changed, 0);
      toast.success(`${restoring ? "Restored" : "Ignored"} ${changed.toLocaleString()}`);
      setConfirming(false);
      done();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not change the parts");
    } finally {
      setBusy(false);
    }
  };
  return (
    <CollapsibleSection id="review-unmatched-stock" title="Unmatched local stock" count={state.counts.waiting}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div role="group" aria-label="Unmatched stock groups" className="flex flex-wrap gap-1">
          {GROUPS.map((item) => (
            <Button
              key={item.key} size="sm" variant={group === item.key ? "secondary" : "ghost"} aria-pressed={group === item.key}
              onClick={() => choose(item.key)}
            >
              {item.label}<span className="ml-1 tabular-nums text-muted-foreground">{state.counts[item.key].toLocaleString()}</span>
            </Button>
          ))}
        </div>
        <SearchBox
          initial={query} label="Search unmatched stock" placeholder="IPN, MPN, maker or name"
          onSearch={(text) => { setQuery(text); setShown(UNMATCHED_PAGE); setPicked(new Set()); }}
        />
      </div>
      {canDecide && group !== "linked" && state.items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-1.5 text-sm">
          <Checkbox
            aria-label="Select every row shown"
            checked={pickedItems.length > 0 && pickedItems.length === state.items.length ? true : pickedItems.length > 0 ? "indeterminate" : false}
            onCheckedChange={(on) => setPicked(on === true ? new Set(shownKeys) : new Set())}
          />
          <span className="tabular-nums text-muted-foreground">{pickedItems.length.toLocaleString()} selected</span>
          <Button size="sm" variant="outline" disabled={pickedItems.length === 0 || busy} onClick={() => (restoring ? void apply() : setConfirming(true))}>
            {restoring ? <Undo2 className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {restoring ? "Restore" : "Ignore"}
          </Button>
        </div>
      ) : null}
      <ul className="divide-y">
        {state.items.map((item) => (
          <UnmatchedRow
            key={keyOf(item)} source={item.source} part={item.part} canDecide={canDecide && !restoring} onLinked={done}
            select={canDecide && group !== "linked" ? { checked: picked.has(keyOf(item)), onToggle: () => toggle(keyOf(item)) } : null}
          />
        ))}
      </ul>
      {state.more ? (
        <div className="px-3 py-2">
          <Button size="sm" variant="outline" onClick={() => setShown((count) => count + UNMATCHED_PAGE)}>Load more</Button>
        </div>
      ) : null}
      {confirming ? (
        <Dialog open onOpenChange={(open) => { if (!open) setConfirming(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ignore {pickedItems.length.toLocaleString()} unmatched {pickedItems.length === 1 ? "part" : "parts"}</DialogTitle>
              <DialogDescription>{pickedItems.slice(0, 5).map((item) => item.part.name || item.part.mpn || item.part.remote_part).join(", ")}{pickedItems.length > 5 ? ` +${pickedItems.length - 5}` : ""}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button disabled={busy} onClick={() => void apply()}>Ignore</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </CollapsibleSection>
  );
}

function UnmatchedRow({ source, part, canDecide, onLinked, select }: {
  source: InventorySource; part: InventoryUnmatchedPart; canDecide: boolean; onLinked: () => void;
  select: { checked: boolean; onToggle: () => void } | null;
}) {
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<CatalogComponent | null>(null);
  const identity = [part.ipn && `SAP ${part.ipn}`, part.mpn].filter(Boolean).join(" · ");
  const linked = part.linked_component_id ? `Linked · ${part.linked_mpn || part.linked_name}${nextRead(source) ? ` · next read ${nextRead(source)}` : ""}` : "";

  const link = async (component: Pick<CatalogComponent, "id" | "name">) => {
    setBusy(true);
    try {
      const result = await linkUnmatchedPart(source.id, part.remote_part, component.id);
      if (result.status === "ok") toast.success(`Linked to ${component.name}`);
      else toast.warning(`Linked to ${component.name}`);
      setChecking(null);
      onLinked();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not link the part");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      {select ? <Checkbox aria-label={`Select ${part.name || part.mpn || part.remote_part}`} checked={select.checked} onCheckedChange={select.onToggle} /> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={part.name}>{part.name || part.mpn || `Part ${part.remote_part}`}</p>
        <p className="truncate text-xs text-muted-foreground">{[source.display_name, identity, linked ? "" : REASON[part.reason]].filter(Boolean).join(" · ")}</p>
        {linked ? <p className="truncate text-xs text-primary">{linked}</p> : null}
      </div>
      <span className="shrink-0 tabular-nums" title={`${part.records} stock records`}>{part.quantity.toLocaleString()}</span>
      {canDecide ? (
        <div className="flex shrink-0 gap-1.5">
          <AsyncSearchPicker<CatalogComponent>
            id={`link-${source.id}-${part.remote_part}`}
            open={picking}
            onOpenChange={setPicking}
            trigger={<Button size="sm" variant="outline" disabled={busy}><Link2 className="h-3.5 w-3.5" />Link</Button>}
            fetchPage={async (query, signal) => {
              const page = await listComponents(new URLSearchParams({ q: query, page_size: "20" }), signal);
              return { items: page.items, total: page.total };
            }}
            getKey={(component) => component.id}
            renderItem={(component) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{component.name}</span>
                <span className="truncate text-xs text-muted-foreground">{[component.manufacturer, component.mpn].filter(Boolean).join(" · ")}</span>
              </span>
            )}
            onSelect={(component) => { setPicking(false); setChecking(component); }}
            searchPlaceholder="Search the Component Database"
            listLabel="Components"
            emptyMessage="No component matches"
            suggestQuery={part.mpn || part.ipn}
          />
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAdding(true)} title="Add to Component Database">
            <LibraryBig className="h-3.5 w-3.5" />Add
          </Button>
        </div>
      ) : null}
      {checking ? <LinkCheck part={part} component={checking} busy={busy} onCancel={() => setChecking(null)} onConfirm={() => void link(checking)} /> : null}
      {adding ? (
        <CreateComponentDialog
          open
          onOpenChange={(next) => { if (!next) setAdding(false); }}
          initial={{
            manufacturer: part.manufacturer.trim().toLowerCase() === UNKNOWN_MAKER ? "" : part.manufacturer,
            manufacturerPartNumber: part.mpn,
            description: part.name,
          }}
          onCreated={(component) => void link(component)}
        />
      ) : null}
    </li>
  );
}
