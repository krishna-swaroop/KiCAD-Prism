import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Below this many rows a table renders them all; windowing only pays off on long lists. */
export const WINDOW_FROM = 200;
const OVERSCAN = 30;
const FALLBACK_ROW_PX = 36;

export interface RowWindow {
  /** The rows to render, `start` to `end` (exclusive). */
  start: number;
  end: number;
  /** Space standing in for the rows above and below. */
  before: number;
  after: number;
}

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let parent = node?.parentElement ?? null; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") return parent;
  }
  return null;
}

/**
 * Which of `count` table rows are near the visible part of the table's scrolling container, so a long table renders only
 * those and a spacer for the rest. `table` is the table element; rows carry `data-row` so their heights are measured, and
 * a spacer of the average measured height stands in for each row not rendered. Under `WINDOW_FROM` rows every row is
 * rendered.
 */
export function useWindowedRows(count: number, table: RefObject<HTMLElement | null>): RowWindow {
  const windowed = count >= WINDOW_FROM;
  const rowPx = useRef(FALLBACK_ROW_PX);
  const [view, setView] = useState({ top: 0, height: 0 });

  const measure = useCallback(() => {
    const element = table.current;
    const container = scrollParent(element);
    if (!element || !container) return;
    const rows = element.querySelectorAll<HTMLElement>("[data-row]");
    if (rows.length > 0) {
      let total = 0;
      rows.forEach((row) => { total += row.getBoundingClientRect().height; });
      if (total > 0) rowPx.current = total / rows.length;
    }
    // Where the visible part of the container falls, measured from the top of the table.
    const top = container.getBoundingClientRect().top - element.getBoundingClientRect().top;
    setView((current) => (current.top === top && current.height === container.clientHeight ? current : { top, height: container.clientHeight }));
  }, [table]);

  useLayoutEffect(() => {
    if (windowed) measure();
  }, [windowed, count, measure]);

  useEffect(() => {
    if (!windowed) return undefined;
    const container = scrollParent(table.current);
    if (!container) return undefined;
    container.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(container);
    return () => {
      container.removeEventListener("scroll", measure);
      resized.disconnect();
    };
  }, [windowed, table, measure]);

  if (!windowed) return { start: 0, end: count, before: 0, after: 0 };
  const per = rowPx.current;
  const start = Math.max(0, Math.floor(view.top / per) - OVERSCAN);
  const end = Math.min(count, Math.ceil((view.top + Math.max(view.height, per)) / per) + OVERSCAN);
  return { start, end, before: start * per, after: (count - end) * per };
}
