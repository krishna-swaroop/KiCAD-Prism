import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { RunView } from "./run-view";

interface RunDrawerProps {
    /** The run to show; null keeps the drawer closed. */
    runId: string | null;
    canEdit: boolean;
    canLogDefects: boolean;
    canChangeStatus: boolean;
    onClose: () => void;
    onDeleted: () => void;
    /** Called after any change, so the list behind the drawer can refresh. */
    onChanged?: () => void;
    /** Show the link to the project's Manufacturing page (off inside that page). */
    projectLink?: boolean;
}

/**
 * A run opened over its list: wide enough to read a spec and a defect side by
 * side, with the list (and its filters and scroll position) kept behind it.
 */
export function RunDrawer({
    runId,
    canEdit,
    canLogDefects,
    canChangeStatus,
    onClose,
    onDeleted,
    onChanged,
    projectLink,
}: RunDrawerProps) {
    return (
        <Sheet open={runId !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="right"
                className="flex w-full flex-col gap-0 p-0 sm:w-[min(960px,75vw)] sm:max-w-none"
                // The X sits in the header's row of icon buttons: same size, same line.
                closeClassName="right-6 top-6 flex size-7 items-center justify-center rounded-none p-0 opacity-100 shadow-none"
            >
                <SheetTitle className="sr-only">Production</SheetTitle>
                <SheetDescription className="sr-only">
                    Status, quantities, defects and spec of the selected production.
                </SheetDescription>
                {runId && (
                    <RunView
                        runId={runId}
                        canEdit={canEdit}
                        canLogDefects={canLogDefects}
                        canChangeStatus={canChangeStatus}
                        onDeleted={onDeleted}
                        onChanged={onChanged}
                        projectLink={projectLink}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}
