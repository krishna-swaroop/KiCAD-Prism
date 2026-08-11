import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Contains a render-phase crash to one region of the app.
 *
 * Without a boundary React unmounts the entire tree when any component throws
 * while rendering, so the window goes white and the reviewer loses whatever
 * they were doing. That is what a null `currentTarget` in one grid's scroll
 * handler did to the whole workspace. The throw itself was the bug; taking the
 * application down with it was this gap.
 *
 * Boundaries are therefore placed per region rather than only at the root — a
 * root-only boundary still costs the reviewer the whole screen, it just paints
 * the loss more politely. Wrapping each heavy panel means a broken viewer or
 * comparison pane leaves the surrounding navigation intact and reachable.
 *
 * What this cannot catch: React only routes *render*, lifecycle and constructor
 * errors here. Event handlers, `setTimeout` callbacks and rejected promises do
 * not unmount the tree on their own, so they never reach a boundary and still
 * need their own try/catch.
 */

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Names the region in the fallback copy and in the console log. */
  label?: string;
  /**
   * Clears a caught error whenever one of these values changes.
   *
   * A boundary that has caught stays caught until something remounts it, so a
   * panel keyed to the selected project would otherwise stay broken after the
   * reviewer moves to a different one. Listing that id here retries on its own.
   */
  resetKeys?: readonly unknown[];
  /** Replaces the default fallback panel. */
  fallback?: (state: { error: Error; reset: () => void }) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
  /** Snapshot of `resetKeys` from the render that last set `error`. */
  resetKeys: readonly unknown[];
};

function keysChanged(previous: readonly unknown[], next: readonly unknown[]): boolean {
  if (previous.length !== next.length) return true;
  return previous.some((value, index) => !Object.is(value, next[index]));
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKeys: this.props.resetKeys ?? [] };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    const next = props.resetKeys ?? [];
    if (state.error && keysChanged(state.resetKeys, next)) {
      return { error: null, resetKeys: next };
    }
    if (!state.error && keysChanged(state.resetKeys, next)) {
      return { resetKeys: next };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged rather than swallowed: the fallback tells the reviewer their panel
    // is gone, but only the component stack tells us which component took it.
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset });

    const { label } = this.props;
    return (
      <div
        role="alert"
        className="flex h-full min-h-[12rem] w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center"
      >
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {label ? `Something went wrong in ${label}.` : "Something went wrong."}
          </p>
          {/* The message is the one detail that distinguishes "the backend is
              down" from "this panel has a bug", and reviewers report it to us. */}
          <p className="max-w-prose break-words text-xs text-muted-foreground">{error.message}</p>
          <p className="text-xs text-muted-foreground">
            The rest of the workspace is still usable.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={this.reset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }
}
