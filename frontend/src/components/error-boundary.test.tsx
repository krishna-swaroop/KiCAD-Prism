import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { ErrorBoundary } from "./error-boundary";

/**
 * React logs every caught error to the console on its own, which would bury the
 * real vitest output under expected noise. Silenced per test, and restored so a
 * genuine unexpected error still surfaces elsewhere.
 */
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Boom({ shouldThrow, message = "grid exploded" }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) throw new Error(message);
  return <p>panel content</p>;
}

describe("ErrorBoundary", () => {
  it("renders its children while nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("panel content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("catches a render-phase throw and shows the failing message instead of unmounting", () => {
    render(
      <ErrorBoundary label="the bulk edit grid">
        <Boom shouldThrow message="can't access property &quot;scrollTop&quot;, currentTarget is null" />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong in the bulk edit grid.");
    expect(alert).toHaveTextContent("currentTarget is null");
    expect(screen.queryByText("panel content")).not.toBeInTheDocument();
  });

  it("logs the error with its label and reports it to onError", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary label="the visualizer" onError={onError}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("grid exploded");
    // The component stack is the part that names the component that threw.
    expect(onError.mock.calls[0][1].componentStack).toContain("Boom");
    expect(console.error).toHaveBeenCalledWith(
      "[ErrorBoundary: the visualizer]",
      expect.any(Error),
      expect.any(String),
    );
  });

  it("recovers when the reviewer retries and the cause is gone", () => {
    function Harness() {
      const [broken, setBroken] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setBroken(false)}>fix it</button>
          <ErrorBoundary>
            <Boom shouldThrow={broken} />
          </ErrorBoundary>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "fix it" }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("panel content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stays in the fallback when retrying and the cause is still there", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears the error on its own when a reset key changes", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["commit-a"]}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Navigating to a different revision is a fresh attempt, not the same
    // broken one — the reviewer should not have to press anything.
    rerender(
      <ErrorBoundary resetKeys={["commit-b"]}>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("panel content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the fallback when the reset keys are unchanged", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["commit-a"]}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    rerender(
      <ErrorBoundary resetKeys={["commit-a"]}>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders a custom fallback with a working reset", () => {
    function Harness() {
      const [broken, setBroken] = useState(true);
      return (
        <ErrorBoundary
          fallback={({ error, reset }) => (
            <div>
              <span>custom: {error.message}</span>
              <button type="button" onClick={() => { setBroken(false); reset(); }}>retry</button>
            </div>
          )}
        >
          <Boom shouldThrow={broken} />
        </ErrorBoundary>
      );
    }

    render(<Harness />);
    expect(screen.getByText("custom: grid exploded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("lets an inner boundary contain a crash without the outer one firing", () => {
    render(
      <ErrorBoundary label="the tab">
        <p>sibling panel</p>
        <ErrorBoundary label="the visualizer">
          <Boom shouldThrow />
        </ErrorBoundary>
      </ErrorBoundary>,
    );

    // The sibling survives: that containment is the whole point of nesting.
    expect(screen.getByText("sibling panel")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong in the visualizer.");
  });
});
