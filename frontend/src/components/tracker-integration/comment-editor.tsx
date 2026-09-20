/**
 * Shared comment compose/edit box for canvas cards, the comments panel, and
 * the comparison rail. Callers send `expectedRevision` on save; a 409 is
 * shown as a reload-and-retry, never a silent overwrite.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommentMutationError } from "@/lib/comments-client";
import { cn } from "@/lib/utils";
import type {
    CommentPermissions,
    CreateCommentDisplayedRevision,
} from "@/types/comments";

const FULL_SHA = /^[0-9a-f]{40}$/i;

/** The revision the reviewer is looking at. HEAD is never inferred. */
export function displayedCanvasRevision(
    commit?: string | null,
    sourceRevisionKey?: string | null,
): CreateCommentDisplayedRevision {
    const sha = (commit ?? "").trim();
    const revisionKey = (sourceRevisionKey ?? "").trim() || null;
    if (FULL_SHA.test(sha)) {
        return {
            commit: sha.toLowerCase(),
            worktree: false,
            sourceRevisionKey: revisionKey,
        };
    }
    return { worktree: true, sourceRevisionKey: revisionKey };
}

export function actionAllowed(
    permissions: CommentPermissions | undefined | null,
    action: keyof CommentPermissions,
    fallback = false,
): boolean {
    if (!permissions) return fallback;
    return Boolean(permissions[action]);
}

export function describeMutationError(error: unknown, fallback: string): {
    message: string;
    conflict: boolean;
    currentRevision?: number | null;
} {
    if (error instanceof CommentMutationError) {
        return {
            message: error.message || fallback,
            conflict: error.isConflict,
            currentRevision: error.currentRevision,
        };
    }
    return {
        message: error instanceof Error && error.message ? error.message : fallback,
        conflict: false,
    };
}

interface CommentEditorProps {
    id: string;
    label: string;
    initialValue?: string;
    submitLabel?: string;
    placeholder?: string;
    busy?: boolean;
    error?: string | null;
    conflict?: boolean;
    onSubmit: (content: string) => void | Promise<void>;
    onCancel?: () => void;
    onReload?: () => void;
    className?: string;
}

export function CommentEditor({
    id,
    label,
    initialValue = "",
    submitLabel = "Save",
    placeholder = "Write a comment…",
    busy = false,
    error = null,
    conflict = false,
    onSubmit,
    onCancel,
    onReload,
    className,
}: CommentEditorProps) {
    const [content, setContent] = useState(initialValue);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleSubmit = () => {
        if (!content.trim() || busy) return;
        void onSubmit(content.trim());
    };

    return (
        <div className={cn("space-y-2", className)}>
            <label htmlFor={id} className="block text-xs font-medium">
                {label}
            </label>
            <textarea
                ref={textareaRef}
                id={id}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={placeholder}
                disabled={busy}
                className="h-16 w-full resize-none rounded-md border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        handleSubmit();
                    }
                    if (event.key === "Escape") {
                        event.preventDefault();
                        onCancel?.();
                    }
                }}
            />
            {(error || conflict) && (
                <p className="text-[11px] text-destructive" role="alert">
                    {conflict
                        ? "This thread changed since you opened it. Reload, then save again."
                        : error}
                    {conflict && onReload && (
                        <>
                            {" "}
                            <button
                                type="button"
                                className="underline"
                                onClick={onReload}
                            >
                                Reload
                            </button>
                        </>
                    )}
                </p>
            )}
            <div className="flex justify-end gap-2">
                {onCancel && (
                    <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                )}
                <Button
                    type="button"
                    size="sm"
                    disabled={busy || !content.trim()}
                    onClick={handleSubmit}
                >
                    {busy ? "Saving…" : submitLabel}
                </Button>
            </div>
        </div>
    );
}
