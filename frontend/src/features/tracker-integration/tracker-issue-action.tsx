import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Comment } from "@/types/comments";
import { safeUrl } from "./safe-url";

/** Shared publication state for the rail and floating comment card. */
export function TrackerIssueAction({ comment, onPromote, onRetry }: {
    comment: Comment;
    onPromote?: (commentId: string) => Promise<void>;
    onRetry?: (commentId: string) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const tracker = comment.tracker;
    const issueUrl = safeUrl(tracker?.externalUrl);
    const linked = Boolean(tracker?.linkState);
    const run = async (action: (commentId: string) => Promise<void>) => {
        setBusy(true);
        try {
            await action(comment.id);
        } finally {
            setBusy(false);
        }
    };

    if (!linked && !comment.permissions?.canPublish) return null;
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {issueUrl && (
                <a href={issueUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline">
                    Open {tracker?.provider || "linked"} issue <ExternalLink className="size-3" />
                </a>
            )}
            {linked && <span aria-live="polite">{tracker?.syncState || "linked"}</span>}
            {!linked && comment.permissions?.canPublish && onPromote && (
                <Button type="button" variant="outline" size="sm" disabled={busy}
                    onClick={() => void run(onPromote)}>Create {tracker?.provider || "tracker"} issue</Button>
            )}
            {comment.permissions?.canRetry && onRetry && (
                <Button type="button" variant="outline" size="sm" disabled={busy}
                    onClick={() => void run(onRetry)}>Retry sync</Button>
            )}
            {tracker?.lastError?.message && <span role="alert">{tracker.lastError.message}</span>}
        </div>
    );
}
