import { useState } from "react";
import { CheckCircle2, MessageSquare, Pencil, Reply, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    createComparisonComment,
    deleteReply,
    listComparisonComments,
    replyToComment,
    setCommentStatus,
    updateComment,
    updateReply,
} from "@/lib/comments-client";
import type { Comment, CommentContext, CommentReply } from "@/types/comments";
import {
    CommentEditor,
    actionAllowed,
    describeMutationError,
} from "@/components/tracker-integration/comment-editor";

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
    selectedSide?: "base" | "compare";
    onCommentsChange: (comments: Comment[]) => void;
    onClose: () => void;
    embedded?: boolean;
}

function replaceComment(comments: Comment[], updated: Comment): Comment[] {
    return comments.map((item) => (item.id === updated.id ? updated : item));
}

export function ComparisonDiscussionRail({
    projectId,
    base,
    compare,
    domain,
    anchor,
    comments,
    canComment,
    selectedSide = "compare",
    onCommentsChange,
    onClose,
    embedded = false,
}: ComparisonDiscussionRailProps) {
    const [content, setContent] = useState("");
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);

    const reload = async () => {
        onCommentsChange(await listComparisonComments(projectId, base, compare, domain));
    };

    const fail = async (caught: unknown, fallback: string) => {
        const described = describeMutationError(caught, fallback);
        setError(described.message);
        setConflict(described.conflict);
        if (described.conflict) {
            try {
                await reload();
            } catch {
                // Keep the conflict message even if reload fails.
            }
        }
    };

    const createThread = async () => {
        if (!content.trim()) return;
        setBusy(true);
        setError(null);
        setConflict(false);
        try {
            const created = await createComparisonComment(projectId, {
                baseCommit: base,
                compareCommit: compare,
                domain,
                content: content.trim(),
                filePath: anchor?.page ?? undefined,
                semanticItemId: anchor?.id ?? undefined,
                semanticItemRef: anchor?.label ?? undefined,
                anchorKind: anchor ? "group" : "comparison",
                selectedSide,
            });
            onCommentsChange([...comments, created]);
            setContent("");
        } catch (caught) {
            await fail(caught, "Failed to add discussion");
        } finally {
            setBusy(false);
        }
    };

    const resolveThread = async (comment: Comment) => {
        try {
            const updated = await setCommentStatus(
                projectId,
                comment,
                comment.status !== "RESOLVED",
            );
            onCommentsChange(replaceComment(comments, updated));
        } catch (caught) {
            await fail(caught, "Failed to update discussion");
        }
    };

    const addReply = async (comment: Comment, replyContent: string) => {
        if (!replyContent.trim()) return;
        setBusy(true);
        setError(null);
        setConflict(false);
        try {
            const payload = await replyToComment(projectId, comment.id, { content: replyContent.trim() });
            onCommentsChange(replaceComment(comments, payload.comment));
            setReplyingTo(null);
        } catch (caught) {
            await fail(caught, "Failed to add reply");
        } finally {
            setBusy(false);
        }
    };

    const saveEdit = async (comment: Comment, next: string) => {
        setBusy(true);
        setError(null);
        setConflict(false);
        try {
            const updated = await updateComment(projectId, comment.id, {
                content: next,
                expectedRevision: comment.revision,
            });
            onCommentsChange(replaceComment(comments, updated));
            setEditingId(null);
        } catch (caught) {
            await fail(caught, "Failed to update discussion");
        } finally {
            setBusy(false);
        }
    };

    const saveReplyEdit = async (comment: Comment, reply: CommentReply, next: string) => {
        setBusy(true);
        setError(null);
        setConflict(false);
        try {
            const updated = await updateReply(projectId, comment.id, reply.id, {
                content: next,
                expectedRevision: reply.revision,
            });
            onCommentsChange(replaceComment(comments, updated));
            setEditingReplyId(null);
        } catch (caught) {
            await fail(caught, "Failed to update reply");
        } finally {
            setBusy(false);
        }
    };

    const removeReply = async (comment: Comment, reply: CommentReply) => {
        try {
            const updated = await deleteReply(projectId, comment.id, reply.id, reply.revision);
            onCommentsChange(replaceComment(comments, updated));
        } catch (caught) {
            await fail(caught, "Failed to delete reply");
        }
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
                {comments.map((comment) => {
                    const canReply = actionAllowed(comment.permissions, "canReply", canComment);
                    const canEdit = actionAllowed(comment.permissions, "canEdit", false);
                    const canResolve = actionAllowed(comment.permissions, "canResolve", canComment);
                    const liveReplies = comment.replies.filter((item) => !item.deletedAt);
                    return (
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
                            <div className="flex items-center gap-1">
                                {canEdit && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setEditingId(comment.id)}
                                        aria-label="Edit discussion"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {canResolve && (
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
                        </div>
                        {editingId === comment.id ? (
                            <div className="mt-2">
                                <CommentEditor
                                    id={`compare-edit-${comment.id}`}
                                    label="Edit discussion"
                                    initialValue={comment.content}
                                    busy={busy}
                                    error={error}
                                    conflict={conflict}
                                    onReload={() => void reload()}
                                    onCancel={() => { setEditingId(null); setError(null); setConflict(false); }}
                                    onSubmit={(next) => void saveEdit(comment, next)}
                                />
                            </div>
                        ) : (
                            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                        )}
                        {!!liveReplies.length && (
                            <div className="mt-2 space-y-2 border-l pl-2">
                                {liveReplies.map((item) => {
                                    const replyCanEdit = actionAllowed(item.permissions, "canEdit", false);
                                    const replyCanDelete = actionAllowed(item.permissions, "canDelete", false);
                                    return (
                                    <div key={item.id}>
                                        {editingReplyId === item.id ? (
                                            <CommentEditor
                                                id={`compare-edit-reply-${item.id}`}
                                                label="Edit reply"
                                                initialValue={item.content}
                                                busy={busy}
                                                error={error}
                                                conflict={conflict}
                                                onReload={() => void reload()}
                                                onCancel={() => { setEditingReplyId(null); setError(null); setConflict(false); }}
                                                onSubmit={(next) => void saveReplyEdit(comment, item, next)}
                                            />
                                        ) : (
                                            <>
                                                <span className="font-medium">{item.author}: </span>
                                                {item.content}
                                                {(replyCanEdit || replyCanDelete) && (
                                                    <span className="ml-1">
                                                        {replyCanEdit && (
                                                            <button type="button" className="underline" onClick={() => setEditingReplyId(item.id)}>
                                                                Edit
                                                            </button>
                                                        )}
                                                        {replyCanDelete && (
                                                            <button
                                                                type="button"
                                                                className="ml-1 underline text-destructive"
                                                                onClick={() => void removeReply(comment, item)}
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                        {canReply && (
                            <div className="mt-2">
                                {replyingTo === comment.id ? (
                                    <CommentEditor
                                        id={`compare-reply-${comment.id}`}
                                        label="Reply"
                                        submitLabel="Reply"
                                        placeholder="Reply…"
                                        busy={busy}
                                        error={error}
                                        conflict={conflict}
                                        onReload={() => void reload()}
                                        onCancel={() => { setReplyingTo(null); setError(null); setConflict(false); }}
                                        onSubmit={(next) => void addReply(comment, next)}
                                    />
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
                    );
                })}
            </div>

            {canComment && (
                <div className="space-y-2 border-t p-3">
                    <div className="text-[10px] text-muted-foreground">
                        {anchor ? `New thread on ${anchor.label}` : "New comparison thread"}
                    </div>
                    <textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder="Add review context…"
                        className="min-h-20 w-full resize-none rounded-md border bg-background p-2 text-xs text-foreground"
                    />
                    {error && !replyingTo && !editingId && (
                        <p className="text-[10px] text-destructive" role="alert">
                            {conflict
                                ? "This thread changed. Reload, then save again."
                                : error}
                            {conflict && (
                                <>
                                    {" "}
                                    <button type="button" className="underline" onClick={() => void reload()}>
                                        Reload
                                    </button>
                                </>
                            )}
                        </p>
                    )}
                    <Button
                        size="sm"
                        className="w-full"
                        disabled={busy || !content.trim()}
                        onClick={() => void createThread()}
                    >
                        Add thread
                    </Button>
                </div>
            )}
        </aside>
    );
}
