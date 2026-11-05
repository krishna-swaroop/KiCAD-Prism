import { GitBranch, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** A slim row saying the page shows a pinned commit or another branch, with the way back. */
export function RevisionBanner({ commit, branchRef, branchHash, commitsBehind, onReset }: {
    /** The pinned commit, when viewing one. */
    commit: string | null;
    /** The branch being viewed (its ref), when one was chosen. */
    branchRef: string | null;
    branchHash: string | null;
    commitsBehind: number;
    onReset: () => void;
}) {
    return (
        <div className="flex items-center justify-between border-b border-warning/20 bg-warning/10 px-4 py-1">
            <div className="flex items-center gap-2 text-xs">
                <GitBranch className="h-3.5 w-3.5 text-warning" />
                <span className="font-medium">
                    {commit ? `Viewing commit ${commit.substring(0, 7)}` : `Viewing branch ${branchRef}`}
                    {branchHash ? <span className="ml-2 text-muted-foreground">@ {branchHash}</span> : null}
                    {commit && commitsBehind > 0 ? (
                        <span className="ml-2 text-muted-foreground">
                            ({commitsBehind} {commitsBehind === 1 ? "commit" : "commits"} behind latest)
                        </span>
                    ) : null}
                </span>
            </div>
            <Button variant="outline" size="xs" onClick={onReset}>
                <RotateCcw />
                {commit && branchRef ? "Return to Branch Head" : "Return to Current Checkout"}
            </Button>
        </div>
    );
}
