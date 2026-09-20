/**
 * Admin connector editor — credential form, lifecycle controls, and webhook guidance.
 *
 * Host integration (TR-42) mounts this; until then it is consumed only by tests.
 * All provider I/O goes through the typed tracker client barrel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Link2, Pause, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
    TrackerApiError,
    createConnector,
    getConnector,
    pauseConnector,
    resumeConnector,
    revokeConnector,
    testConnector,
    updateConnector,
} from "@/lib/trackers-client";
import type { ConnectorTestResult, TrackerConnector } from "@/types/trackers";

export type ConnectorSettingsPhase = "loading" | "ready" | "empty" | "forbidden" | "offline" | "revoked";

export interface ConnectorCredentialFields {
    appId: string;
    installationId: string;
    privateKey: string;
}

export interface ConnectorSettingsProps {
    connectorId: string | null;
    isAdmin: boolean;
    /** Origin used to build the public webhook URL guidance (defaults to window.location.origin). */
    prismOrigin?: string;
    className?: string;
    onConnectorChange?: (connector: TrackerConnector) => void;
}

const EMPTY_CREDENTIALS: ConnectorCredentialFields = {
    appId: "",
    installationId: "",
    privateKey: "",
};

/** Frozen public webhook path for provider configuration guidance (TR-27 registers the route). */
export function connectorWebhookPublicUrl(connectorId: string, origin = ""): string {
    const base = (origin || "https://prism.example").replace(/\/$/, "");
    return `${base}/api/trackers/webhooks/${encodeURIComponent(connectorId)}`;
}

export function credentialRotationHint(configured: boolean): string {
    if (!configured) {
        return "Enter GitHub App credentials. Values are sent once to Prism and never echoed back.";
    }
    return "Credentials are stored on the server. Leave fields blank to keep the current secret; fill them to rotate.";
}

