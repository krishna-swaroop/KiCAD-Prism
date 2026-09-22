/**
 * Admin connector editor — credential form, lifecycle controls, and webhook guidance.
 *
 * Mounted in the tracker administration surface. Provider I/O goes through
 * the typed tracker client barrel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type * as React from "react";
import { Activity, ChevronDown, ChevronUp, Copy, KeyRound, Loader2, Pause, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

/**
 * Public webhook path for provider configuration guidance (TR-27 registers
 * `/api/trackers/webhooks/{provider}/{connectorId}`). Prefer the server-computed
 * `connector.webhookUrl`, which is derived from PUBLIC_BASE_URL — the origin the
 * forge has to reach — rather than the admin's browser origin.
 */
export function connectorWebhookPublicUrl(connectorId: string, origin = "", provider = "github"): string {
    const base = (origin || "https://prism.example").replace(/\/$/, "");
    return `${base}/api/trackers/webhooks/${encodeURIComponent(provider)}/${encodeURIComponent(connectorId)}`;
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
    const [retryVersion, setRetryVersion] = useState(0);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [lifecycleBusy, setLifecycleBusy] = useState(false);
    const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [oauthOpen, setOauthOpen] = useState(false);

    const phase = connectorPhase(isAdmin, connector, loading, offline);
    const webhookUrl = useMemo(() => {
        if (!connector?.id) return null;
        if (connector.webhookUrl) return connector.webhookUrl;
        return connectorWebhookPublicUrl(connector.id, prismOrigin, connector.provider);
    }, [connector?.id, connector?.provider, connector?.webhookUrl, prismOrigin]);

    const oauthCallbackUrl = useMemo(() => {
        if (!webhookUrl) return null;
        try {
            return `${new URL(webhookUrl).origin}/api/trackers/oauth/callback`;
        } catch {
            return null;
        }
    }, [webhookUrl]);

    const applyConnector = useCallback(
        (next: TrackerConnector, resetTest = false) => {
            setConnector(next);
            setDisplayName(next.displayName);
            setBaseUrl(next.baseUrl);
            setInstanceKind(next.instanceKind);
            setCredentials(EMPTY_CREDENTIALS);
            if (next.oauthClientConfigured) setOauthOpen(true);
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
                        onClick={() => setRetryVersion((version) => version + 1)}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const stored = Boolean(connector?.credentialConfigured);
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

                <FormSection
                    step={1}
                    title="Connection"
                    description="How this connection is shown in Prism and which GitHub it talks to."
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-display-name">Display name</Label>
                            <Input
                                id="tracker-display-name"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                placeholder="GitHub"
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-instance-kind">Instance</Label>
                            <Select
                                value={instanceKind === "github.com" ? "github.com" : "ghes"}
                                onValueChange={(value) => setInstanceKind(value === "ghes" ? "ghes" : "github.com")}
                                disabled={Boolean(connector?.id)}
                            >
                                <SelectTrigger id="tracker-instance-kind" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="github.com">github.com</SelectItem>
                                    <SelectItem value="ghes">GitHub Enterprise Server</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {instanceKind !== "github.com" ? (
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-base-url">API base URL</Label>
                            <Input
                                id="tracker-base-url"
                                value={baseUrl}
                                onChange={(event) => setBaseUrl(event.target.value)}
                                placeholder="https://ghe.example.com/api/v3"
                                autoComplete="off"
                            />
                        </div>
                    ) : null}
                </FormSection>

                <Separator />

                <fieldset className="space-y-3">
                    <legend className="sr-only">GitHub App installation</legend>
                    <SectionHeading
                        step={2}
                        title="GitHub App installation"
                        description={credentialRotationHint(stored)}
                        trailing={stored ? <Badge variant="success">Stored</Badge> : <Badge variant="secondary">Required</Badge>}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-app-id">App ID</Label>
                            <Input
                                id="tracker-app-id"
                                value={credentials.appId}
                                onChange={(event) => setCredentials((prev) => ({ ...prev, appId: event.target.value }))}
                                placeholder={stored ? "Leave blank to keep stored value" : "123456"}
                                autoComplete="off"
                                inputMode="numeric"
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
                                placeholder={stored ? "Leave blank to keep stored value" : "987654"}
                                autoComplete="off"
                                inputMode="numeric"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-private-key">Private key (PEM)</Label>
                        <Textarea
                            id="tracker-private-key"
                            value={credentials.privateKey}
                            onChange={(event) =>
                                setCredentials((prev) => ({ ...prev, privateKey: event.target.value }))
                            }
                            placeholder={stored ? "Leave blank to keep stored PEM" : "Paste the contents of the downloaded .pem file"}
                            className="min-h-24 font-mono text-[11px]"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Generated under the App&apos;s settings on GitHub; the App needs Issues: read &amp; write and Metadata: read.
                        </p>
                    </div>
                    {connector?.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={testing || lifecycleBusy}
                                onClick={() => void runTest()}
                            >
                                {testing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Activity aria-hidden="true" />}
                                {testing ? "Testing…" : "Test connection"}
                            </Button>
                            {testResult ? (
                                <span className="text-xs" data-testid="connector-test-result" aria-live="polite">
                                    Test {testResult.ok ? "succeeded" : "failed"}
                                    {testResult.bot?.login ? ` — publishes as ${testResult.bot.login}` : ""}
                                    {testResult.visibility ? ` · ${testResult.visibility}` : ""}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </fieldset>

                <Separator />

                <FormSection
                    step={3}
                    title="Webhook"
                    description="Lets GitHub push changes instantly; without it Prism polls every few minutes."
                    trailing={connector?.webhookConfigured ? <Badge variant="success">Configured</Badge> : <Badge variant="secondary">Optional</Badge>}
                >
                    {connector?.id ? (
                        <div className="space-y-1.5">
                            <Label>Public webhook endpoint</Label>
                            <div className="flex items-center gap-2">
                                <code className="min-w-0 flex-1 truncate border border-input bg-muted/40 px-2 py-1.5 font-mono text-[11px]" title={webhookUrl ?? undefined}>
                                    {webhookUrl}
                                </code>
                                <Button type="button" size="sm" variant="outline" onClick={() => void copyWebhook()}>
                                    <Copy aria-hidden="true" />
                                    Copy URL
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                In the App&apos;s settings, set this as the webhook URL, subscribe to <em>Issues</em> and{" "}
                                <em>Issue comment</em>, and paste the same secret below.
                            </p>
                        </div>
                    ) : (
                        <p className="text-[11px] text-muted-foreground">
                            The endpoint URL appears here after the connection is created.
                        </p>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-webhook-secret">Webhook secret</Label>
                        <Input
                            id="tracker-webhook-secret"
                            type="password"
                            value={credentials.webhookSecret}
                            onChange={(event) =>
                                setCredentials((prev) => ({ ...prev, webhookSecret: event.target.value }))
                            }
                            placeholder={connector?.webhookConfigured ? "Leave blank to keep stored value" : "Any long random string"}
                            autoComplete="off"
                        />
                    </div>
                </FormSection>

                <Separator />

                <Collapsible open={oauthOpen} onOpenChange={setOauthOpen}>
                    <div className="flex items-start justify-between gap-3">
                        <SectionHeading
                            step={4}
                            title="Member sign-in"
                            description="Optional. Lets teammates link their GitHub account so @mentions become assignees."
                            trailing={connector?.oauthClientConfigured ? <Badge variant="success">Enabled</Badge> : <Badge variant="secondary">Optional</Badge>}
                        />
                        <CollapsibleTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={oauthOpen ? "Hide member sign-in fields" : "Show member sign-in fields"}>
                                {oauthOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="mt-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="tracker-oauth-client-id">OAuth client ID</Label>
                                <Input
                                    id="tracker-oauth-client-id"
                                    value={credentials.oauthClientId}
                                    onChange={(event) =>
                                        setCredentials((prev) => ({ ...prev, oauthClientId: event.target.value }))
                                    }
                                    placeholder={connector?.oauthClientConfigured ? "Leave blank to keep stored value" : "Ov23li…"}
                                    autoComplete="off"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="tracker-oauth-client-secret">OAuth client secret</Label>
                                <Input
                                    id="tracker-oauth-client-secret"
                                    type="password"
                                    value={credentials.oauthClientSecret}
                                    onChange={(event) =>
                                        setCredentials((prev) => ({ ...prev, oauthClientSecret: event.target.value }))
                                    }
                                    placeholder={connector?.oauthClientConfigured ? "Leave blank to keep stored value" : "Client secret"}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Use the App&apos;s own client ID and secret. The callback URL is{" "}
                            <code className="font-mono">{oauthCallbackUrl ?? "…/api/trackers/oauth/callback"}</code>.
                        </p>
                    </CollapsibleContent>
                </Collapsible>
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

function SectionHeading({
    step,
    title,
    description,
    trailing,
}: {
    step: number;
    title: string;
    description: string;
    trailing?: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground"
                aria-hidden="true"
            >
                {step}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">{title}</h4>
                    {trailing}
                </div>
                <p className="text-[11px] text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

function FormSection({
    step,
    title,
    description,
    trailing,
    children,
}: {
    step: number;
    title: string;
    description: string;
    trailing?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <SectionHeading step={step} title={title} description={description} trailing={trailing} />
            {children}
        </section>
    );
}
