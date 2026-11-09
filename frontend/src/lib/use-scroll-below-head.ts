import { useLayoutEffect, type RefObject } from "react";

/**
 * Starts a scrolling area's vertical scrollbar below its sticky header, so the bar runs beside the rows and not over the
 * header. Sets `--scroll-head` on `scroller` to `head`'s height, kept as it changes; the scroller carries
 * `themed-scrollbar scroll-below-head` (WebKit and Chromium honour the track margin; elsewhere the bar is as before).
 */
export function useScrollBelowHead(scroller: RefObject<HTMLElement | null>, head: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const area = scroller.current;
    const header = head.current;
    if (!area || !header) return undefined;
    const update = () => area.style.setProperty("--scroll-head", `${header.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watcher = new ResizeObserver(update);
    watcher.observe(header);
    return () => watcher.disconnect();
  });
}
