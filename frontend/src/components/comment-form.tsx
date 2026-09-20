import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    type Mention,
    type MentionCandidate,
} from "@/types/comments";
import { cn } from "@/lib/utils";

export type CommentFormSubmitPayload = {
    content: string;
    commentClass: CommentClass;
    severity: CommentSeverity;
    mentions: Mention[];
};

interface CommentFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: CommentFormSubmitPayload) => void;
    location: CommentLocation | null;
    context: CommentContext;
    isSubmitting?: boolean;
    mentionCandidates?: MentionCandidate[];
}

const MENTION_TOKEN_RE = /@\[([^\]]+)\]\(user:([^)]+)\)/g;

function formatMentionToken(displayName: string, userId: string): string {
    return `@[${displayName}](user:${userId})`;
}

function extractMentions(content: string): Mention[] {
    const mentions: Mention[] = [];
    const seen = new Set<string>();
    for (const match of content.matchAll(MENTION_TOKEN_RE)) {
        const displayName = (match[1] ?? "").trim();
        const userId = (match[2] ?? "").trim();
        if (!userId || seen.has(userId)) continue;
        seen.add(userId);
        mentions.push({ userId, displayName: displayName || userId });
    }
    return mentions;
}

/**
 * Modal dialog for adding a new design review comment.
 * Cmd/Ctrl+Enter submits; Escape closes; @ opens mention suggestions.
 */
const NO_MENTION_CANDIDATES: MentionCandidate[] = [];

export function CommentForm({
    isOpen,
    onClose,
    onSubmit,
    location,
    context,
    isSubmitting = false,
    mentionCandidates = NO_MENTION_CANDIDATES,
}: CommentFormProps) {
    const [content, setContent] = useState("");
    const [commentClass, setCommentClass] = useState<CommentClass>(DEFAULT_COMMENT_CLASS);
    const [severity, setSeverity] = useState<CommentSeverity>(DEFAULT_COMMENT_SEVERITY);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const mentionMatches = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        return mentionCandidates
            .filter((candidate) => {
                const name = candidate.displayName.toLowerCase();
                return !q || name.includes(q) || candidate.userId.toLowerCase().includes(q);
            })
            .slice(0, 8);
    }, [mentionCandidates, mentionQuery]);

    if (!isOpen || !location) return null;

    const updateMentionState = (value: string, cursor: number) => {
        const before = value.slice(0, cursor);
        const match = before.match(/@([A-Za-z0-9._%+\- ]*)$/);
        if (!match) {
            setMentionQuery(null);
            return;
        }
        setMentionQuery(match[1] ?? "");
        setMentionIndex(0);
    };

    const insertMention = (candidate: MentionCandidate) => {
        const el = textareaRef.current;
        if (!el) return;
        const cursor = el.selectionStart ?? content.length;
        const before = content.slice(0, cursor);
        const after = content.slice(cursor);
        const token = formatMentionToken(candidate.displayName, candidate.userId);
        const replaced = before.replace(/@([A-Za-z0-9._%+\- ]*)$/, `${token} `);
        const next = `${replaced}${after}`;
        setContent(next);
        setMentionQuery(null);
        requestAnimationFrame(() => {
            const pos = replaced.length;
            el.focus();
            el.setSelectionRange(pos, pos);
        });
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!content.trim()) return;
        onSubmit({
            content: content.trim(),
            commentClass,
            severity,
            mentions: extractMentions(content),
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionQuery !== null && mentionMatches.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % mentionMatches.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insertMention(mentionMatches[mentionIndex]!);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setMentionQuery(null);
                return;
            }
        }

        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/50" />

            <div
                className="relative bg-background border rounded-lg shadow-xl w-full max-w-md mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold">Add Comment</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8"
                        aria-label="Close comment form"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

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
                    <div className="relative">
                        <label htmlFor="new-comment-content" className="mb-1 block text-xs font-medium">
                            Comment
                        </label>
                        <textarea
                            id="new-comment-content"
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => {
                                const value = e.target.value;
                                setContent(value);
                                updateMentionState(value, e.target.selectionStart ?? value.length);
                            }}
                            onClick={(e) => {
                                const target = e.currentTarget;
                                updateMentionState(target.value, target.selectionStart ?? target.value.length);
                            }}
                            onKeyUp={(e) => {
                                const target = e.currentTarget;
                                updateMentionState(target.value, target.selectionStart ?? target.value.length);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe the issue… Use @name to mention someone"
                            className="w-full h-32 p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring text-foreground bg-background"
                            disabled={isSubmitting}
                        />

                        {mentionQuery !== null && mentionMatches.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-auto rounded-md border bg-popover shadow-md">
                                {mentionMatches.map((candidate, index) => (
                                    <button
                                        key={candidate.userId}
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
                                            index === mentionIndex
                                                ? "bg-accent text-accent-foreground"
                                                : "hover:bg-muted",
                                        )}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            insertMention(candidate);
                                        }}
                                    >
                                        <span className="truncate">{candidate.displayName}</span>
                                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                                            {candidate.role}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-muted-foreground">
                            ⌘/Ctrl + Enter to submit
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
                                disabled={!content.trim() || isSubmitting}
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
            </div>
        </div>
    );
}
