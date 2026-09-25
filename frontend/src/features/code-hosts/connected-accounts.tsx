import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { beginIdentityLink, listIdentities, listLinkableCodeHosts, TrackerApiError, unlinkIdentity } from "@/lib/trackers-client";
import { cn } from "@/lib/utils";
import type { LinkableCodeHost, UserIdentity } from "@/types/trackers";

import { authorizedAppsUrl, CodeHostMark, profileUrl, providerName } from "./code-host-meta";

/** Query parameters the OAuth callback appends when it sends the browser back. */
export const OAUTH_RESULT_PARAMS = ["tracker_oauth", "tracker_oauth_error", "tracker_oauth_connector"] as const;

const OAUTH_ERRORS: Record<string, string> = {
    missing_code_or_state: "Linking was cancelled or did not finish on the code host.",
    session_expired: "Your Prism session changed while you were away. Sign in again, then connect.",
    state_expired: "The link request expired before you came back. Try again.",
    unknown_or_reused_state: "That link request was already used. Try again.",
    invalid_state: "That link request is not valid. Try again.",
    cross_user_callback: "This link was started by a different Prism user.",
    user_mismatch: "This link was started by a different Prism user.",
    secret_store_locked:
        "Prism cannot store account credentials yet. An admin needs to set TRACKER_CREDENTIAL_ROOT_KEY.",
    auth_lost:
        "The code host did not accept Prism's request. An admin may need to check the OAuth application's ID, secret and redirect URI.",
    invalid_request:
        "The code host rejected the request. An admin may need to check the OAuth application's redirect URI.",
    identity_not_found: "That account link no longer exists.",
};

function describeOAuthError(code: string | null): string {
    return (code && OAUTH_ERRORS[code]) || "Linking did not complete. Try again.";
}

