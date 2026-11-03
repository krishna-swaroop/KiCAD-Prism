import * as React from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  /** The selected value, or "" when nothing is selected. */
  value: string;
  onChange: (value: string) => void;
  /** Names the group for assistive tech; use the field's label. */
  "aria-label": string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A single-choice group of short options shown side by side, so every choice is
 * visible without opening a menu. Arrow keys move the selection, like radios.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
}: SegmentedControlProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const move = (from: number, step: number) => {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex flex-wrap border bg-background", className)}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            // Roving tabindex: the group is one tab stop, landing on the selection.
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(index, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(index, -1);
              }
            }}
            className={cn(
              "h-8 border-r px-3 text-sm transition-colors last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
