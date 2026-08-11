import { useState } from "react";
import { CheckCircle2, MessageSquare, Reply, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchApi, readApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Comment, CommentContext } from "@/types/comments";

interface DiscussionAnchor {
    id: string;
    label: string;
    page?: string | null;
}

interface ComparisonDiscussionRailProps {
    projectId: string;
    base: string;
    compare: string;
    domain: CommentContext;
    anchor: DiscussionAnchor | null;
    comments: Comment[];
    canComment: boolean;
    onCommentsChange: (comments: Comment[]) => void;
    onClose: () => void;
    embedded?: boolean;
}

export function ComparisonDiscussionRail({
    projectId,
    base,
    compare,
    domain,
    anchor,
    comments,
    canComment,
    onCommentsChange,
    onClose,
    embedded = false,
}: ComparisonDiscussionRailProps) {
    const [content, setContent] = useState("");
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [reply, setReply] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createThread = async () => {
        if (!content.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comparison-comments`, {
                method: "POST",
                body: JSON.stringify({
                    baseCommit: base,
                    compareCommit: compare,
                    domain,
                    content: content.trim(),
                    filePath: anchor?.page ?? undefined,
                    semanticItemId: anchor?.id ?? undefined,
                    semanticItemRef: anchor?.label ?? undefined,
                    anchorKind: anchor ? "group" : "comparison",
                }),
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to add discussion"));
            }
            onCommentsChange([...comments, (await response.json()) as Comment]);
            setContent("");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Failed to add discussion");
        } finally {
            setBusy(false);
        }
    };

    const resolveThread = async (comment: Comment) => {
        const response = await fetchApi(`/api/projects/${projectId}/comments/${comment.id}`, {
            method: "PATCH",
            body: JSON.stringify({
                status: comment.status === "RESOLVED" ? "OPEN" : "RESOLVED",
            }),
        });
        if (!response.ok) {
            setError(await readApiError(response, "Failed to update discussion"));
            return;
        }
        const updated = (await response.json()) as Comment;
        onCommentsChange(comments.map((item) => item.id === updated.id ? updated : item));
    };

    const addReply = async (comment: Comment) => {
        if (!reply.trim()) return;
        setBusy(true);
        const response = await fetchApi(
            `/api/projects/${projectId}/comments/${comment.id}/replies`,
            {
                method: "POST",
                body: JSON.stringify({ content: reply.trim() }),
            },
        );
        if (!response.ok) {
            setError(await readApiError(response, "Failed to add reply"));
            setBusy(false);
            return;
        }
        const payload = (await response.json()) as { comment: Comment };
        onCommentsChange(
            comments.map((item) => item.id === payload.comment.id ? payload.comment : item),
        );
        setReply("");
        setReplyingTo(null);
        setBusy(false);
    };

    return (
        <aside
            className={cn(
                "flex h-full flex-col bg-background",
                embedded
                    ? "w-full"
                    : "w-80 shrink-0 border-l max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:shadow-xl",
            )}
        >
            {!embedded && (
            <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-sm font-semibold">Comments</span>
                    <span className="rounded-full bg-muted px-1.5 text-[10px]">
                        {comments.filter((comment) => comment.status === "OPEN").length}
                    </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Close discussion</span>
                </Button>
            </div>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
                {!comments.length && (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                        No discussion threads for this comparison yet.
                    </p>
                )}
                {comments.map((comment) => (
                    <article
                        key={comment.id}
                        className={`rounded-md border p-3 text-xs ${
                            comment.status === "RESOLVED" ? "opacity-60" : ""
                        }`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <div className="font-medium">{comment.author}</div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {comment.elementRef || "Whole comparison"}
                                </div>
                            </div>
                            {canComment && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => void resolveThread(comment)}
                                    aria-label={
                                        comment.status === "RESOLVED"
                                            ? "Reopen discussion"
                                            : "Resolve discussion"
                                    }
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                        {!!comment.replies.length && (
                            <div className="mt-2 space-y-2 border-l pl-2">
                                {comment.replies.map((item, index) => (
                                    <div key={`${item.timestamp}-${index}`}>
                                        <span className="font-medium">{item.author}: </span>
                                        {item.content}
                                    </div>
                                ))}
                            </div>
                        )}
                        {canComment && (
                            <div className="mt-2">
                                {replyingTo === comment.id ? (
                                    <div className="space-y-2">
                                        <Textarea
                                            value={reply}
                                            onChange={(event) => setReply(event.target.value)}
                                            placeholder="Reply…"
                                            className="min-h-16 text-xs"
                                        />
                                        <Button
                                            size="sm"
                                            className="h-7"
                                            disabled={busy || !reply.trim()}
                                            onClick={() => void addReply(comment)}
                                        >
                                            <Send className="mr-1.5 h-3 w-3" />
                                            Reply
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-1.5"
                                        onClick={() => setReplyingTo(comment.id)}
                                    >
                                        <Reply className="mr-1.5 h-3 w-3" />
                                        Reply
                                    </Button>
                                )}
                            </div>
                        )}
                    </article>
                ))}
            </div>

            {canComment && (
                <div className="space-y-2 border-t p-3">
                    <div className="text-[10px] text-muted-foreground">
                        {anchor ? `New thread on ${anchor.label}` : "New comparison thread"}
                    </div>
                    <Textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder="Add review context…"
                        className="min-h-20 text-xs"
                    />
                    {error && <p className="text-[10px] text-destructive">{error}</p>}
                    <Button
                        size="sm"
                        className="w-full"
                        disabled={busy || !content.trim()}
                        onClick={() => void createThread()}
                    >
                        <Send className="mr-2 h-3.5 w-3.5" />
                        Add thread
                    </Button>
                </div>
            )}
        </aside>
    );
}
