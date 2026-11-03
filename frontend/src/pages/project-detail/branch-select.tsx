import { GitBranch } from "lucide-react";

export interface ProjectBranch {
    name: string;
    ref: string;
    source: "local" | "remote" | string;
    is_current: boolean;
    hash: string;
    commit: string;
}

const CHEVRON =
    "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/**
 * The branch the project is viewed on. The empty value is the branch the
 * clone is checked out to, shown by its name; that branch is not listed a
 * second time.
 */
export function BranchSelect({ branches, selected, current, loading, error, onChange }: {
    branches: readonly ProjectBranch[];
    selected: ProjectBranch | null;
    current: ProjectBranch | null;
    loading: boolean;
    error: string | null;
    onChange: (ref: string) => void;
}) {
    return (
        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <select
                // An explicit ?branch= naming the current branch maps back to
                // the default entry, which stands for it.
                value={selected && selected.ref !== current?.ref ? selected.ref : ""}
                onChange={(event) => onChange(event.target.value)}
                disabled={loading}
                title={error || "Branch"}
                className="h-7 max-w-[240px] appearance-none rounded-md border border-input bg-background bg-no-repeat py-0 pl-2.5 pr-7 text-xs text-foreground shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundImage: CHEVRON, backgroundPosition: "right 0.5rem center", backgroundSize: "1rem" }}
            >
                <option value="">{loading ? "Loading branches…" : current?.name || "Current checkout"}</option>
                {branches.flatMap((branch) => (branch.is_current ? [] : [
                    <option key={branch.ref} value={branch.ref}>{branch.name}</option>,
                ]))}
            </select>
        </div>
    );
}
