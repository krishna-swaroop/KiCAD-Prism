/**
 * Personal connected-account settings — link, reconnect, and unlink forge identities.
 *
 * Host integration (TR-42) mounts this in workspace settings; until then it is
 * consumed only by tests. All provider I/O goes through the typed tracker barrel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCw, ShieldAlert, Unlink, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
    TrackerApiError,
    beginIdentityLink,
    listIdentities,
    unlinkIdentity,
} from "@/lib/trackers-client";
import type { IdentityStatus, UserIdentity } from "@/types/trackers";

export type ConnectedAccountsPhase = "loading" | "ready" | "empty" | "forbidden" | "offline";

/** Connector summary supplied by the settings host — no admin list API for session users. */
export interface LinkableConnector {
    id: string;
    provider: string;
    displayName: string;
    instanceKind: string;
}

export interface ConnectedAccountsProps {
    /** Connectors the workspace exposes for personal linking. */
    linkableConnectors: LinkableConnector[];
    /** Session auth is required to link or unlink accounts. */
    isSessionUser: boolean;
    /** Settings location to reopen after OAuth (stored client-side before redirect). */
    returnPath?: string;
    /** OAuth callback query string; defaults to `window.location.search` for host mounts. */
    oauthCallbackSearch?: string;
    className?: string;
    onIdentitiesChange?: (identities: UserIdentity[]) => void;
}

export const TRACKER_OAUTH_RETURN_KEY = "prism-tracker-oauth-return";
export const TRACKER_OAUTH_RESULT_PARAM = "tracker_oauth";
export const TRACKER_OAUTH_ERROR_PARAM = "tracker_oauth_error";

export function storeOAuthReturnPath(path: string): void {
    if (!path.trim()) return;
    try {
        sessionStorage.setItem(TRACKER_OAUTH_RETURN_KEY, path);
    } catch {
        // Storage may be unavailable in private mode; linking still works.
    }
}

export function consumeOAuthReturnPath(): string | null {
    try {
        const stored = sessionStorage.getItem(TRACKER_OAUTH_RETURN_KEY);
        if (stored) {
            sessionStorage.removeItem(TRACKER_OAUTH_RETURN_KEY);
        }
        return stored;
    } catch {
        return null;
    }
}

export interface OAuthCallbackSearch {
    result: "linked" | "error" | null;
    errorCode: string | null;
}

export function parseOAuthCallbackSearch(search: string): OAuthCallbackSearch {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const raw = params.get(TRACKER_OAUTH_RESULT_PARAM);
    const result = raw === "linked" || raw === "error" ? raw : null;
    return {
        result,
        errorCode: params.get(TRACKER_OAUTH_ERROR_PARAM),
    };
}

export function clearOAuthCallbackSearch(search: string): string {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    params.delete(TRACKER_OAUTH_RESULT_PARAM);
    params.delete(TRACKER_OAUTH_ERROR_PARAM);
    params.delete("connector_id");
    const next = params.toString();
    return next ? `?${next}` : "";
}

