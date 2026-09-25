import { useState } from "react";
import { Cloud, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommentReply } from "@/types/comments";

function safeUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Where a reply lives relative to the linked issue: imported from it, posted
 * to it, or kept in Prism until someone with publication rights shares it.
 */
export function ReplyTrackerState({ reply, provider, onShare }: {
    reply: CommentReply;
    provider?: string | null;
    onShare?: (replyId: string) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const forge = provider || "tracker";
    const link = safeUrl(reply.sync?.externalUrl);
    const unsynced = reply.sync?.state === "unsynced_local";
    const canShare = unsynced && Boolean(reply.permissions?.canShare) && Boolean(reply.id) && Boolean(onShare);

    if (reply.origin !== "remote" && !unsynced) return null;
    return (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {reply.origin === "remote" && (
                link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline">
                        <Cloud className="size-3" aria-hidden="true" /> on {forge}
                    </a>
                ) : (
                    <span className="inline-flex items-center gap-1">
                        <Cloud className="size-3" aria-hidden="true" /> on {forge}
                    </span>
                )
            )}
            {unsynced && <span>Not shared to the {forge} issue</span>}
            {canShare && (
                <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        void onShare!(reply.id!).finally(() => setBusy(false));
                    }}>
                    <Share2 className="mr-1 size-3" aria-hidden="true" /> Share to {forge}
                </Button>
            )}
        </div>
    );
}
