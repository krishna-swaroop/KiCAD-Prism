import { Badge } from "@/components/ui/badge";
import { RUN_STATUS_LABELS, type DefectSeverity, type RunStatus } from "@/types/manufacturing";

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>;

// One tone per run status, shared by the production list, the run views and the
// project tab. Early stages are quiet, "in production" reads as running, "received"
// asks for an inspection, and "closed" is done.
export const RUN_STATUS_VARIANT: Record<RunStatus, BadgeVariant> = {
    draft: "outline",
    ordered: "info",
    in_production: "progress",
    received: "warning",
    closed: "success",
    // Called off, not failed: quiet, so it does not compete with a live production.
    cancelled: "secondary",
};

export const SEVERITY_VARIANT: Record<DefectSeverity, BadgeVariant> = {
    aesthetic: "outline",
    minor: "secondary",
    major: "warning",
    critical: "destructive",
};

// The soft destructive badge reads as near-black red on the dark theme. Counts and
// "critical" need to be seen at a glance, so they use the solid fill.
export const SOLID_DESTRUCTIVE = "border-transparent bg-destructive text-destructive-foreground dark:bg-destructive";

export function RunStatusBadge({ status }: { status: RunStatus }) {
    return <Badge variant={RUN_STATUS_VARIANT[status]}>{RUN_STATUS_LABELS[status]}</Badge>;
}
