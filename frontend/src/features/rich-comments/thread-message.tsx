import { useRef, useState } from "react";
import { Pencil, Quote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCommentTimestamp } from "@/components/comment-date";
import { ifMatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Comment, CommentReply } from "@/types/comments";
import { CommentBody } from "./comment-body";
import { editableMarkdown, quoteMarkdown } from "./quote";
import { ReactionBar } from "./reactions";
import { RichComposer, extractMentions, type RichComposerState } from "./rich-composer";
import { commentPath, threadAction, useApplyThread } from "./thread-updates";

interface ThreadMessageProps {
    projectId: string;
    /** The thread the message belongs to; the root itself when `reply` is absent. */
    thread: Comment;
    reply?: CommentReply;
    /** The reader may react and quote (a commenter on this project). */
    canInteract: boolean;
    /** Put a quote of this message into the thread's reply box. */
    onQuote?: (markdown: string) => void;
    bodyClassName?: string;
    className?: string;
}

/**
 * One message in a review thread, root or reply: its body, an "edited"
 * marker, reactions, and the actions a Slack thread offers -- quote into a
 * reply, and for its author, edit in place or delete a reply.
 */
export function ThreadMessage({
    projectId, thread, reply, canInteract, onQuote, bodyClassName, className,
}: ThreadMessageProps) {
    const applyThread = useApplyThread();
    const message = reply ?? thread;
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const canEdit = Boolean(message.permissions?.canEdit) && (!reply || Boolean(reply.id));
    const canDeleteReply = Boolean(reply?.id && reply.permissions?.canDelete);
    const messagePath = reply?.id ? `/replies/${encodeURIComponent(reply.id)}` : "";

    const deleteReply = async () => {
        setConfirmDelete(false);
        try {
            const updated = await threadAction(
                commentPath(projectId, thread.id, messagePath),
                { method: "DELETE", headers: reply?.id && reply.revision ? ifMatch("reply", reply.id, reply.revision) : undefined },
                "Could not delete the reply",
            );
            applyThread?.(updated);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete the reply");
        }
    };

    return (
        <div className={cn("group/message", className)}>
            {editing ? (
                <MessageEditor
                    projectId={projectId}
                    path={commentPath(projectId, thread.id, messagePath)}
                    initialMarkdown={editableMarkdown(message.content, message.contentFormat)}
                    guard={message.revision
                        ? reply?.id ? ifMatch("reply", reply.id, message.revision) : ifMatch("comment", thread.id, message.revision)
                        : undefined}
                    mentions={reply ? undefined : thread.mentions}
                    onDone={(updated) => {
                        if (updated) applyThread?.(updated);
                        setEditing(false);
                    }}
                />
            ) : (
                <CommentBody
                    projectId={projectId}
                    content={message.content}
                    contentFormat={message.contentFormat}
                    attachments={message.attachments}
                    className={bodyClassName}
                />
            )}
            {message.editedAt && !editing && (
                <span className="text-[10px] text-muted-foreground" title={`Edited ${formatCommentTimestamp(message.editedAt)}`}>
                    (edited)
                </span>
            )}
            {!editing && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                    <ReactionBar
                        projectId={projectId}
                        commentId={thread.id}
                        replyId={reply?.id}
                        reactions={message.reactions}
                        canReact={canInteract && (!reply || Boolean(reply.id))}
                    />
                    <div className="ml-auto flex items-center gap-0.5 opacity-70 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
                        {canInteract && onQuote && (
                            <MessageAction
                                label="Quote in reply"
                                icon={Quote}
                                onClick={() => onQuote(quoteMarkdown(message.author, message.content, message.contentFormat))}
                            />
                        )}
                        {canEdit && <MessageAction label="Edit message" icon={Pencil} onClick={() => setEditing(true)} />}
                        {canDeleteReply && (
                            <MessageAction label="Delete reply" icon={Trash2} onClick={() => setConfirmDelete(true)} destructive />
                        )}
                    </div>
                </div>
            )}
            {canDeleteReply && (
                <ConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title="Delete reply"
                    description="This removes the reply from the thread. Its history is kept."
                    confirmLabel="Delete reply"
                    onConfirm={() => void deleteReply()}
                />
            )}
        </div>
    );
}

function MessageAction({
    label, icon: Icon, onClick, destructive = false,
}: { label: string; icon: typeof Quote; onClick: () => void; destructive?: boolean }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                destructive && "hover:bg-destructive/10 hover:text-destructive",
            )}
        >
            <Icon className="h-3.5 w-3.5" />
        </button>
    );
}

/** In-place edit: the same WYSIWYG composer, seeded with the stored Markdown. */
function MessageEditor({
    projectId, path, initialMarkdown, guard, mentions, onDone,
}: {
    projectId: string;
    path: string;
    initialMarkdown: string;
    /** The `If-Match` for the revision the editor opened. */
    guard?: Record<string, string>;
    /** A root's mentions; an edit keeps only those still in the text. */
    mentions?: string[];
    onDone: (updated: Comment | null) => void;
}) {
    const [draft, setDraft] = useState<RichComposerState>({ markdown: initialMarkdown, uploading: false });
    const [saving, setSaving] = useState(false);
    // The composer normalizes Markdown as it opens; that, not the stored
    // text, is what "unchanged" compares against.
    const opened = useRef<string | null>(null);
    const canSave = Boolean(draft.markdown) && !draft.uploading && !saving;

    const save = async () => {
        if (!canSave) return;
        if (draft.markdown === (opened.current ?? initialMarkdown)) {
            onDone(null);
            return;
        }
        setSaving(true);
        try {
            const updated = await threadAction(path, {
                method: "PATCH",
                headers: guard,
                body: JSON.stringify({
                    content: draft.markdown,
                    contentFormat: "md",
                    ...(mentions ? {
                        mentions: extractMentions(draft.markdown, mentions.map((email) => ({ email, role: "" }))),
                    } : {}),
                }),
            }, "Could not save the edit");
            onDone(updated);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save the edit");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            <RichComposer
                projectId={projectId}
                ariaLabel="Edit message"
                autoFocus
                initialMarkdown={initialMarkdown}
                onChange={(state) => {
                    opened.current ??= state.markdown;
                    setDraft(state);
                }}
                onSubmit={() => void save()}
                onCancel={() => onDone(null)}
                disabled={saving}
                minHeightClassName="min-h-16"
                className="font-normal"
            />
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onDone(null)}>
                    Cancel
                </Button>
                <Button type="button" size="sm" className="h-7" disabled={!canSave} onClick={() => void save()}>
                    Save
                </Button>
            </div>
        </div>
    );
}
