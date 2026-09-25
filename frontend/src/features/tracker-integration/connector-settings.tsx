/**
 * Admin connector editor — credential form, lifecycle controls, and webhook guidance.
 *
 * Mounted in the tracker administration surface. Provider I/O goes through
 * the typed tracker client barrel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ConnectorIdentitySettings, isSelfHostedInstance } from "./connector-identity-settings";
import { ConnectorInstallationSettings } from "./connector-installation-settings";
import { ConnectorTokenSettings } from "./connector-token-settings";
import {
    ConnectorForbiddenCard,
    ConnectorLifecycleFooter,
    ConnectorLoadingCard,
    ConnectorOfflineCard,
} from "./connector-settings-parts";

export { connectorWebhookPublicUrl } from "./connector-delivery-settings";

export type ConnectorSettingsPhase = "loading" | "ready" | "empty" | "forbidden" | "offline" | "revoked";

/** Code hosts that publish issues and share this editor. */
export type IssueHostProvider = "github" | "gitlab";

export interface ConnectorCredentialFields {
    accessToken: string;
    appId: string;
    installationId: string;
    privateKey: string;
    webhookSecret: string;
    oauthClientId: string;
    oauthClientSecret: string;
}

export interface ConnectorSettingsProps {
    connectorId: string | null;
    /** Which host a new connection is for; an existing one reports its own. */
    provider?: IssueHostProvider;
    isAdmin: boolean;
    /** Origin used to build the public webhook URL guidance (defaults to window.location.origin). */
    prismOrigin?: string;
    className?: string;
    onConnectorChange?: (connector: TrackerConnector) => void;
}

/** Step-by-step GitHub App registration for deployers. */
const DOCS = "https://github.com/krishna-swaroop/KiCAD-Prism/blob/dev/docs";
const SETUP_GUIDE: Record<IssueHostProvider, string> = {
    github: `${DOCS}/GITHUB_APP_SETUP.md`,
    gitlab: `${DOCS}/GITLAB_SETUP.md`,
};
const DEFAULT_INSTANCE: Record<IssueHostProvider, string> = { github: "github.com", gitlab: "gitlab.com" };
const PROVIDER_NAME: Record<IssueHostProvider, string> = { github: "GitHub", gitlab: "GitLab" };

const EMPTY_CREDENTIALS: ConnectorCredentialFields = {
    accessToken: "",
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

/** Only the fields the admin filled in; blank fields keep their stored values. */
function credentialsPayload(fields: ConnectorCredentialFields): Record<string, string> | undefined {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value.trim()) payload[key] = value.trim();
    }
    return Object.keys(payload).length ? payload : undefined;
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
    if (connector.pausedReason === "auth" || connector.pausedReason === "revoked") return "revoked";
    // A GitHub connection is its App; a GitLab one may exist for account linking alone.
    if (connector.provider === "github" && !connector.credentialConfigured) return "revoked";
    return "ready";
}

export function ConnectorSettings({
    connectorId,
    provider: requestedProvider = "github",
    isAdmin,
    prismOrigin,
    className,
    onConnectorChange,
// react-doctor-disable-next-line prefer-useReducer - loading, credentials and lifecycle flags are independent async surfaces
}: ConnectorSettingsProps) {
    const [connector, setConnector] = useState<TrackerConnector | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [instanceKind, setInstanceKind] = useState(DEFAULT_INSTANCE[requestedProvider]);
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
    const provider: IssueHostProvider = connector?.provider === "gitlab" ? "gitlab" : connector ? "github" : requestedProvider;
    const selfHosted = isSelfHostedInstance(provider, instanceKind);

    // The host may pass a new callback on every render. Reading it through a
    // ref keeps the load effect below from re-running (and re-notifying the
    // host) each time, which otherwise loops forever.
    const onConnectorChangeRef = useRef(onConnectorChange);
    useEffect(() => {
        onConnectorChangeRef.current = onConnectorChange;
    }, [onConnectorChange]);

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
            onConnectorChangeRef.current?.(next);
        },
        [],
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
                      provider,
                      instanceKind: instanceKind.trim() || DEFAULT_INSTANCE[provider],
                      displayName: displayName.trim() || PROVIDER_NAME[provider],
                      baseUrl: selfHosted ? baseUrl.trim() : "",
                      credentials: credentialsPayload(credentials) ?? {},
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

    if (phase === "forbidden") return <ConnectorForbiddenCard className={className} />;
    if (phase === "loading") return <ConnectorLoadingCard className={className} />;
    if (phase === "offline") {
        return (
            <ConnectorOfflineCard
                className={className}
                error={formError}
                onRetry={() => setRetryVersion((version) => version + 1)}
            />
        );
    }

    const readyToSave = connector
        ? true
        : provider === "gitlab"
          // A GitLab connection can start with account linking only; the token can come later.
          ? !selfHosted || /^https:\/\/[^/]+/.test(baseUrl.trim())
          : Boolean(credentials.appId.trim() && credentials.installationId.trim() && credentials.privateKey.trim());

    return (
        <Card className={cn("gap-0 py-0", className)} data-tracker-phase={phase}>
            <CardHeader className="border-b py-3">
                <CardTitle className="flex flex-wrap items-center gap-2">
                    <KeyRound className="size-4" aria-hidden="true" />
                    {connector ? connector.displayName : `New ${PROVIDER_NAME[provider]} connection`}
                    {connector?.paused ? <Badge variant="warning">Paused</Badge> : null}
                    {phase === "revoked" ? <Badge variant="destructive">Revoked</Badge> : null}
                    <a
                        href={SETUP_GUIDE[provider]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-primary underline-offset-2 hover:underline"
                    >
                        Setup guide
                        <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5 py-4">
                {formError ? (
                    <Alert variant="destructive">
                        <ShieldAlert />
                        <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                ) : null}

                <ConnectorIdentitySettings
                    provider={provider}
                    connectorId={connector?.id}
                    displayName={displayName}
                    setDisplayName={setDisplayName}
                    instanceKind={instanceKind}
                    setInstanceKind={setInstanceKind}
                    baseUrl={baseUrl}
                    setBaseUrl={setBaseUrl}
                />

                <Separator />

                {provider === "gitlab" ? (
                    <ConnectorTokenSettings
                        connector={connector}
                        credentials={credentials}
                        setCredentials={setCredentials}
                        testing={testing}
                        lifecycleBusy={lifecycleBusy}
                        testResult={testResult}
                        onTest={runTest}
                    />
                ) : (
                    <ConnectorInstallationSettings
                        connector={connector}
                        credentials={credentials}
                        setCredentials={setCredentials}
                        testing={testing}
                        lifecycleBusy={lifecycleBusy}
                        testResult={testResult}
                        onTest={runTest}
                    />
                )}

                <Separator />

                <ConnectorDeliverySettings
                    key={`${connector?.id ?? "new"}:${Boolean(connector?.oauthClientConfigured)}`}
                    provider={provider}
                    connector={connector}
                    credentials={credentials}
                    setCredentials={setCredentials}
                    prismOrigin={prismOrigin}
                />
            </CardContent>

            <ConnectorLifecycleFooter
                connector={connector}
                isAdmin={isAdmin}
                saving={saving}
                readyToSave={readyToSave}
                lifecycleBusy={lifecycleBusy}
                onSave={() => void saveConnector()}
                onLifecycle={(action) => void runLifecycle(action)}
            />
        </Card>
    );
}
