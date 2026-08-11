import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { useVirtualViewport } from "./use-virtual-viewport";

beforeAll(() => {
  // jsdom ships no ResizeObserver; the hook only needs it to not explode.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function Probe() {
  const viewport = useVirtualViewport();
  return (
    <div ref={viewport.viewportRef} onScroll={viewport.onScroll} data-testid="viewport">
      <span data-testid="scroll-top">{viewport.scrollTop}</span>
    </div>
  );
}

function scroll(node: HTMLElement, scrollTop: number) {
  node.scrollTop = scrollTop;
  node.dispatchEvent(new Event("scroll", { bubbles: true }));
}

describe("useVirtualViewport", () => {
  it("keeps tracking the offset when several scroll events batch into one render", () => {
    render(<Probe />);
    const node = screen.getByTestId("viewport");

    // Two events in one batch is the case that used to crash. React only
    // evaluates a functional updater eagerly while the fiber has no queued
    // work, so the second updater runs during the render phase — after React
    // has nulled `currentTarget` on the synthetic event. Reading the offset
    // inside the updater threw there and unmounted the whole workspace.
    expect(() => {
      act(() => {
        scroll(node, 120);
        scroll(node, 240);
      });
    }).not.toThrow();

    expect(screen.getByTestId("scroll-top")).toHaveTextContent("240");
  });

  it("tracks the offset across separate scroll events", () => {
    render(<Probe />);
    const node = screen.getByTestId("viewport");

    act(() => scroll(node, 64));
    expect(screen.getByTestId("scroll-top")).toHaveTextContent("64");

    act(() => scroll(node, 512));
    expect(screen.getByTestId("scroll-top")).toHaveTextContent("512");
  });

  it("returns the container to the top when resetScroll is called", () => {
    let reset = () => {};
    function ResetProbe() {
      const viewport = useVirtualViewport();
      reset = viewport.resetScroll;
      return (
        <div ref={viewport.viewportRef} onScroll={viewport.onScroll} data-testid="viewport">
          <span data-testid="scroll-top">{viewport.scrollTop}</span>
        </div>
      );
    }

    render(<ResetProbe />);
    const node = screen.getByTestId("viewport");

    act(() => scroll(node, 800));
    expect(screen.getByTestId("scroll-top")).toHaveTextContent("800");

    act(() => reset());
    expect(node.scrollTop).toBe(0);
    expect(screen.getByTestId("scroll-top")).toHaveTextContent("0");
  });
});
