import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_HOLD_MS = 900;

export interface HoldToConfirmButtonProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Button>, "onClick" | "children"> {
  /** Runs once the hold completes. Never runs on a plain click. */
  onConfirm: () => void;
  /** Label at rest, e.g. "Delete project". */
  children: React.ReactNode;
  /** Label while the user is holding. Defaults to "Keep holding…". */
  holdingLabel?: string;
  holdDurationMs?: number;
}

/**
 * A destructive-action button that only fires after a deliberate press-and-hold.
 *
 * Deleting a project or archiving a released component destroys work that other
 * people depend on, and both sit one stray click away from a list of similar
 * rows. The hold turns a reflex into an intention, and the fill gives the user
 * the whole duration to change their mind by letting go.
 *
 * Confirmation dialogs that already collect information — the workflow
 * transition dialog and its release notes — are left alone. Stacking a hold on
 * top of a form the user has just filled in is friction, not safety.
 */
const HoldToConfirmButton = React.forwardRef<HTMLButtonElement, HoldToConfirmButtonProps>(
  (
    {
      onConfirm,
      children,
      holdingLabel = "Keep holding…",
      holdDurationMs = DEFAULT_HOLD_MS,
      className,
      variant = "destructive",
      disabled,
      onKeyDown,
      onKeyUp,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const [progress, setProgress] = React.useState(0);
    const [holding, setHolding] = React.useState(false);
    const frameRef = React.useRef<number | null>(null);
    const startedAtRef = React.useRef(0);
    const confirmRef = React.useRef(onConfirm);
    confirmRef.current = onConfirm;

    const stop = React.useCallback(() => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setHolding(false);
      setProgress(0);
    }, []);

    React.useEffect(() => stop, [stop]);

    const start = React.useCallback(() => {
      if (disabled || frameRef.current !== null) return;
      startedAtRef.current = performance.now();
      setHolding(true);

      const tick = () => {
        const elapsed = performance.now() - startedAtRef.current;
        const ratio = Math.min(1, elapsed / holdDurationMs);
        setProgress(ratio);
        if (ratio >= 1) {
          frameRef.current = null;
          setHolding(false);
          setProgress(0);
          confirmRef.current();
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    }, [disabled, holdDurationMs]);

    // Space and Enter are the keyboard equivalents of a press. Browsers repeat
    // keydown while a key is held, so the repeats are dropped and the release
    // is what cancels.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.repeat) return;
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      start();
    };

    const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyUp?.(event);
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      stop();
    };

    const percent = Math.round(progress * 100);

    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        disabled={disabled}
        data-holding={holding ? "true" : undefined}
        className={cn(
          "relative isolate overflow-hidden",
          holding && "cursor-progress",
          className,
        )}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented || event.button !== 0) return;
          // Deliberately no setPointerCapture: capturing the pointer suppresses
          // pointerleave, which is what lets the user slide off the button to
          // back out mid-hold.
          start();
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          stop();
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          stop();
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          stop();
        }}
        onBlur={(event) => {
          onBlur?.(event);
          stop();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        {...props}
      >
        {/* The fill is painted behind the label and is width-driven rather than
            transform-driven, so it reads as a progress bar at any button size. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 -z-10 bg-destructive/35"
          style={{ width: `${percent}%` }}
        />
        <span className="relative">{holding ? holdingLabel : children}</span>
        <span className="sr-only"> (press and hold to confirm)</span>
      </Button>
    );
  },
);

HoldToConfirmButton.displayName = "HoldToConfirmButton";

export { HoldToConfirmButton };
