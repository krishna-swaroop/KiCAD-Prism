import { cn } from "@/lib/utils";

export type ChangeKind = "added" | "removed" | "changed";

/**
 * Added, removed and modified are told apart by shape as well as colour.
 *
 * A solid colour block alone is denser and reads faster, which is what we want
 * in a long change list. But added/removed are green/red — the pair that
 * red-green colour blindness collapses, which is roughly 8% of men — so colour
 * on its own would leave those users unable to tell an addition from a
 * deletion. The shapes cost no extra space and carry the distinction when the
 * colour does not.
 */
const SHAPE: Record<ChangeKind, string> = {
    added: "rounded-full",
    removed: "rounded-[2px]",
    changed: "rounded-[1px] rotate-45",
};

const TONE: Record<ChangeKind, string> = {
    added: "bg-success",
    removed: "bg-destructive",
    changed: "bg-warning",
};

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
    added: "Added",
    removed: "Removed",
    changed: "Modified",
};

export function ChangeStatusDot({
    kind,
    className,
}: {
    kind: ChangeKind;
    className?: string;
}) {
    return (
        <span
            role="img"
            aria-label={CHANGE_KIND_LABEL[kind]}
            className={cn(
                "inline-block h-2 w-2 shrink-0",
                SHAPE[kind],
                TONE[kind],
                className,
            )}
        />
    );
}

/** The same marks, named, for the composite view's legend. */
export function ChangeStatusLegend() {
    return (
        <>
            {(["added", "removed", "changed"] as const).map((kind) => (
                <span key={kind} className="inline-flex items-center gap-1.5">
                    <ChangeStatusDot kind={kind} />
                    {CHANGE_KIND_LABEL[kind]}
                </span>
            ))}
        </>
    );
}