function describeRequestError(error: unknown, fallback: string): string {
    if (error instanceof TrackerApiError) {
        if (error.code === "oauth_client_not_configured") {
            return "This code host is missing its OAuth application. Ask an admin to finish setting it up.";
        }
        return error.message || fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
}

function formatDay(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function hostName(host: LinkableCodeHost): string {
    return host.displayName.trim() || providerName(host.provider);
}

export interface ConnectedAccountsProps {
    /** Whether this workspace signs people in; linking needs a real Prism user. */
    signInEnabled: boolean;
    isAdmin: boolean;
    /** Admins with nothing to link get a way to set up a code host. */
    onSetUpCodeHosts?: () => void;
}

/**
 * Personal links between a Prism user and their accounts on the workspace's
 * code hosts. Linking is identification only: Prism reads the username and
 * account ID so it can credit and @mention people; it never acts as them.
 */
// react-doctor-disable-next-line prefer-useReducer - listing, per-row busy state and the OAuth return banner are independent
export function ConnectedAccounts({ signInEnabled, isAdmin, onSetUpCodeHosts }: ConnectedAccountsProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [hosts, setHosts] = useState<LinkableCodeHost[]>([]);
    const [identities, setIdentities] = useState<UserIdentity[]>([]);
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [busyHostId, setBusyHostId] = useState<string | null>(null);
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
    const [returnError, setReturnError] = useState<string | null>(null);
    const [justLinked, setJustLinked] = useState<string | null>(null);
    const disconnect = useConfirmTarget<{ host: LinkableCodeHost; identity: UserIdentity }>();
    const [disconnecting, setDisconnecting] = useState(false);
    const oauthHandled = useRef(false);

    useEffect(() => {
        let cancelled = false;
        setPhase("loading");
        void Promise.all([
            listLinkableCodeHosts(),
            signInEnabled ? listIdentities() : Promise.resolve([] as UserIdentity[]),
        ])
            .then(([nextHosts, nextIdentities]) => {
                if (cancelled) return;
                setHosts(nextHosts);
                setIdentities(nextIdentities);
                setPhase("ready");
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setLoadError(describeRequestError(error, "Connected accounts could not be loaded."));
                setPhase("error");
            });
        return () => { cancelled = true; };
    }, [reloadKey, signInEnabled]);

    // The OAuth callback brings the browser back here with its outcome in the
    // query string. Report it once, then drop those parameters.
    useEffect(() => {
        if (oauthHandled.current || phase !== "ready") return;
        const outcome = searchParams.get("tracker_oauth");
        if (!outcome) return;
        oauthHandled.current = true;
        if (outcome === "linked") {
            const connectorId = searchParams.get("tracker_oauth_connector");
            const host = hosts.find((item) => item.id === connectorId);
            const identity = identities.find((item) => item.connectorId === connectorId);
            toast.success(host && identity
                ? `Connected ${hostName(host)} as @${identity.forgeLogin}`
                : "Account connected.");
            setJustLinked(connectorId);
        } else {
            setReturnError(describeOAuthError(searchParams.get("tracker_oauth_error")));
        }
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            OAUTH_RESULT_PARAMS.forEach((key) => next.delete(key));
            return next;
        }, { replace: true });
    }, [hosts, identities, phase, searchParams, setSearchParams]);

    useEffect(() => {
        if (!justLinked) return;
        const timer = setTimeout(() => setJustLinked(null), 4000);
        return () => clearTimeout(timer);
    }, [justLinked]);

    const connect = useCallback(async (host: LinkableCodeHost) => {
        setBusyHostId(host.id);
        setRowErrors((current) => ({ ...current, [host.id]: "" }));
        setReturnError(null);
        try {
            const returnTo = `${window.location.pathname}?settings=accounts`;
            const { authorizeUrl } = await beginIdentityLink(host.id, returnTo);
            window.location.assign(authorizeUrl);
        } catch (error) {
            setRowErrors((current) => ({
                ...current,
                [host.id]: describeRequestError(error, `Could not start linking with ${hostName(host)}.`),
            }));
            setBusyHostId(null);
        }
    }, []);

    const confirmDisconnect = async () => {
        const target = disconnect.target;
        if (!target) return;
        setDisconnecting(true);
        try {
            await unlinkIdentity(target.host.id);
            setIdentities((current) => current.filter((item) => item.connectorId !== target.host.id));
            toast.success(`Disconnected ${hostName(target.host)}.`);
            disconnect.clear();
        } catch (error) {
            toast.error(describeRequestError(error, "Could not disconnect the account."));
        } finally {
            setDisconnecting(false);
        }
    };

    const activeIdentity = (host: LinkableCodeHost) =>
        identities.find((item) => item.connectorId === host.id && item.status !== "revoked") ?? null;

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-medium">Connected accounts</h3>

            {!signInEnabled && (
                <Alert variant="info">
                    <TriangleAlert aria-hidden="true" />
                    <AlertTitle>Sign-in is off for this workspace</AlertTitle>
                    <AlertDescription>Turn on sign-in to let people connect accounts.</AlertDescription>
                </Alert>
            )}

            {returnError && (
                <Alert variant="destructive">
                    <TriangleAlert aria-hidden="true" />
                    <AlertTitle>Account not connected</AlertTitle>
                    <AlertDescription>{returnError}</AlertDescription>
                </Alert>
            )}

            {phase === "loading" && (
                <div className="space-y-2" aria-busy="true" aria-label="Loading connected accounts">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
            )}

            {phase === "error" && (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm" role="alert">
                    <span className="text-destructive">{loadError}</span>
                    <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                        <RefreshCw className="mr-1.5 size-4" aria-hidden="true" /> Retry
                    </Button>
                </div>
            )}

            {phase === "ready" && hosts.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm">
                    <p className="font-medium">Nothing to connect yet</p>
                    {!isAdmin && <p className="mt-1 text-muted-foreground">An admin needs to add a code host.</p>}
                    {isAdmin && onSetUpCodeHosts && (
                        <Button className="mt-4" size="sm" onClick={onSetUpCodeHosts}>Set up a code host</Button>
                    )}
                </div>
            )}

            {phase === "ready" && hosts.length > 0 && (
                <ul className="divide-y rounded-lg border" aria-label="Code hosts">
                    {hosts.map((host) => {
                        const identity = activeIdentity(host);
                        const expired = identity?.status === "expired";
                        const busy = busyHostId === host.id;
                        const profile = identity ? profileUrl(host.host, identity.forgeLogin) : null;
                        return (
                            <li
                                key={host.id}
                                data-code-host={host.id}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 transition-colors",
                                    justLinked === host.id && "bg-success/10",
                                )}
                            >
                                <CodeHostMark provider={host.provider} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                        <span className="font-medium">{hostName(host)}</span>
                                        <span className="text-xs text-muted-foreground">{host.host}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {identity ? (
                                            <>
                                                {expired ? "Access expired for " : "Connected as "}
                                                {profile ? (
                                                    <a href={profile} target="_blank" rel="noopener noreferrer"
                                                        className="font-medium text-foreground underline-offset-2 hover:underline">
                                                        @{identity.forgeLogin}
                                                    </a>
                                                ) : (
                                                    <span className="font-medium text-foreground">@{identity.forgeLogin}</span>
                                                )}
                                                {!expired && formatDay(identity.linkedAt) && ` · since ${formatDay(identity.linkedAt)}`}
                                            </>
                                        ) : "Not connected"}
                                    </p>
                                    {rowErrors[host.id] && (
                                        <p className="mt-1 text-sm text-destructive" role="alert">{rowErrors[host.id]}</p>
                                    )}
                                </div>
                                {identity && !expired ? (
                                    <Button variant="ghost" size="sm" disabled={!signInEnabled}
                                        onClick={() => disconnect.request({ host, identity })}>
                                        Disconnect
                                    </Button>
                                ) : (
                                    <Button size="sm" variant={expired ? "default" : "outline"}
                                        disabled={!signInEnabled || busy}
                                        onClick={() => void connect(host)}>
                                        {busy && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
                                        {busy ? `Opening ${providerName(host.provider)}…` : expired ? "Reconnect" : "Connect"}
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {phase === "ready" && hosts.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                    Prism only reads your username. It never acts as you.
                </p>
            )}

            <ConfirmDialog
                open={disconnect.open}
                onOpenChange={(open) => { if (!open) disconnect.clear(); }}
                title={disconnect.target ? `Disconnect ${hostName(disconnect.target.host)}?` : "Disconnect account?"}
                description={disconnect.target ? (
                    <DisconnectDescription host={disconnect.target.host} login={disconnect.target.identity.forgeLogin} />
                ) : null}
                confirmLabel="Disconnect"
                busy={disconnecting}
                busyLabel="Disconnecting…"
                onConfirm={() => void confirmDisconnect()}
            />
        </div>
    );
}

function DisconnectDescription({ host, login }: { host: LinkableCodeHost; login: string }) {
    const appsUrl = authorizedAppsUrl(host.provider, host.host);
    return (
        <span className="block space-y-2">
            <span className="block">
                Prism will credit you by name instead of @{login}. You can reconnect at any time.
            </span>
            {appsUrl && (
                <span className="block">
                    <a href={appsUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline">
                        Also revoke Prism on {providerName(host.provider)}
                        <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                </span>
            )}
        </span>
    );
}
