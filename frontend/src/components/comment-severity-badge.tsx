import { Badge, badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    COMMENT_SEVERITIES,
    commentSeverityLabel,
    type CommentSeverity,
} from "@/types/comments";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** Color mapping for glanceable severity labels across form, card, and panel. */
export function commentSeverityBadgeVariant(severity: CommentSeverity): BadgeVariant {
    switch (severity) {
        case "critical":
            return "destructive";
        case "major":
            return "warning";
        case "minor":
            return "success";
        default:
            return "info";
    }
}

interface CommentSeverityBadgeProps {
    severity: CommentSeverity;
    className?: string;
}

export function CommentSeverityBadge({ severity, className }: CommentSeverityBadgeProps) {
    return (
        <Badge
            variant={commentSeverityBadgeVariant(severity)}
            className={cn("h-5 text-[10px]", className)}
        >
            {commentSeverityLabel(severity)}
        </Badge>
    );
}

interface CommentSeverityPickerProps {
    value: CommentSeverity;
    onChange: (value: CommentSeverity) => void;
    disabled?: boolean;
}

/** Colored severity chips for the comment form. */
export function CommentSeverityPicker({
    value,
    onChange,
    disabled = false,
}: CommentSeverityPickerProps) {
    return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Severity">
            {COMMENT_SEVERITIES.map((severity) => {
                const selected = value === severity;
                return (
                    <button
                        key={severity}
                        type="button"
                        disabled={disabled}
                        aria-pressed={selected}
                        onClick={() => onChange(severity)}
                        className={cn(
                            badgeVariants({ variant: commentSeverityBadgeVariant(severity) }),
                            "h-7 cursor-pointer px-2.5 text-xs transition-shadow",
                            selected
                                ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                                : "opacity-70 hover:opacity-100",
                            disabled && "pointer-events-none opacity-50",
                        )}
                    >
                        {commentSeverityLabel(severity)}
                    </button>
                );
            })}
        </div>
    );
}
