import * as React from "react";
import { useState } from "react";
import { Send, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommentSeverityPicker } from "@/components/comment-severity-badge";
import {
    COMMENT_CLASSES,
    DEFAULT_COMMENT_CLASS,
    DEFAULT_COMMENT_SEVERITY,
    commentClassLabel,
    type CommentClass,
    type CommentContext,
    type CommentLocation,
    type CommentSeverity,
    type MentionCandidate,
} from "@/types/comments";
import { RichComposer, extractMentions, type RichComposerState } from "@/features/rich-comments/rich-composer";

export type CommentFormSubmitPayload = {
    content: string;
    contentFormat: "md";
    commentClass: CommentClass;
    severity: CommentSeverity;
    mentions: string[];
};

interface CommentFormProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: CommentFormSubmitPayload) => void;
    location: CommentLocation | null;
    context: CommentContext;
    isSubmitting?: boolean;
    mentionCandidates?: MentionCandidate[];
}

/**
 * Modal dialog for adding a new design review comment.
 * Cmd/Ctrl+Enter submits; Escape closes; @ opens mention suggestions;
 * pasting or dropping a snip attaches it inline.
 */
const NO_MENTION_CANDIDATES: MentionCandidate[] = [];

export function CommentForm({
    projectId,
    isOpen,
    onClose,
    onSubmit,
    location,
    context,
    isSubmitting = false,
    mentionCandidates = NO_MENTION_CANDIDATES,
}: CommentFormProps) {
    const [draft, setDraft] = useState<RichComposerState>({ markdown: "", uploading: false });
    const [commentClass, setCommentClass] = useState<CommentClass>(DEFAULT_COMMENT_CLASS);
    const [severity, setSeverity] = useState<CommentSeverity>(DEFAULT_COMMENT_SEVERITY);
    const canPost = Boolean(draft.markdown) && !draft.uploading && !isSubmitting;

    if (!isOpen || !location) return null;

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!canPost) return;
        onSubmit({
            content: draft.markdown,
            contentFormat: "md",
            commentClass,
            severity,
            mentions: extractMentions(draft.markdown, mentionCandidates),
        });
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent
                className="max-w-lg gap-0 p-0"
                aria-describedby={undefined}
                // The composer owns Escape: it closes its mention list first,
                // and the form only when nothing else is open.
                onEscapeKeyDown={(event) => event.preventDefault()}
            >
                <DialogHeader className="border-b p-4">
                    <DialogTitle className="text-base">Add comment</DialogTitle>
                </DialogHeader>

                <div className="px-4 py-3 bg-muted/50 border-b space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span>
                            {context} · ({location.x.toFixed(2)}, {location.y.toFixed(2)}) mm
                        </span>
                        {location.bounds && (
                            <span className="px-2 py-0.5 bg-background rounded text-xs">
                                Area {location.bounds[2].toFixed(1)}×{location.bounds[3].toFixed(1)} mm
                            </span>
                        )}
                        {location.layer && (
                            <span className="px-2 py-0.5 bg-background rounded text-xs">
                                {location.layer}
                            </span>
                        )}
                    </div>

                    <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">Class</span>
                        <select
                            value={commentClass}
                            onChange={(e) => setCommentClass(e.target.value as CommentClass)}
                            className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                            disabled={isSubmitting}
                        >
                            {COMMENT_CLASSES.map((value) => (
                                <option key={value} value={value}>
                                    {commentClassLabel(value)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="space-y-1 text-xs">
                        <span className="text-muted-foreground">Severity</span>
                        <CommentSeverityPicker
                            value={severity}
                            onChange={setSeverity}
                            disabled={isSubmitting}
                        />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-4">
                    <span className="mb-1 block text-xs font-medium">Comment</span>
                    {/* Visualizer mounts this per open, keyed on the pinned location, so the
                        composer's initial empty document is the reset. */}
                    <RichComposer
                        projectId={projectId}
                        ariaLabel="Comment"
                        autoFocus
                        onChange={setDraft}
                        onSubmit={() => handleSubmit()}
                        onCancel={onClose}
                        placeholder="Describe the issue… Paste a snip, or @email to mention someone"
                        mentionCandidates={mentionCandidates}
                        disabled={isSubmitting}
                        minHeightClassName="min-h-32"
                    />

                    <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-muted-foreground">
                            {draft.uploading ? "Uploading attachments…" : "⌘/Ctrl + Enter to submit"}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={!canPost}
                            >
                                {isSubmitting ? (
                                    "Posting..."
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Post Comment
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