export function describeConnectorSettingsError(error: unknown, fallback = "Connector request failed"): string {
    if (error instanceof TrackerApiError) {
        if (error.isPermission) {
            return "Administrator access is required to manage tracker connectors.";
        }
        if (error.isRevoked) {
            return "Connector credentials were revoked. Install new credentials before resuming sync.";
        }
        return error.message || fallback;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

function credentialsPayload(fields: ConnectorCredentialFields): Record<string, string> | undefined {
    const appId = fields.appId.trim();
    const installationId = fields.installationId.trim();
    const privateKey = fields.privateKey.trim();
    if (!appId && !installationId && !privateKey) {
        return undefined;
    }
    return { appId, installationId, privateKey };
}

function connectorPhase(
    isAdmin: boolean,
    connector: TrackerConnector | null,
    loading: boolean,
    offline: boolean,
): ConnectorSettingsPhase {
    if (!isAdmin) return "forbidden";
    if (loading) return "loading";
    if (offline) return "offline";
    if (!connector) return "empty";
    if (!connector.credentialConfigured || connector.pausedReason === "auth") return "revoked";
    return "ready";
}

// react-doctor-disable-next-line no-giant-component - credential form, lifecycle actions and webhook guidance share one connector draft
export function ConnectorSettings({
    connectorId,
    isAdmin,
    prismOrigin,
    className,
    onConnectorChange,
// react-doctor-disable-next-line prefer-useReducer - loading, credentials and lifecycle flags are independent async surfaces
}: ConnectorSettingsProps) {
    const [connector, setConnector] = useState<TrackerConnector | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [instanceKind, setInstanceKind] = useState("github.com");
    const [credentials, setCredentials] = useState<ConnectorCredentialFields>(EMPTY_CREDENTIALS);
    const [loading, setLoading] = useState(Boolean(connectorId));
    const [offline, setOffline] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [lifecycleBusy, setLifecycleBusy] = useState(false);
    const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const phase = connectorPhase(isAdmin, connector, loading, offline);
    const webhookUrl = useMemo(
        () => (connector?.id ? connectorWebhookPublicUrl(connector.id, prismOrigin) : null),
        [connector?.id, prismOrigin],
    );

    const applyConnector = useCallback(
        (next: TrackerConnector, resetTest = false) => {
            setConnector(next);
            setDisplayName(next.displayName);
            setBaseUrl(next.baseUrl);
            setInstanceKind(next.instanceKind);
            setCredentials(EMPTY_CREDENTIALS);
            if (resetTest) {
                setTestResult(null);
            }
            onConnectorChange?.(next);
        },
        [onConnectorChange],
    );

    useEffect(() => {
        if (!isAdmin || !connectorId) {
            setConnector(null);
            setLoading(false);
            setOffline(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setOffline(false);
        setFormError(null);
        void getConnector(connectorId)
            .then((loaded) => {
                if (!cancelled) applyConnector(loaded);
            })
            .catch((error) => {
                if (cancelled) return;
                setConnector(null);
                setOffline(true);
                setFormError(describeConnectorSettingsError(error));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [applyConnector, connectorId, isAdmin]);

    const saveConnector = async () => {
        if (!isAdmin) return;
        setSaving(true);
        setFormError(null);
        try {
            const payload = {
                displayName: displayName.trim(),
                baseUrl: baseUrl.trim(),
                credentials: credentialsPayload(credentials),
            };
            const saved = connector?.id
                ? await updateConnector(connector.id, payload)
                : await createConnector({
                      provider: "github",
                      instanceKind: instanceKind.trim() || "github.com",
                      displayName: displayName.trim() || "GitHub",
                      baseUrl: baseUrl.trim(),
                      credentials: credentialsPayload(credentials) ?? {
                          appId: credentials.appId,
                          installationId: credentials.installationId,
                          privateKey: credentials.privateKey,
                      },
                  });
            applyConnector(saved, true);
            toast.success(connector?.id ? "Connector updated." : "Connector created.");
        } catch (error) {
            setFormError(describeConnectorSettingsError(error));
        } finally {
            setSaving(false);
        }
    };

    const runTest = async () => {
        if (!connector?.id) return;
        setTesting(true);
        setFormError(null);
        try {
            const response = await testConnector(connector.id);
            setTestResult(response.test);
            if (response.test.ok) {
                toast.success("Connection test succeeded.");
            } else {
                toast.error(response.test.pausedReason ?? "Connection test failed.");
            }
            applyConnector(response);
        } catch (error) {
            setFormError(describeConnectorSettingsError(error, "Connection test failed"));
        } finally {
            setTesting(false);
        }
    };

    const runLifecycle = async (action: "pause" | "resume" | "revoke") => {
        if (!connector?.id) return;
        setLifecycleBusy(true);
        setFormError(null);
        try {
            const fn = action === "pause" ? pauseConnector : action === "resume" ? resumeConnector : revokeConnector;
            const updated = await fn(connector.id);
            applyConnector(updated);
            toast.success(
                action === "pause"
                    ? "Connector paused."
                    : action === "resume"
                        ? "Connector resumed."
                        : "Connector revoked.",
            );
        } catch (error) {
            setFormError(describeConnectorSettingsError(error));
        } finally {
            setLifecycleBusy(false);
        }
    };

    const copyWebhook = async () => {
        if (!webhookUrl) return;
        try {
            await navigator.clipboard.writeText(webhookUrl);
            toast.success("Webhook URL copied.");
        } catch {
            toast.error("Could not copy webhook URL.");
        }
    };

    if (phase === "forbidden") {
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

    if (phase === "loading") {
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

    if (phase === "offline") {
        return (
            <Card className={className} data-tracker-phase="offline">
                <CardHeader>
                    <CardTitle>Tracker connector</CardTitle>
                    <CardDescription>Could not reach Prism. Check your network and try again.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-destructive" role="alert">{formError}</p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                            if (connectorId) {
                                setLoading(true);
                                setOffline(false);
                                void getConnector(connectorId)
                                    .then(applyConnector)
                                    .catch((error) => {
                                        setOffline(true);
                                        setFormError(describeConnectorSettingsError(error));
                                    })
                                    .finally(() => setLoading(false));
                            }
                        }}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={className} data-tracker-phase={phase}>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    {connector ? connector.displayName : "New tracker connector"}
                    {connector?.paused ? <Badge variant="warning">Paused</Badge> : null}
                    {phase === "revoked" ? <Badge variant="destructive">Revoked</Badge> : null}
                </CardTitle>
                <CardDescription>
                    Configure encrypted GitHub App credentials. Secrets are write-only and never echoed after save.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {formError ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                        {formError}
                    </p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-display-name">Display name</Label>
                        <Input
                            id="tracker-display-name"
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            placeholder="GitHub.com"
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-instance-kind">Instance</Label>
                        <Input
                            id="tracker-instance-kind"
                            value={instanceKind}
                            onChange={(event) => setInstanceKind(event.target.value)}
                            placeholder="github.com"
                            autoComplete="off"
                            disabled={Boolean(connector?.id)}
                        />
                    </div>
                </div>

                {instanceKind !== "github.com" ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-base-url">API base URL (GHES)</Label>
                        <Input
                            id="tracker-base-url"
                            value={baseUrl}
                            onChange={(event) => setBaseUrl(event.target.value)}
                            placeholder="https://ghe.example.com/api/v3"
                            autoComplete="off"
                        />
                    </div>
                ) : null}

                <fieldset className="space-y-3 rounded-md border border-border p-3">
                    <legend className="px-1 text-sm font-medium">App credentials</legend>
                    <p className="text-xs text-muted-foreground">{credentialRotationHint(Boolean(connector?.credentialConfigured))}</p>
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-app-id">App ID</Label>
                        <Input
                            id="tracker-app-id"
                            value={credentials.appId}
                            onChange={(event) => setCredentials((prev) => ({ ...prev, appId: event.target.value }))}
                            placeholder={connector?.credentialConfigured ? "Leave blank to keep stored value" : "123456"}
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-installation-id">Installation ID</Label>
                        <Input
                            id="tracker-installation-id"
                            value={credentials.installationId}
                            onChange={(event) =>
                                setCredentials((prev) => ({ ...prev, installationId: event.target.value }))
                            }
                            placeholder={connector?.credentialConfigured ? "Leave blank to keep stored value" : "987654"}
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-private-key">Private key (PEM)</Label>
                        <Textarea
                            id="tracker-private-key"
                            value={credentials.privateKey}
                            onChange={(event) =>
                                setCredentials((prev) => ({ ...prev, privateKey: event.target.value }))
                            }
                            placeholder={connector?.credentialConfigured ? "Leave blank to keep stored PEM" : "-----BEGIN RSA PRIVATE KEY-----"}
                            className="min-h-24 font-mono text-xs"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                </fieldset>

                {connector?.id ? (
                    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Link2 className="h-4 w-4" aria-hidden="true" />
                            Public webhook endpoint
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Configure your forge to POST signed events to this publicly reachable Prism URL. The route is
                            unauthenticated; verification uses the webhook secret stored with the connector.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs">{webhookUrl}</code>
                            <Button type="button" size="sm" variant="outline" onClick={() => void copyWebhook()}>
                                <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                                Copy URL
                            </Button>
                        </div>
                    </div>
                ) : null}

                {testResult ? (
                    <div
                        className="rounded-md border border-border px-3 py-2 text-sm"
                        data-testid="connector-test-result"
                        aria-live="polite"
                    >
                        <p>
                            Test {testResult.ok ? "succeeded" : "failed"}
                            {testResult.bot?.login ? ` — bot ${testResult.bot.login}` : ""}
                        </p>
                        {testResult.visibility ? (
                            <p className="text-xs text-muted-foreground">Visibility: {testResult.visibility}</p>
                        ) : null}
                    </div>
                ) : null}
            </CardContent>

            <CardFooter className="flex flex-wrap gap-2 border-t">
                <PermissionHint blocked={!isAdmin} action="manage tracker connectors" allowedRoles={["admin"]}>
                    <Button type="button" disabled={saving || !isAdmin} onClick={() => void saveConnector()}>
                        {saving ? "Saving…" : connector ? "Save changes" : "Create connector"}
                    </Button>
                </PermissionHint>

                {connector?.id ? (
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={testing || lifecycleBusy}
                            onClick={() => void runTest()}
                        >
                            {testing ? "Testing…" : "Test connection"}
                        </Button>
                        {connector.paused ? (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={lifecycleBusy}
                                onClick={() => void runLifecycle("resume")}
                            >
                                <Play className="mr-1 h-4 w-4" aria-hidden="true" />
                                Resume
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={lifecycleBusy}
                                onClick={() => void runLifecycle("pause")}
                            >
                                <Pause className="mr-1 h-4 w-4" aria-hidden="true" />
                                Pause
                            </Button>
                        )}
                        <HoldToConfirmButton
                            type="button"
                            disabled={lifecycleBusy}
                            onConfirm={() => void runLifecycle("revoke")}
                        >
                            Revoke credentials
                        </HoldToConfirmButton>
                    </>
                ) : null}
            </CardFooter>
        </Card>
    );
}
