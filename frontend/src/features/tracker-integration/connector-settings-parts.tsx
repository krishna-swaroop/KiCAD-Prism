import { Pause, Play, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TrackerConnector } from "@/types/trackers";

export function ConnectorForbiddenCard({ className }: { className?: string }) {
    return (
        <Card className={cn("border-dashed", className)} data-tracker-phase="forbidden">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Tracker connectors
                </CardTitle>
                <CardDescription>Administrator access is required to configure forge connectors.</CardDescription>
            </CardHeader>
        </Card>
    );
}

export function ConnectorLoadingCard({ className }: { className?: string }) {
    return (
        <Card className={className} data-tracker-phase="loading" aria-busy="true">
            <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-4 w-full max-w-md" />
            </CardHeader>
            <CardContent className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-24 w-full" />
            </CardContent>
        </Card>
    );
}

export function ConnectorOfflineCard({ className, error, onRetry }: {
    className?: string;
    error: string | null;
    onRetry: () => void;
}) {
    return (
        <Card className={className} data-tracker-phase="offline">
            <CardHeader>
                <CardTitle>Tracker connector</CardTitle>
                <CardDescription>Could not reach Prism. Check your network and try again.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-destructive" role="alert">{error}</p>
                <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Retry
                </Button>
            </CardContent>
        </Card>
    );
}

/** Save, plus pause/resume and revoke once the connection exists. */
export function ConnectorLifecycleFooter({ connector, isAdmin, saving, readyToSave, lifecycleBusy, onSave, onLifecycle }: {
    connector: TrackerConnector | null;
    isAdmin: boolean;
    saving: boolean;
    readyToSave: boolean;
    lifecycleBusy: boolean;
    onSave: () => void;
    onLifecycle: (action: "pause" | "resume" | "revoke") => void;
}) {
    return (
        <CardFooter className="flex flex-wrap items-center gap-2 border-t py-3">
            <PermissionHint blocked={!isAdmin} action="manage tracker connectors" allowedRoles={["admin"]}>
                <Button type="button" size="sm" disabled={saving || !isAdmin || !readyToSave} onClick={onSave}>
                    {saving ? "Saving…" : connector ? "Save changes" : "Create connection"}
                </Button>
            </PermissionHint>
            {connector?.id ? (
                <span className="ml-auto inline-flex items-center gap-2">
                    {connector.paused ? (
                        <Button type="button" size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => onLifecycle("resume")}>
                            <Play aria-hidden="true" />
                            Resume
                        </Button>
                    ) : (
                        <Button type="button" size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => onLifecycle("pause")}>
                            <Pause aria-hidden="true" />
                            Pause
                        </Button>
                    )}
                    <HoldToConfirmButton type="button" size="sm" disabled={lifecycleBusy} onConfirm={() => onLifecycle("revoke")}>
                        Revoke credentials
                    </HoldToConfirmButton>
                </span>
            ) : null}
        </CardFooter>
    );
}
