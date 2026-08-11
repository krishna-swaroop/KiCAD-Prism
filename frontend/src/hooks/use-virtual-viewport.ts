import { useCallback, useEffect, useRef, useState } from "react";
import type { UIEvent } from "react";

/** Fallback height used until the element mounts and the observer reports a real one. */
const DEFAULT_VIEWPORT_HEIGHT = 640;

export type VirtualViewport = {
  /** Measured client height of the scroll container. */
  height: number;
  /** Latest observed scroll offset. */
  scrollTop: number;
};

export type UseVirtualViewportResult = VirtualViewport & {
  /** Attach to the scrolling element: `<div ref={viewportRef} onScroll={onScroll}>`. */
  viewportRef: (node: HTMLElement | null) => void;
  onScroll: (event: UIEvent<HTMLElement>) => void;
  /** Jump the container back to the top, e.g. after the filters or page change. */
  resetScroll: () => void;
};

/**
 * Track the scroll offset and height of a virtualised list container.
 *
 * The scroll offset is read from `event.currentTarget` *synchronously*, before
 * `setViewport` is called. That ordering is the whole point of this hook.
 * React nulls `currentTarget` on the synthetic event as soon as the handler
 * returns, and a functional updater is only evaluated eagerly when the fiber
 * has no work already queued. Scrolling queues updates faster than React
 * renders, so the second and later updaters run during the render phase — long
 * after the event was cleaned up. Reading `currentTarget` inside the updater
 * therefore threw `can't access property "scrollTop", currentTarget is null`
 * mid-render, which unmounts the tree and blanks the workspace.
 *
 * The element is tracked with a callback ref rather than `useRef` so the
 * observer attaches whenever the node actually mounts, including containers
 * that render only once their data arrives.
 */
export function useVirtualViewport(): UseVirtualViewportResult {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<VirtualViewport>({ height: DEFAULT_VIEWPORT_HEIGHT, scrollTop: 0 });
  // Mirrored into a ref so `resetScroll` keeps a stable identity: callers list
  // it in effect dependency arrays, and a new identity per node would re-run
  // those effects.
  const nodeRef = useRef<HTMLElement | null>(null);

  const viewportRef = useCallback((next: HTMLElement | null) => {
    nodeRef.current = next;
    setNode(next);
  }, []);

  useEffect(() => {
    if (!node) return;
    const updateHeight = () => setViewport((current) => {
      const height = node.clientHeight || current.height;
      return current.height === height ? current : { ...current, height };
    });
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    // Read before the state update: see the note above.
    const { scrollTop } = event.currentTarget;
    setViewport((current) => (current.scrollTop === scrollTop ? current : { ...current, scrollTop }));
  }, []);

  const resetScroll = useCallback(() => {
    if (nodeRef.current) nodeRef.current.scrollTop = 0;
    setViewport((current) => (current.scrollTop === 0 ? current : { ...current, scrollTop: 0 }));
  }, []);

  return { ...viewport, viewportRef, onScroll, resetScroll };
}
