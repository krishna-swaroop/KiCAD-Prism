import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { User } from "@/types/auth";
import type { SupplyBomComment } from "@/types/supply";
import { addBomComment, listBomComments, removeBomComment } from "./supply-api";
import { formatAgo } from "./supply-format";
import { useLoaded } from "./use-loaded";

/** Notes on one BOM line, shared by everyone who can open the project. */
export function BomLineComments({ projectId, lineKey, user }: { projectId: string; lineKey: string; user: User | null }) {
  const fetcher = useCallback((signal: AbortSignal) => listBomComments(projectId, signal), [projectId]);
  const loaded = useLoaded<SupplyBomComment[]>(`projects/${projectId}/comments`, fetcher, "Could not load the comments");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const mine = (loaded.data ?? []).filter((comment) => comment.line_key === lineKey);

  /** Runs a change, then reloads. True when it worked. */
  const act = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError("");
    try {
      await action();
      await loaded.refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
      return false;
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (body && (await act(() => addBomComment(projectId, lineKey, body)))) setText("");
  };

  return (
    <div className="space-y-2 border-t pt-2" aria-label="Comments">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comments</p>
      {mine.length === 0 && loaded.status === "ready" ? <p className="text-xs text-muted-foreground">No comments on this part yet.</p> : null}
      <ul className="space-y-1.5">
        {mine.map((comment) => (
          <li key={comment.id} className="flex items-start justify-between gap-2 text-xs">
            <span>
              <span className="whitespace-pre-wrap">{comment.body}</span>
              <span className="block text-muted-foreground">{comment.author_name || comment.author}, {formatAgo(comment.created_at)}</span>
            </span>
            {user && (user.email === comment.author || user.role === "admin") ? (
              <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Remove comment" onClick={() => void act(() => removeBomComment(projectId, comment.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Textarea aria-label="Add a comment" rows={1} maxLength={1000} className="min-h-8 text-xs" value={text} onChange={(event) => setText(event.target.value)} />
        <Button type="submit" size="sm" disabled={!text.trim()}>Add</Button>
      </form>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
