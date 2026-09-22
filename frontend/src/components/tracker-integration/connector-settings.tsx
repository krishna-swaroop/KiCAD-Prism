/**
 * Admin connector editor — credential form, lifecycle controls, and webhook guidance.
 *
 * Mounted in the tracker administration surface. Provider I/O goes through
 * the typed tracker client barrel.
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pause, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ConnectorDeliverySettings } from "./connector-delivery-settings";
import { ConnectorIdentitySettings } from "./connector-identity-settings";
import { ConnectorInstallationSettings } from "./connector-installation-settings";

export { connectorWebhookPublicUrl } from "./connector-delivery-settings";

export type ConnectorSettingsPhase = "loading" | "ready" | "empty" | "forbidden" | "offline" | "revoked";

export interface ConnectorCredentialFields {
    appId: string;
    installationId: string;
    privateKey: string;
    webhookSecret: string;
    oauthClientId: string;
    oauthClientSecret: string;
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
    webhookSecret: "",
    oauthClientId: "",
    oauthClientSecret: "",
};

export { credentialRotationHint } from "./connector-installation-settings";

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
    const webhookSecret = fields.webhookSecret.trim();
    const oauthClientId = fields.oauthClientId.trim();
    const oauthClientSecret = fields.oauthClientSecret.trim();
    if (!appId && !installationId && !privateKey && !webhookSecret && !oauthClientId && !oauthClientSecret) {
        return undefined;
    }
    const payload: Record<string, string> = {};
    if (appId) payload.appId = appId;
    if (installationId) payload.installationId = installationId;
    if (privateKey) payload.privateKey = privateKey;
    if (webhookSecret) payload.webhookSecret = webhookSecret;
    if (oauthClientId) payload.oauthClientId = oauthClientId;
    if (oauthClientSecret) payload.oauthClientSecret = oauthClientSecret;
    return payload;
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
    const [retryVersion, setRetryVersion] = useState(0);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [lifecycleBusy, setLifecycleBusy] = useState(false);
    const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const phase = connectorPhase(isAdmin, connector, loading, offline);

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
    }, [applyConnector, connectorId, isAdmin, retryVersion]);

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
                        onClick={() => setRetryVersion((version) => version + 1)}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const readyToSave = connector
        ? true
        : Boolean(credentials.appId.trim() && credentials.installationId.trim() && credentials.privateKey.trim());

    return (
        <Card className={cn("gap-0 py-0", className)} data-tracker-phase={phase}>
            <CardHeader className="border-b py-3">
                <CardTitle className="flex flex-wrap items-center gap-2">
                    <KeyRound className="size-4" aria-hidden="true" />
                    {connector ? connector.displayName : "New GitHub connection"}
                    {connector?.paused ? <Badge variant="warning">Paused</Badge> : null}
                    {phase === "revoked" ? <Badge variant="destructive">Revoked</Badge> : null}
                </CardTitle>
                <CardDescription>
                    Credentials are encrypted on the server and never shown again. Leave a stored field blank to keep it.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 py-4">
                {formError ? (
                    <Alert variant="destructive">
                        <ShieldAlert />
                        <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                ) : null}

                <ConnectorIdentitySettings
                    connectorId={connector?.id}
                    displayName={displayName}
                    setDisplayName={setDisplayName}
                    instanceKind={instanceKind}
                    setInstanceKind={setInstanceKind}
                    baseUrl={baseUrl}
                    setBaseUrl={setBaseUrl}
                />

                <Separator />

                <ConnectorInstallationSettings
                    connector={connector}
                    credentials={credentials}
                    setCredentials={setCredentials}
                    testing={testing}
                    lifecycleBusy={lifecycleBusy}
                    testResult={testResult}
                    onTest={runTest}
                />

                <Separator />

                <ConnectorDeliverySettings
                    key={`${connector?.id ?? "new"}:${Boolean(connector?.oauthClientConfigured)}`}
                    connector={connector}
                    credentials={credentials}
                    setCredentials={setCredentials}
                    prismOrigin={prismOrigin}
                />
            </CardContent>

            <CardFooter className="flex flex-wrap items-center gap-2 border-t py-3">
                <PermissionHint blocked={!isAdmin} action="manage tracker connectors" allowedRoles={["admin"]}>
                    <Button type="button" size="sm" disabled={saving || !isAdmin || !readyToSave} onClick={() => void saveConnector()}>
                        {saving ? "Saving…" : connector ? "Save changes" : "Create connection"}
                    </Button>
                </PermissionHint>
                {connector?.id ? (
                    <span className="ml-auto inline-flex items-center gap-2">
                        {connector.paused ? (
                            <Button type="button" size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => void runLifecycle("resume")}>
                                <Play aria-hidden="true" />
                                Resume
                            </Button>
                        ) : (
                            <Button type="button" size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => void runLifecycle("pause")}>
                                <Pause aria-hidden="true" />
                                Pause
                            </Button>
                        )}
                        <HoldToConfirmButton
                            type="button"
                            size="sm"
                            disabled={lifecycleBusy}
                            onConfirm={() => void runLifecycle("revoke")}
                        >
                            Revoke credentials
                        </HoldToConfirmButton>
                    </span>
                ) : null}
            </CardFooter>
        </Card>
    );
}
