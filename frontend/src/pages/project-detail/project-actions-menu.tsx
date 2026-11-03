import { Suspense, lazy, useState } from "react";
import { ExternalLink, Link2, MoreHorizontal, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PathConfigDialog = lazy(() =>
    import("@/components/path-config-dialog").then((module) => ({ default: module.PathConfigDialog }))
);
const TrackerSettingsDialog = lazy(() =>
    import("@/features/tracker-integration/tracker-settings-dialog")
        .then((module) => ({ default: module.TrackerSettingsDialog }))
);

/**
 * The header's less frequent project actions behind one button: open in
 * KiCad, the issue tracker and project settings, with the dialogs they open.
 */
export function ProjectActionsMenu({ projectId, canManage, isAdmin }: {
    projectId: string;
    canManage: boolean;
    isAdmin: boolean;
}) {
    const [dialog, setDialog] = useState<"settings" | "tracker" | null>(null);
    const close = (open: boolean) => { if (!open) setDialog(null); };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Project actions" title="Project actions">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {/* A prism:// link the local Prism agent handles: it finds the
                        project by its marker, clones it if this machine lacks it,
                        and opens it. Without the agent the browser ignores the
                        scheme, which a page cannot detect. */}
                    <DropdownMenuItem onSelect={() => { window.location.href = `prism://open/${projectId}`; }}>
                        <ExternalLink />
                        Open in KiCad
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog("tracker")}>
                        <Link2 />
                        Issue Tracker
                    </DropdownMenuItem>
                    {canManage ? (
                        <DropdownMenuItem onSelect={() => setDialog("settings")}>
                            <Settings />
                            Project Settings
                        </DropdownMenuItem>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>

            {dialog === "settings" ? (
                <Suspense fallback={null}>
                    <PathConfigDialog projectId={projectId} open onOpenChange={close} />
                </Suspense>
            ) : null}
            {dialog === "tracker" ? (
                <Suspense fallback={null}>
                    <TrackerSettingsDialog projectId={projectId} isAdmin={isAdmin} open onOpenChange={close} />
                </Suspense>
            ) : null}
        </>
    );
}
