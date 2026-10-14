import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import type { PickItem } from "./candidates";

/** Rows a list shows at most; typing narrows the rest in. */
const LIMIT = 300;

/**
 * Rows matching `query`, groups kept in order: within a group, titles
 * starting with it first, then titles, values and reasons containing it.
 */
export function filterItems(items: PickItem[], query: string): PickItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, LIMIT);
    const groups = [...new Set(items.map((item) => item.group))];
    const rank = (item: PickItem) => {
        const title = item.title.toLowerCase();
        if (title.startsWith(q)) return 0;
        if (title.includes(q)) return 1;
        if ((item.meta ?? "").toLowerCase().includes(q)) return 2;
        if ((item.reason ?? "").toLowerCase().includes(q)) return 3;
        return -1;
    };
    return items
        .map((item) => ({ item, rank: rank(item) }))
        .filter((entry) => entry.rank >= 0)
        .sort((a, b) => groups.indexOf(a.item.group) - groups.indexOf(b.item.group) || a.rank - b.rank)
        .slice(0, LIMIT)
        .map((entry) => entry.item);
}

/** Arrow, Enter and Escape handling for an input driving a list; returns true when it took the key. */
export function useListKeys(count: number, onPick: (index: number) => void, onEscape: () => void) {
    const [active, setActive] = useState(0);
    useEffect(() => { setActive((index) => Math.min(index, Math.max(count - 1, 0))); }, [count]);
    const onKeyDown = (event: KeyboardEvent<HTMLElement>): boolean => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, count - 1)); return true; }
        if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); return true; }
        if (event.key === "Enter" && count > 0) { event.preventDefault(); onPick(active); return true; }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onEscape(); return true; }
        return false;
    };
    return { active, setActive, onKeyDown };
}

/**
 * Grouped rows: the part or net, its value or voltage, why it is offered,
 * and whether it is on the canvas already. `nowheel`: inside the canvas the
 * wheel would otherwise zoom it.
 */
export function PickList({ id, items, active, onActive, onPick, empty, className }: {
    id?: string;
    items: PickItem[];
    active: number;
    onActive: (index: number) => void;
    onPick: (item: PickItem) => void;
    empty?: string;
    className?: string;
}) {
    const list = useRef<HTMLUListElement>(null);
    useEffect(() => {
        list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);
    const rows = useMemo(() => items.map((item, index) => ({ item, index, header: index === 0 || items[index - 1].group !== item.group })), [items]);
    return (
        <ul ref={list} id={id} role="listbox"
            className={cn("nowheel themed-scrollbar max-h-72 overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md", className)}>
            {rows.length === 0 && <li className="px-2.5 py-2 text-xs text-muted-foreground">{empty ?? "Nothing matches."}</li>}
            {rows.map(({ item, index, header }) => (
                <li key={item.key} role="presentation">
                    {header && <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.group}</div>}
                    <div role="option" data-index={index} aria-selected={index === active}
                        className={cn("cursor-pointer px-2.5 py-1", index === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}
                        // Before an input's blur, so the click picks.
                        onMouseDown={(event) => { event.preventDefault(); onPick(item); }}
                        onMouseEnter={() => onActive(index)}>
                        <div className="flex items-baseline gap-2 text-xs">
                            <span className="shrink-0 font-mono font-medium">{item.title}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.meta}>{item.meta}</span>
                            {item.inTree && <span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">in tree</span>}
                        </div>
                        {item.reason && <div className="truncate text-[11px] text-muted-foreground" title={item.reason}>{item.reason}</div>}
                    </div>
                </li>
            ))}
        </ul>
    );
}
