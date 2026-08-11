import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HoldToConfirmButton } from "./hold-to-confirm-button";

/**
 * The whole value of this control is that a click does nothing. These tests
 * drive the animation clock directly so the guarantee is checked rather than
 * assumed.
 */

let now = 0;
let frameCallbacks: FrameRequestCallback[] = [];

function advance(ms: number) {
  now += ms;
  act(() => {
    const pending = frameCallbacks;
    frameCallbacks = [];
    pending.forEach((callback) => callback(now));
  });
}

beforeEach(() => {
  now = 0;
  frameCallbacks = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frameCallbacks = [];
  });
});

// Vitest runs without `globals`, so Testing Library never registers its own
// auto-cleanup and each render would otherwise stack up in the document.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pointerDown(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  });
}

function pointerUp(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });
}

describe("HoldToConfirmButton", () => {
  it("does not confirm on a plain click", () => {
    const onConfirm = vi.fn();
    const view = render(<HoldToConfirmButton onConfirm={onConfirm}>Delete</HoldToConfirmButton>);
    const button = view.getByRole("button");

    pointerDown(button);
    advance(50);
    pointerUp(button);
    advance(2000);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms once the hold duration elapses", () => {
    const onConfirm = vi.fn();
    const view = render(
      <HoldToConfirmButton onConfirm={onConfirm} holdDurationMs={800}>
        Delete
      </HoldToConfirmButton>,
    );
    const button = view.getByRole("button");

    pointerDown(button);
    advance(400);
    expect(onConfirm).not.toHaveBeenCalled();

    advance(400);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("aborts when the pointer leaves before the hold completes", () => {
    const onConfirm = vi.fn();
    const view = render(
      <HoldToConfirmButton onConfirm={onConfirm} holdDurationMs={800}>
        Delete
      </HoldToConfirmButton>,
    );
    const button = view.getByRole("button");

    pointerDown(button);
    advance(600);
    // React synthesises pointerleave from pointerout, so the test has to fire
    // the event React actually listens for.
    act(() => {
      fireEvent.pointerOut(button, { relatedTarget: document.body });
    });
    advance(2000);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the holding label while the hold is in progress", () => {
    const view = render(
      <HoldToConfirmButton onConfirm={() => {}} holdDurationMs={800} holdingLabel="Keep holding…">
        Hold to delete
      </HoldToConfirmButton>,
    );
    const button = view.getByRole("button");

    expect(button).toHaveTextContent("Hold to delete");
    pointerDown(button);
    advance(200);
    expect(button).toHaveTextContent("Keep holding…");
  });

  it("stays inert while disabled", () => {
    const onConfirm = vi.fn();
    const view = render(
      <HoldToConfirmButton onConfirm={onConfirm} holdDurationMs={100} disabled>
        Delete
      </HoldToConfirmButton>,
    );
    const button = view.getByRole("button");

    pointerDown(button);
    advance(500);

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
