import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { SimSetup } from "../types";

import type { BoardIndex } from "./board-index";
import { pickItems, type Candidates, type Pick, type PickContext } from "./candidates";
import { filterItems, PickList, useListKeys } from "./pick-list";
import type { ElementKind } from "./power-tree-model";
import { ELEMENT_STYLE } from "./power-tree-nodes";

const PROMPT: Record<ElementKind, string> = {
    source: "Search connectors and batteries",
    rail: "Search power nets",
    converter: "Search regulators",
    load: "Search parts drawing from a rail",
};

/**
 * Add an element by picking it: the board's candidates for its kind (or
 * kinds, from a rail: its loads and converters), searchable, each placed
 * filled in. "Blank" adds an empty one to fill by hand.
 */
export function ElementPalette({ kinds, candidates, board, setup, context, style, className, onPick, onClose }: {
    kinds: ElementKind[];
    candidates: Candidates;
    board: BoardIndex | null;
    setup: SimSetup;
    context?: PickContext;
    style?: CSSProperties;
    className?: string;
    onPick: (pick: Pick) => void;
    onClose: () => void;
}) {
    const [kind, setKind] = useState(kinds[0]);
    const [query, setQuery] = useState("");
    const root = useRef<HTMLDivElement>(null);
    const items = useMemo(() => filterItems(pickItems(kind, candidates, board, setup, context), query), [kind, candidates, board, setup, context, query]);
    const keys = useListKeys(items.length, (index) => onPick(items[index].pick), onClose);
    useEffect(() => { keys.setActive(0); }, [kind, query]); // eslint-disable-line react-hooks/exhaustive-deps

    // A click outside closes it.
    useEffect(() => {
        const away = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) onClose(); };
        window.addEventListener("pointerdown", away, true);
        return () => window.removeEventListener("pointerdown", away, true);
    }, [onClose]);

    const label = ELEMENT_STYLE[kind].label.toLowerCase();
    return (
        <div ref={root} style={style} className={cn("nowheel nodrag nopan z-30 w-96 rounded-lg border bg-card p-2 text-card-foreground shadow-lg", className)}
            role="dialog" aria-label={`Add a ${label}`}>
            {kinds.length > 1 && (
                <div className="mb-2 flex gap-1">
                    {kinds.map((item) => {
                        const look = ELEMENT_STYLE[item];
                        return (
                            <button key={item} type="button" onClick={() => setKind(item)}
                                className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", item === kind ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}>
                                <look.icon className={cn("size-3.5", look.text)} aria-hidden /> {look.label}
                            </button>
                        );
                    })}
                </div>
            )}
            <Input autoFocus value={query} placeholder={PROMPT[kind]} className="h-8 text-xs" aria-label={PROMPT[kind]}
                onChange={(event) => setQuery(event.target.value)} onKeyDown={keys.onKeyDown} />
            <PickList items={items} active={keys.active} onActive={keys.setActive} onPick={(item) => onPick(item.pick)}
                className="mt-2 max-h-80 border-0 p-0 shadow-none" empty={`No ${label} matches "${query}".`} />
            <button type="button" onClick={() => onPick({ kind, ...(context?.rail ? (kind === "converter" ? { input_net: context.rail } : { rail_net: context.rail }) : {}) })}
                className="mt-1 flex w-full items-center gap-1.5 border-t px-2.5 pt-2 text-xs text-muted-foreground hover:text-foreground">
                <Plus className="size-3.5" aria-hidden /> Blank {label}, to fill in by hand
            </button>
        </div>
    );
}
