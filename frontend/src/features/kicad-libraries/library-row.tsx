import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KicadLibrary } from "@/types/kicad-libraries";

import { describeLibrary, formatBytes, isFetching, stateLine, updateAvailable } from "./library-status";

export interface LibraryActions {
    edit: (library: KicadLibrary) => void;
    fetchAgain: (library: KicadLibrary) => void;
    checkNow: (library: KicadLibrary) => void;
    updateNow: (library: KicadLibrary) => void;
    toggleFreeze: (library: KicadLibrary) => void;
    showVersions: (library: KicadLibrary) => void;
    refresh: (library: KicadLibrary) => void;
    remove: (library: KicadLibrary) => void;
}

interface LibraryRowProps {
    library: KicadLibrary;
    busy: boolean;
    actions: LibraryActions;
}

function Menu({ library, busy, actions }: LibraryRowProps) {
    const git = library.kind === "git";
    const working = isFetching(library);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy} aria-label={`Actions for ${library.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {git && <DropdownMenuItem onSelect={() => actions.checkNow(library)}>Check now</DropdownMenuItem>}
                {git && updateAvailable(library) && (
                    <DropdownMenuItem onSelect={() => actions.updateNow(library)}>Update to the new commit</DropdownMenuItem>
                )}
                {git && (
                    <DropdownMenuItem onSelect={() => actions.toggleFreeze(library)}>
                        {library.updatePolicy === "pinned" ? "Follow the ref again" : "Pin at this commit"}
                    </DropdownMenuItem>
                )}
                {git && <DropdownMenuItem onSelect={() => actions.showVersions(library)}>Versions</DropdownMenuItem>}
                {git && !working && (
                    <DropdownMenuItem onSelect={() => actions.fetchAgain(library)}>Fetch again</DropdownMenuItem>
                )}
                {!git && <DropdownMenuItem onSelect={() => actions.refresh(library)}>Read the folder again</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => actions.edit(library)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onSelect={() => actions.remove(library)}>Remove</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function LibraryRow({ library, busy, actions }: LibraryRowProps) {
    const status = describeLibrary(library);
    const showProgress = library.state === "fetching" && library.progress !== null;
    const size = formatBytes(library.sizeBytes);
    const detail = [
        library.ready && library.fetchedAt ? `fetched ${new Date(library.fetchedAt).toLocaleString()}` : "",
        library.projectsUsing > 0 ? `${library.projectsUsing} project${library.projectsUsing === 1 ? "" : "s"} use it` : "",
    ]
        .filter(Boolean)
        .join(", ");

    return (
        <li className="rounded-lg border p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{library.name}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {size ? <Badge variant="outline">{size}</Badge> : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {library.variables.map((variable) => (
                            <code key={variable} className="rounded bg-muted px-1.5 py-0.5 text-xs">{`\${${variable}}`}</code>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{stateLine(library)}</p>
                    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
                </div>
                <Menu library={library} busy={busy} actions={actions} />
            </div>
            {library.problem && (
                <p className="text-sm text-destructive break-words">Not in use: {library.problem}</p>
            )}
            {library.overriddenVariables.length > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                    Overridden by the server&apos;s environment: {library.overriddenVariables.join(", ")}. This library does not bind {library.overriddenVariables.length === 1 ? "it" : "them"}.
                </p>
            )}
            {showProgress && (
                <div
                    role="progressbar"
                    aria-label={`Fetching ${library.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={library.progress ?? 0}
                    className="h-1.5 w-full overflow-hidden rounded bg-muted"
                >
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${library.progress ?? 0}%` }} />
                </div>
            )}
            {library.state === "failed" && library.error && (
                <p className="text-sm text-destructive break-words">{library.error}</p>
            )}
        </li>
    );
}
