import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCommittedRef } from "@/hooks/use-committed-ref";

/** Results plus the unfiltered match count, when the source can report one. */
export interface AsyncSearchPage<T> {
  items: T[];
  total?: number;
}

interface AsyncSearchPickerProps<T> {
  /** Ids for the listbox and its options are derived from this. */
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rendered through `asChild`, so it must forward props and accept a ref. */
  trigger: ReactNode;
  fetchPage: (query: string, signal: AbortSignal) => Promise<AsyncSearchPage<T>>;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  isSelected?: (item: T) => boolean;
  onSelect: (item: T) => void;
  searchPlaceholder: string;
  listLabel: string;
  emptyMessage: ReactNode;
  /** Seeds the search so a likely match is on screen without typing. */
  suggestQuery?: string;
  /** Anything the fetch depends on beyond the query. Changing it refetches. */
  fetchKey?: string;
  /** Required when the picker lives inside a Dialog — see the note below. */
  modal?: boolean;
  contentClassName?: string;
  renderFooter?: (page: { shown: number; total: number }) => ReactNode;
}

const SEARCH_DEBOUNCE_MS = 180;

/**
 * Popover search over a remote list.
 *
 * Both asset pickers had grown their own copy of the same debounce, abort, and
 * result-rendering logic, and only one of them had keyboard support. This is
 * that shell, once: the search box keeps DOM focus and points at the highlighted
 * row through `aria-activedescendant`, so arrow keys never walk a tab-stop per
 * result and the options are a real listbox rather than a stack of buttons.
 *
 * Callers own the trigger, the row markup, and the fetch; everything about
 * *finding* lives here.
 */
export function AsyncSearchPicker<T>({
  id,
  open,
  onOpenChange,
  trigger,
  fetchPage,
  getKey,
  renderItem,
  isSelected,
  onSelect,
  searchPlaceholder,
  listLabel,
  emptyMessage,
  suggestQuery = "",
  fetchKey = "",
  modal = false,
  contentClassName,
  renderFooter,
}: AsyncSearchPickerProps<T>) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const listId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const effectiveQuery = query || (open ? suggestQuery : "");

  // `isSelected` is usually an inline arrow, so it must not gate the fetch.
  const selectedRef = useCommittedRef(isSelected);
  const fetchRef = useCommittedRef(fetchPage);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void fetchRef
        .current(effectiveQuery.trim(), controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          setItems(page.items);
          setTotal(page.total ?? page.items.length);
          // Land on the current selection when it survived the filter.
          const selected = selectedRef.current;
          const index = selected ? page.items.findIndex((item) => selected(item)) : -1;
          setActiveIndex(index >= 0 ? index : 0);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setItems([]);
          setTotal(0);
          setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [effectiveQuery, fetchKey, fetchRef, open, selectedRef]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the keyboard-highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const commit = (item: T) => {
    onSelect(item);
    onOpenChange(false);
    setQuery("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) commit(item);
    }
  };

  return (
    // modal: when the picker opens inside a Dialog it portals outside that
    // dialog's scroll lock, and without this Radix blocks wheel/touchmove over
    // the result list. As the topmost modal layer it may scroll; nothing else moves.
    <Popover open={open} onOpenChange={onOpenChange} modal={modal}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={cn("p-0", contentClassName)}>
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[activeIndex] ? optionId(activeIndex) : undefined}
            placeholder={searchPlaceholder}
            className="h-7 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
          />
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="max-h-64 overflow-y-auto"
        >
          {error ? (
            <p className="px-3 py-4 text-center text-xs text-destructive">{error}</p>
          ) : !loading && items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
          ) : (
            items.map((item, index) => (
              <div
                key={getKey(item)}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex}
                // Options are divs, not buttons: focus stays in the search box so
                // aria-activedescendant stays authoritative and Tab does not walk
                // one stop per result. Pointer selection keeps the same focus.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(item)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2 border-b border-border/60 px-2.5 py-2 text-left text-xs last:border-b-0",
                  index === activeIndex && "bg-muted/60"
                )}
              >
                {renderItem(item)}
              </div>
            ))
          )}
        </div>
        {!error && renderFooter ? renderFooter({ shown: items.length, total }) : null}
      </PopoverContent>
    </Popover>
  );
}
