import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, FileDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadRunReport } from "@/lib/manufacturing";
import { ALL_RUN_STATUSES, RUN_STATUS_LABELS, type ManufacturingRun } from "@/types/manufacturing";
import { boardName } from "./production-filters";
import { RunStatusBadge } from "./status-badge";
import { StatusStepper, nextRunStatus } from "./status-stepper";

interface RunHeaderProps {
    run: ManufacturingRun;
    canEdit: boolean;
    /** QA/admin only: move the run through its status lifecycle. */
    canChangeStatus: boolean;
    projectLink: boolean;
    onChangeStatus: (status: string) => void;
    onRequestDelete: () => void;
}

/** The run's title, where it is in its lifecycle, and the actions on it. */
export function RunHeader({ run, canEdit, canChangeStatus, projectLink, onChangeStatus, onRequestDelete }: RunHeaderProps) {
    const [downloading, setDownloading] = useState(false);
    const next = nextRunStatus(run.status);
    const board = boardName(run);
    const title = run.job_number || run.project_name || run.project_id;

    const handleDownloadReport = async () => {
        setDownloading(true);
        try {
            await downloadRunReport(run.id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to download the report.");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <header className="shrink-0 border-b bg-background pb-4 pl-6 pr-[3.75rem] pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">{title}</h2>
                        <RunStatusBadge status={run.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {run.project_name || run.project_id}
                        {board !== "—" ? ` / ${board}` : ""}
                        {run.manufacturer_name ? ` · ${run.manufacturer_name}` : ""}
                        {run.spec_name ? ` · ${run.spec_name}` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleDownloadReport()} disabled={downloading}>
                        <FileDown />
                        {downloading ? "Preparing..." : "Download report"}
                    </Button>
                    {projectLink && (
                        <Button asChild size="icon-sm" variant="outline" title="Open this project's Manufacturing page">
                            <Link
                                to={`/project/${run.project_id}?section=manufacturing`}
                                aria-label={`Open ${run.project_name || run.project_id} manufacturing page`}
                            >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                        </Button>
                    )}
                    {canEdit && (
                        <Button
                            size="icon-sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            aria-label="Delete production"
                            title="Delete production"
                            onClick={onRequestDelete}
                        >
                            <Trash2 />
                        </Button>
                    )}
                </div>
            </div>

            <div className="-mr-9 mt-4 flex flex-wrap items-center gap-3">
                {run.status === "cancelled" ? (
                    // Not a stage of the lifecycle, so there is no progress bar to show.
                    <p className="text-sm text-muted-foreground">
                        This production was cancelled. Its spec, quantities and defects are kept.
                    </p>
                ) : (
                    <StatusStepper status={run.status} />
                )}
                {canChangeStatus && (
                    // One control for status: the button moves the run to the next stage,
                    // and the arrow beside it opens every stage for a correction.
                    <div className="flex shrink-0">
                        {next && (
                            <Button size="sm" className="rounded-r-none" onClick={() => onChangeStatus(next)}>
                                Mark as {RUN_STATUS_LABELS[next].toLowerCase()}
                            </Button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="sm"
                                    className={next ? "rounded-l-none border-l border-primary-foreground/30 px-2" : undefined}
                                    aria-label="Set status"
                                >
                                    {!next && "Set status"}
                                    <ChevronDown />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Set status</DropdownMenuLabel>
                                <DropdownMenuRadioGroup value={run.status} onValueChange={(value) => onChangeStatus(value)}>
                                    {ALL_RUN_STATUSES.map((status) => (
                                        <Fragment key={status}>
                                            {/* Cancelled is not a stage, so it sits apart from the lifecycle. */}
                                            {status === "cancelled" && <DropdownMenuSeparator />}
                                            <DropdownMenuRadioItem value={status}>
                                                {RUN_STATUS_LABELS[status]}
                                            </DropdownMenuRadioItem>
                                        </Fragment>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>
        </header>
    );
}
