import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { useHotkeys } from "@/hooks/use-hotkeys";
import {
    DESIGN_SEARCH_HINT,
    searchDesignEntities,
    VISUALIZER_DESIGN_SEARCH_SLOT_ID,
    type DesignSearchHit,
} from "@/lib/design-search";
import { shortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { PrismSemanticIndex } from "@/types/prism-selection";

type DesignSearchFieldProps = {
    semanticIndex: PrismSemanticIndex | null;
    currentPage?: string | null;
    loading?: boolean;
    active?: boolean;
    onPick: (hit: DesignSearchHit) => void;
};

function ShortcutCaps({ combo }: { combo: string }) {
    return (
        <span className="flex items-center gap-0.5">
            {shortcutKeys(combo).map((key) => (
                <kbd
                    key={key}
                    className="inline-flex h-5 min-w-[1.25rem] items-center justify-center border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground"
                >
                    {key}
                </kbd>
            ))}
        </span>
    );
}

/** Scroll only the list, not the page, when the highlight moves off-screen. */
function scrollListChildIntoView(list: HTMLElement, child: HTMLElement) {
    const listRect = list.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    if (childRect.bottom > listRect.bottom) {
        list.scrollTop += childRect.bottom - listRect.bottom;
    } else if (childRect.top < listRect.top) {
        list.scrollTop -= listRect.top - childRect.top;
    }
}

export function DesignSearchField({
    semanticIndex,
    currentPage,
    loading = false,
    active = true,
    onPick,
}: DesignSearchFieldProps) {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const hits = useMemo(
        () => searchDesignEntities(semanticIndex, query, { currentPage }),
        [currentPage, query, semanticIndex],
    );
    const activeHit = hits[activeIndex];
    const activeOptionId = activeHit ? `${listId}-opt-${activeIndex}` : undefined;

    useLayoutEffect(() => {
        if (!active) {
            setSlot(null);
            setOpen(false);
            return;
        }
        setSlot(document.getElementById(VISUALIZER_DESIGN_SEARCH_SLOT_ID));
    }, [active]);

    const focusSearch = useCallback((event?: KeyboardEvent) => {
        event?.stopPropagation();
        setOpen(true);
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.select();
    }, []);

    useHotkeys(
        [
            { combo: "/", handler: focusSearch },
            { combo: "mod+f", handler: focusSearch, allowInInputs: true },
        ],
        { enabled: active, capture: true },
    );

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (rootRef.current?.contains(event.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    useEffect(() => {
        setActiveIndex(0);
    }, [hits]);

    useLayoutEffect(() => {
        if (!open) return;
        const list = listRef.current;
        const activeRow = list?.querySelector("[data-active='true']");
        if (list && activeRow instanceof HTMLElement) {
            scrollListChildIntoView(list, activeRow);
        }
    }, [activeIndex, hits, open]);

    const pick = useCallback(
        (hit: DesignSearchHit) => {
            onPick(hit);
            setOpen(false);
        },
        [onPick],
    );

    const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            if (hits.length) setActiveIndex((current) => (current + 1) % hits.length);
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (hits.length) setActiveIndex((current) => (current - 1 + hits.length) % hits.length);
            return;
        }
        if (event.key === "Home" && hits.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(0);
            return;
        }
        if (event.key === "End" && hits.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(hits.length - 1);
            return;
        }
        if (event.key === "Enter") {
            const hit = hits[activeIndex];
            if (!hit) return;
            event.preventDefault();
            pick(hit);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (open) {
                setOpen(false);
                return;
            }
            if (query) {
                setQuery("");
                return;
            }
            inputRef.current?.blur();
        }
    };

    if (!slot) return null;

    const trimmed = query.trim();
    const showShortcuts = !trimmed;
    const showHint = open && !loading && !trimmed;
    const showLoading = open && loading;
    const showEmpty = open && !loading && trimmed.length > 0 && hits.length === 0;
    const showHits = open && !loading && hits.length > 0;

    return createPortal(
        <div ref={rootRef} className="relative mx-auto w-full max-w-xl">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-shortcut-search
                    aria-label="Find component or net"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={open ? activeOptionId : undefined}
                    aria-busy={loading || undefined}
                    role="combobox"
                    placeholder="Search"
                    className={cn(
                        "h-9 w-full min-w-0 border border-input bg-muted/40 py-2 pl-9 text-sm outline-none placeholder:text-muted-foreground",
                        "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
                        showShortcuts ? "pr-32" : "pr-3",
                    )}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={(event) => {
                        if (rootRef.current?.contains(event.relatedTarget as Node)) return;
                        setOpen(false);
                    }}
                    onKeyDown={onInputKeyDown}
                />
                {showShortcuts ? (
                    <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
                        <ShortcutCaps combo="/" />
                        <ShortcutCaps combo="mod+f" />
                    </span>
                ) : null}
            </div>
            {open ? (
                <div
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    aria-label="Design search results"
                    className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto border border-border bg-popover text-popover-foreground shadow-md"
                >
                    {showLoading ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading design index…</p>
                    ) : null}
                    {showHint ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{DESIGN_SEARCH_HINT}</p>
                    ) : null}
                    {showEmpty ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No matches for “{trimmed}”
                        </p>
                    ) : null}
                    {showHits ? (
                        <ResultList
                            listId={listId}
                            hits={hits}
                            activeIndex={activeIndex}
                            onPick={pick}
                            onHover={setActiveIndex}
                        />
                    ) : null}
                </div>
            ) : null}
        </div>,
        slot,
    );
}

function ResultList({
    listId,
    hits,
    activeIndex,
    onPick,
    onHover,
}: {
    listId: string;
    hits: DesignSearchHit[];
    activeIndex: number;
    onPick: (hit: DesignSearchHit) => void;
    onHover: (index: number) => void;
}) {
    let lastKind: DesignSearchHit["kind"] | null = null;
    return (
        <div className="p-1">
            {hits.map((hit, index) => {
                const heading = hit.kind === lastKind
                    ? null
                    : hit.kind === "component"
                        ? "Components"
                        : "Nets";
                lastKind = hit.kind;
                const isActive = index === activeIndex;
                return (
                    <div key={hit.id} data-active={isActive ? "true" : undefined}>
                        {heading ? (
                            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {heading}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            id={`${listId}-opt-${index}`}
                            role="option"
                            aria-selected={isActive}
                            className={cn(
                                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                                isActive ? "bg-muted text-foreground" : "text-muted-foreground",
                            )}
                            onMouseMove={() => onHover(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onPick(hit)}
                        >
                            <span className="min-w-0 flex-1 truncate text-foreground">{hit.title}</span>
                            {hit.subtitle ? (
                                <span className="max-w-[55%] shrink-0 truncate text-xs text-muted-foreground">
                                    {hit.subtitle}
                                </span>
                            ) : null}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
