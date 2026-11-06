import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CommentReaction, CommentReactionName } from "@/types/comments";
import { commentPath, threadAction, useApplyThread } from "./thread-updates";

export const REACTIONS: Array<{ name: CommentReactionName; glyph: string; label: string }> = [
    { name: "thumbs_up", glyph: "👍", label: "Agree" },
    { name: "eyes", glyph: "👀", label: "Looking" },
    { name: "check", glyph: "✅", label: "Done" },
    { name: "question", glyph: "❓", label: "Question" },
    { name: "heart", glyph: "❤️", label: "Thanks" },
    { name: "tada", glyph: "🎉", label: "Celebrate" },
];
const GLYPHS = new Map(REACTIONS.map((item) => [item.name, item]));

interface ReactionBarProps {
    projectId: string;
    commentId: string;
    replyId?: string;
    reactions?: CommentReaction[];
    canReact: boolean;
}

function reactedBy(reaction: CommentReaction): string {
    const label = GLYPHS.get(reaction.reaction)?.label ?? reaction.reaction;
    return `${label}: ${reaction.users.join(", ")}`;
}

/** Existing reactions as toggle chips, plus a picker to add one. */
export function ReactionBar({ projectId, commentId, replyId, reactions = [], canReact }: ReactionBarProps) {
    const applyThread = useApplyThread();
    const [busy, setBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const toggle = async (name: CommentReactionName, present: boolean) => {
        if (busy) return;
        setBusy(true);
        setPickerOpen(false);
        const query = replyId ? `?replyId=${encodeURIComponent(replyId)}` : "";
        try {
            const thread = await threadAction(
                commentPath(projectId, commentId, `/reactions/${name}${query}`),
                { method: present ? "PUT" : "DELETE" },
                "Could not update the reaction",
            );
            applyThread?.(thread);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update the reaction");
        } finally {
            setBusy(false);
        }
    };

    if (!reactions.length && !canReact) return null;
    return (
        <div className="flex flex-wrap items-center gap-1">
            {reactions.map((reaction) => (
                <button
                    key={reaction.reaction}
                    type="button"
                    disabled={!canReact || busy}
                    aria-pressed={Boolean(reaction.mine)}
                    title={reactedBy(reaction)}
                    aria-label={`${reactedBy(reaction)}. ${reaction.mine ? "Remove your reaction" : "Add your reaction"}`}
                    onClick={() => void toggle(reaction.reaction, !reaction.mine)}
                    className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-[11px] tabular-nums transition-colors",
                        reaction.mine ? "border-primary/60 bg-primary/10" : "bg-muted/40 hover:bg-muted",
                        !canReact && "cursor-default",
                    )}
                >
                    <span aria-hidden>{GLYPHS.get(reaction.reaction)?.glyph ?? "•"}</span>
                    {reaction.count}
                </button>
            ))}
            {canReact && (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label="Add reaction"
                            disabled={busy}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <SmilePlus className="h-3.5 w-3.5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto flex-row gap-0.5 rounded-md p-1">
                        {REACTIONS.map((item) => {
                            const mine = reactions.some((r) => r.reaction === item.name && r.mine);
                            return (
                                <button
                                    key={item.name}
                                    type="button"
                                    title={item.label}
                                    aria-label={item.label}
                                    aria-pressed={mine}
                                    onClick={() => void toggle(item.name, !mine)}
                                    className={cn(
                                        "h-8 w-8 rounded-md text-base hover:bg-muted",
                                        mine && "bg-primary/10",
                                    )}
                                >
                                    {item.glyph}
                                </button>
                            );
                        })}
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
