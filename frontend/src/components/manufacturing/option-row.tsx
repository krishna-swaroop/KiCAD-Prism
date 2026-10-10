import { useRef, type ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

interface OptionRowProps {
    /** The id of the control, so the label focuses it. */
    htmlFor?: string;
    label: ReactNode;
    /** Shown after the control: where the value came from. */
    marker?: ReactNode;
    /** A sub-option: drawn indented under the option that unlocks it. */
    nested?: boolean;
    children: ReactNode;
}

/**
 * One label-left row of a form or fact list: a fixed label column, the control,
 * and an optional marker. Used by the spec form and the run facts so they align.
 */
export function OptionRow({ htmlFor, label, marker, nested = false, children }: OptionRowProps) {
    const control = useRef<HTMLDivElement>(null);

    // A native input, select or textarea is focused by the label's `for`. A button group
    // (Yes/No, a few choices) is not one element, so focus its tab stop instead.
    const focusControl = () => {
        const target = htmlFor ? document.getElementById(htmlFor) : null;
        if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
        const root = control.current;
        // The group's one tab stop (its selection) wins over the first button in the markup.
        const focusTarget = root?.querySelector<HTMLElement>('[tabindex="0"]') ?? root?.querySelector<HTMLElement>("input, select, textarea, button");
        focusTarget?.focus();
    };

    return (
        <div
            className={cn(
                "grid items-center gap-x-4 gap-y-1 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_6rem]",
                nested && "ml-4 border-l pl-4 sm:grid-cols-[10rem_minmax(0,1fr)_6rem]",
            )}
        >
            <label htmlFor={htmlFor} onClick={focusControl} className="text-sm text-muted-foreground">
                {label}
            </label>
            <div ref={control} className="min-w-0">
                {children}
            </div>
            <div className="hidden justify-end sm:flex">{marker}</div>
        </div>
    );
}

export type Provenance = "extracted" | "manual" | "default";

const PROVENANCE_LABEL: Record<Provenance, string> = {
    extracted: "From board",
    manual: "Edited",
    default: "Default",
};

/** Where a field's value came from: read from the board, typed in, or the schema default. */
export function ProvenanceMarker({ provenance }: { provenance: Provenance | null }) {
    if (!provenance) return null;
    return (
        <span
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            title={
                provenance === "extracted"
                    ? "Filled from the board file"
                    : provenance === "manual"
                      ? "Entered by hand"
                      : "The process's default value"
            }
        >
            {provenance === "extracted" && <Sparkles className="h-3 w-3" aria-hidden />}
            {PROVENANCE_LABEL[provenance]}
        </span>
    );
}
