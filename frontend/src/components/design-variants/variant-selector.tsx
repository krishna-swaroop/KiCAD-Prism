/**
 * The toolbar's native design-variant selector (VAR-14). Purely presentational:
 * the caller owns the URL, the catalog and the resolution, so nothing here
 * mirrors them into state.
 */

import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { AssemblyCatalogEntry } from "@/types/prism-selection";

import {
    variantSelectionNotice,
    variantSelectorDisabled,
    type VariantSelectionResolution,
} from "./variant-selection";

export interface DesignVariantSelectorProps {
    resolution: VariantSelectionResolution;
    /** Everything the current revision's catalog offers, in catalog order. */
    variants: readonly AssemblyCatalogEntry[];
    /** Name to apply, or null for the default assembly. */
    onSelect: (name: string | null) => void;
    /** Offered when discovery failed; the notice keeps the reason visible. */
    onRetry?: () => void;
    /** The name the URL asked for, used to word the missing notice. */
    requested?: string | null;
}

const NOTICE_CLASS = "max-w-64 truncate text-xs text-muted-foreground";

export function DesignVariantSelector({
    resolution,
    variants,
    onSelect,
    onRetry,
    requested = null,
}: DesignVariantSelectorProps) {
    const selectId = useId();
    const noticeId = useId();
    const notice = variantSelectionNotice(resolution, requested);
    if (resolution.state === "empty") return null;
    const showControl = variants.length > 0 || resolution.state !== "missing";

    return (
        <div className="flex items-center gap-2">
            {showControl && (
                <>
                    <label
                        htmlFor={selectId}
                        className="text-xs text-muted-foreground"
                    >
                        Variant
                    </label>
                    <select
                        id={selectId}
                        className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs"
                        value={resolution.effective ?? ""}
                        disabled={variantSelectorDisabled(resolution)}
                        aria-describedby={notice ? noticeId : undefined}
                        onChange={(event) =>
                            onSelect(
                                event.target.value === ""
                                    ? null
                                    : event.target.value,
                            )
                        }
                    >
                        <option value="">Default</option>
                        {variants.map((variant) => (
                            <option
                                key={variant.name}
                                value={variant.name}
                                title={variant.description ?? undefined}
                            >
                                {variant.name}
                            </option>
                        ))}
                    </select>
                </>
            )}
            {notice && (
                <span
                    id={noticeId}
                    role="status"
                    title={notice}
                    className={NOTICE_CLASS}
                >
                    {notice}
                </span>
            )}
            {resolution.state === "failed" && onRetry && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onRetry}
                >
                    Retry
                </Button>
            )}
        </div>
    );
}
