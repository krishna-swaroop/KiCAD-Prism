/**
 * Admin connector health panel — webhook/poll/sweep timestamps, backlog and limits.
 *
 * Values come from Prism worker state via getConnectorHealth; the browser never
 * calls a forge host. Host integration mounts this in TR-42.
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock, RefreshCw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getConnectorHealth, TrackerApiError } from "@/lib/trackers-client";
import type { ConnectorHealth, ProviderErrorDto } from "@/types/trackers";

export type ConnectorHealthPhase = "loading" | "ready" | "forbidden" | "offline" | "rate_limited";

export interface ConnectorHealthPanelProps {
    connectorId: string;
    isAdmin: boolean;
    className?: string;
    onHealthChange?: (health: ConnectorHealth) => void;
}

const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

export function formatIsoTimestamp(value?: string | null): string {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

export function formatIsoDuration(value?: string | null): string {
    if (!value) return "—";
    const match = ISO_DURATION.exec(value);
    if (!match) return value;
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2] ?? 0);
    const seconds = Number(match[3] ?? 0);
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
}

export function healthIsRateLimited(health: ConnectorHealth): boolean {
    if (health.rateLimitResumeAt) {
        const resume = new Date(health.rateLimitResumeAt);
        return !Number.isNaN(resume.getTime()) && resume.getTime() > Date.now();
    }
    return health.lastError?.class === "rate_limited";
}

export function healthStatusLabel(health: ConnectorHealth): { label: string; variant: "success" | "warning" | "destructive" } {
    if (healthIsRateLimited(health)) {
        return { label: "Rate limited", variant: "warning" };
    }
    if (health.degraded || health.failedOps > 0 || health.quarantinedOps > 0) {
        return { label: "Degraded", variant: "warning" };
    }
    if (health.paused) {
        return { label: "Paused", variant: "destructive" };
    }
    return { label: "Healthy", variant: "success" };
}

export function describeHealthError(error: unknown, fallback = "Failed to load connector health"): string {
    if (error instanceof TrackerApiError) {
        if (error.isPermission) {
            return "Administrator access is required to view connector health.";
        }
        return error.message || fallback;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
        </div>
    );
}

function ProviderErrorBanner({ error }: { error: ProviderErrorDto }) {
    return (
        <div
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            role="alert"
            data-provider-class={error.class}
        >
            <p className="font-medium">{error.class.replace(/_/g, " ")}</p>
            <p className="text-xs">{error.message}</p>
            {error.resumeAt ? (
                <p className="mt-1 text-xs text-muted-foreground">Resume after {formatIsoTimestamp(error.resumeAt)}</p>
            ) : null}
        </div>
    );
}

export function ConnectorHealthPanel({
    connectorId,
    isAdmin,
    className,
    onHealthChange,
}: ConnectorHealthPanelProps) {
    const [health, setHealth] = useState<ConnectorHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        setOffline(false);
        setErrorMessage(null);
        try {
            const next = await getConnectorHealth(connectorId);
            setHealth(next);
            onHealthChange?.(next);
        } catch (error) {
            setHealth(null);
            setOffline(true);
            setErrorMessage(describeHealthError(error));
        } finally {
            setLoading(false);
        }
    }, [connectorId, isAdmin, onHealthChange]);

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }
        void load();
    }, [isAdmin, load]);

    if (!isAdmin) {
        return (
            <Card className={cn("border-dashed", className)} data-tracker-phase="forbidden">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                        Connector health
                    </CardTitle>
                    <CardDescription>Administrator access is required to view sync health.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loading) {
        return (
            <Card className={className} data-tracker-phase="loading" aria-busy="true">
                <CardHeader>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-2 h-4 w-56" />
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (offline || !health) {
        return (
            <Card className={className} data-tracker-phase="offline">
                <CardHeader>
                    <CardTitle>Connector health</CardTitle>
                    <CardDescription>Could not load health metrics.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-destructive" role="alert">{errorMessage}</p>
                    <Button type="button" variant="outline" className="mt-3" onClick={() => void load()}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const status = healthStatusLabel(health);
    const phase: ConnectorHealthPhase = healthIsRateLimited(health) ? "rate_limited" : "ready";

    return (
        <Card className={className} data-tracker-phase={phase}>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                    <Activity className="h-4 w-4" aria-hidden="true" />
                    Connector health
                    <Badge variant={status.variant}>{status.label}</Badge>
                </CardTitle>
                <CardDescription>
                    Last webhook, poll, and sweep times reflect worker checkpoints — not live forge calls from the browser.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {healthIsRateLimited(health) ? (
                    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="alert">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                        <div>
                            <p className="font-medium text-warning">Rate limited</p>
                            <p className="text-xs text-muted-foreground">
                                Sync resumes after {formatIsoTimestamp(health.rateLimitResumeAt ?? health.lastError?.resumeAt)}
                            </p>
                        </div>
                    </div>
                ) : null}

                {health.lastError ? <ProviderErrorBanner error={health.lastError} /> : null}

                <dl className="grid gap-2 sm:grid-cols-3">
                    <Metric label="Last webhook" value={formatIsoTimestamp(health.lastWebhookAt)} />
                    <Metric label="Last poll" value={formatIsoTimestamp(health.lastPollAt)} />
                    <Metric label="Last sweep" value={formatIsoTimestamp(health.lastSweepAt)} />
                </dl>

                <dl className="grid gap-2 sm:grid-cols-4">
                    <Metric label="Pending ops" value={health.pendingOps} />
                    <Metric label="Sent ops" value={health.sentOps} />
                    <Metric label="Failed ops" value={health.failedOps} />
                    <Metric label="Quarantined" value={health.quarantinedOps} />
                </dl>

                <dl className="grid gap-2 sm:grid-cols-2">
                    <Metric label="Oldest pending op" value={formatIsoDuration(health.oldestPendingOpAge)} />
                    <Metric label="Oldest unapplied hint" value={formatIsoDuration(health.oldestUnappliedHintAge)} />
                </dl>

                {health.degraded ? (
                    <div className="flex items-center gap-2 text-sm text-warning" role="status">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        Worker reported degraded reconciliation. Check failed or quarantined operations.
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