export function describeConnectedAccountsError(error: unknown, fallback = "Account request failed"): string {
    if (error instanceof TrackerApiError) {
        if (error.isPermission) {
            return "Sign in with a session account to link forge identities.";
        }
        if (error.code === "session_expired") {
            return "Your session changed during account linking. Sign in again and retry.";
        }
        if (error.isRevoked) {
            return "This forge account was revoked. Reconnect to restore assignment hints.";
        }
        return error.message || fallback;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export function identityStatusLabel(status: IdentityStatus): { label: string; variant: "success" | "warning" | "destructive" } {
    if (status === "active") return { label: "Connected", variant: "success" };
    if (status === "expired") return { label: "Expired", variant: "warning" };
    return { label: "Revoked", variant: "destructive" };
}

export function formatIdentityExpiry(expiresAt?: string | null): string {
    if (!expiresAt) return "No expiry recorded";
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return expiresAt;
    return date.toLocaleString();
}

export function connectorRowKey(connector: LinkableConnector): string {
    return `${connector.id}:${connector.instanceKind}`;
}

export function identityIsUsable(identity: UserIdentity | undefined): boolean {
    return identity?.status === "active";
}

export function unlinkedAssignmentHint(): string {
    return "Teammates without a linked forge account still appear in assignment hints as unlinked names until they connect here.";
}

function connectedAccountsPhase(
    isSessionUser: boolean,
    loading: boolean,
    offline: boolean,
    connectors: LinkableConnector[],
): ConnectedAccountsPhase {
    if (!isSessionUser) return "forbidden";
    if (loading) return "loading";
    if (offline) return "offline";
    if (connectors.length === 0) return "empty";
    return "ready";
}

interface ConnectorAccountRow {
    connector: LinkableConnector;
    identity?: UserIdentity;
}

function buildRows(connectors: LinkableConnector[], identities: UserIdentity[]): ConnectorAccountRow[] {
    const byConnector = new Map(identities.map((identity) => [identity.connectorId, identity]));
    return connectors.map((connector) => ({
        connector,
        identity: byConnector.get(connector.id),
    }));
}

// react-doctor-disable-next-line no-giant-component - account list, OAuth and unlink share one settings surface
export function ConnectedAccounts({
    linkableConnectors,
    isSessionUser,
    returnPath,
    oauthCallbackSearch,
    className,
    onIdentitiesChange,
// react-doctor-disable-next-line prefer-useReducer - identities, linking and callback recovery are independent async surfaces
}: ConnectedAccountsProps) {
    const [identities, setIdentities] = useState<UserIdentity[]>([]);
    const [loading, setLoading] = useState(isSessionUser);
    const [offline, setOffline] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

    const phase = connectedAccountsPhase(isSessionUser, loading, offline, linkableConnectors);
    const rows = useMemo(() => buildRows(linkableConnectors, identities), [linkableConnectors, identities]);

    const applyIdentities = useCallback(
        (next: UserIdentity[]) => {
            setIdentities(next);
            onIdentitiesChange?.(next);
        },
        [onIdentitiesChange],
    );

    const refreshIdentities = useCallback(async () => {
        const next = await listIdentities();
        applyIdentities(next);
        return next;
    }, [applyIdentities]);

    useEffect(() => {
        if (!isSessionUser) {
            setIdentities([]);
            setLoading(false);
            setOffline(false);
            return;
        }

        const search = oauthCallbackSearch ?? window.location.search;
        const callback = parseOAuthCallbackSearch(search);
        let callbackError: string | null = null;
        if (callback.result === "linked") {
            toast.success("Forge account linked.");
            const restored = consumeOAuthReturnPath();
            if (restored && restored !== window.location.pathname + search) {
                const cleaned = clearOAuthCallbackSearch(search);
                window.history.replaceState(null, "", `${restored}${cleaned}`);
            } else {
                const cleaned = clearOAuthCallbackSearch(search);
                window.history.replaceState(null, "", `${window.location.pathname}${cleaned}`);
            }
        } else if (callback.result === "error") {
            callbackError =
                callback.errorCode === "session_expired"
                    ? describeConnectedAccountsError(new TrackerApiError(409, { detail: "session expired", code: "session_expired" }))
                    : "Account linking failed. Try connecting again.";
            toast.error(callbackError);
            const cleaned = clearOAuthCallbackSearch(search);
            window.history.replaceState(null, "", `${window.location.pathname}${cleaned}`);
        }

        let cancelled = false;
        setLoading(true);
        setOffline(false);
        setFormError(callbackError);
        void listIdentities()
            .then((loaded) => {
                if (!cancelled) applyIdentities(loaded);
            })
            .catch((error) => {
                if (cancelled) return;
                setIdentities([]);
                setOffline(true);
                setFormError(describeConnectedAccountsError(error));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [applyIdentities, isSessionUser, oauthCallbackSearch]);

    const startLink = async (connectorId: string) => {
        setLinkingId(connectorId);
        setFormError(null);
        try {
            if (returnPath) {
                storeOAuthReturnPath(returnPath);
            }
            const { authorizeUrl } = await beginIdentityLink(connectorId, returnPath);
            window.location.assign(authorizeUrl);
        } catch (error) {
            setFormError(describeConnectedAccountsError(error, "Could not start account linking"));
        } finally {
            setLinkingId(null);
        }
    };

    const unlink = async (connectorId: string) => {
        setUnlinkingId(connectorId);
        setFormError(null);
        try {
            await unlinkIdentity(connectorId);
            applyIdentities(identities.filter((identity) => identity.connectorId !== connectorId));
            toast.success("Forge account unlinked.");
            void refreshIdentities().catch(() => {
                // Optimistic UI already cleared the row; background refresh is best-effort.
            });
        } catch (error) {
            setFormError(describeConnectedAccountsError(error, "Could not unlink account"));
        } finally {
            setUnlinkingId(null);
        }
    };

    if (phase === "forbidden") {
        return (
            <Card className={cn("border-dashed", className)} data-tracker-phase="forbidden">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                        Connected accounts
                    </CardTitle>
                    <CardDescription>Sign in with a session account to link your forge identity for assignment hints.</CardDescription>
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
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (phase === "offline") {
        return (
            <Card className={className} data-tracker-phase="offline">
                <CardHeader>
                    <CardTitle>Connected accounts</CardTitle>
                    <CardDescription>Could not reach Prism. Check your network and try again.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-destructive" role="alert">{formError}</p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                            setLoading(true);
                            setOffline(false);
                            void refreshIdentities()
                                .then(() => setOffline(false))
                                .catch((error) => {
                                    setOffline(true);
                                    setFormError(describeConnectedAccountsError(error));
                                })
                                .finally(() => setLoading(false));
                        }}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (phase === "empty") {
        return (
            <Card className={className} data-tracker-phase="empty">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                        Connected accounts
                    </CardTitle>
                    <CardDescription>
                        No forge connectors are available yet. An administrator must configure connectors before you can link an account.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className={className} data-tracker-phase="ready">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Connected accounts
                </CardTitle>
                <CardDescription>
                    Link your forge login per connector so Prism can resolve assignment hints. {unlinkedAssignmentHint()}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {formError ? (
                    <p
                        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        role="alert"
                    >
                        {formError}
                    </p>
                ) : null}

                <ul className="space-y-3" aria-label="Forge account connections">
                    {rows.map(({ connector, identity }) => {
                        const status = identity ? identityStatusLabel(identity.status) : null;
                        const usable = identityIsUsable(identity);
                        const rowId = connectorRowKey(connector);
                        return (
                            <li
                                key={rowId}
                                className="rounded-md border border-border bg-muted/20 p-3"
                                data-connector-id={connector.id}
                                data-instance-kind={connector.instanceKind}
                                data-identity-usable={usable ? "true" : "false"}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">
                                            {connector.displayName}
                                            <span className="text-muted-foreground"> · {connector.instanceKind}</span>
                                        </p>
                                        {identity ? (
                                            <p className="text-sm text-muted-foreground">
                                                <span className="font-medium text-foreground">{identity.forgeLogin}</span>
                                                <span className="sr-only"> on {connector.provider}</span>
                                            </p>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Not linked</p>
                                        )}
                                        {identity?.expiresAt ? (
                                            <p className="text-xs text-muted-foreground">
                                                Token expires {formatIdentityExpiry(identity.expiresAt)}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                                        {usable ? (
                                            <HoldToConfirmButton
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={unlinkingId === connector.id}
                                                onConfirm={() => void unlink(connector.id)}
                                                aria-label={`Unlink ${connector.displayName} account`}
                                            >
                                                <Unlink className="mr-1 h-3 w-3" aria-hidden="true" />
                                                Unlink
                                            </HoldToConfirmButton>
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={linkingId === connector.id}
                                                onClick={() => void startLink(connector.id)}
                                            >
                                                {identity ? "Reconnect" : "Connect"}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </CardContent>
        </Card>
    );
}
