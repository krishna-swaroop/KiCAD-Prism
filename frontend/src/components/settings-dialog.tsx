import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Activity, GitBranch, Copy, FileCode, Shield, Plus, Trash2, KeyRound, Link2, MoreHorizontal, Pause, Play, UserRound } from "lucide-react";
import { User, UserRole } from "@/types/auth";
import { fetchApi, readApiError } from "@/lib/api";
import { changeOwnPassword, fetchAuthConfig } from "@/lib/auth";
import { ROLE_OPTIONS, roleLabel } from "@/lib/roles";
import { ConnectorHealthPanel } from "@/components/tracker-integration/connector-health";
import { ConnectorSettings } from "@/components/tracker-integration/connector-settings";
import {
    ConnectedAccounts,
    type LinkableConnector,
} from "@/components/tracker-integration/connected-accounts";
import { deleteConnector, listConnectors, pauseConnector, resumeConnector, revokeConnector, testConnector } from "@/lib/trackers-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrackerConnector } from "@/types/trackers";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
}

type SettingsTab = "git" | "access" | "trackers" | "accounts" | "general";

interface RoleAssignment {
    email: string;
    role: UserRole;
    source: string;
    has_password?: boolean;
}

/** Origin the forge calls back to, derived from the server-computed webhook URL. */
export function publicOriginFromConnectors(connectors: Pick<TrackerConnector, "webhookUrl">[]): string | null {
    for (const connector of connectors) {
        const url = connector.webhookUrl;
        if (!url) continue;
        try {
            return new URL(url).origin;
        } catch {
            continue;
        }
    }
    return null;
}

function toLinkableConnectors(connectors: TrackerConnector[]): LinkableConnector[] {
    return connectors.map((connector) => ({
        id: connector.id,
        provider: connector.provider,
        displayName: connector.displayName,
        instanceKind: connector.instanceKind,
    }));
}

export function SettingsDialog({ open, onOpenChange, user }: SettingsDialogProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>("git");
    const isAdmin = user?.role === "admin";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden flex h-[600px]">
                <DialogTitle className="sr-only">Workspace Settings</DialogTitle>
                <DialogDescription className="sr-only">
                    Manage Git, SSH, access control, issue tracking, and password settings for this workspace.
                </DialogDescription>
                <div className="w-64 bg-muted/30 border-r p-4 flex flex-col gap-2">
                    <div className="mb-4 px-2">
                        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                        <p className="text-sm text-muted-foreground">Manage your workspace</p>
                    </div>

                    <Button
                        variant={activeTab === "git" ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setActiveTab("git")}
                    >
                        <GitBranch className="mr-2 h-4 w-4" />
                        Git & SSH
                    </Button>

                    <Button
                        variant={activeTab === "access" ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setActiveTab("access")}
                    >
                        <Shield className="mr-2 h-4 w-4" />
                        Access Control
                    </Button>

                    <Button
                        variant={activeTab === "trackers" ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setActiveTab("trackers")}
                        data-testid="settings-tab-trackers"
                    >
                        <Link2 className="mr-2 h-4 w-4" />
                        Issue tracking
                    </Button>

                    <Button
                        variant={activeTab === "accounts" ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setActiveTab("accounts")}
                        data-testid="settings-tab-accounts"
                    >
                        <UserRound className="mr-2 h-4 w-4" />
                        Connected accounts
                    </Button>

                    <Button
                        variant={activeTab === "general" ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setActiveTab("general")}
                    >
                        <FileCode className="mr-2 h-4 w-4" />
                        General
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === "git" && <GitSettings user={user} />}
                    {activeTab === "access" && <AccessControlSettings isAdmin={isAdmin} />}
                    {activeTab === "trackers" && <TrackerConnectorSettings key="trackers-tab" isAdmin={isAdmin} />}
                    {activeTab === "accounts" && (
                        <ConnectedAccountsSettings key="accounts-tab" user={user} isAdmin={isAdmin} />
                    )}
                    {activeTab === "general" && <PasswordSettings />}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function TrackerConnectorSettings({ isAdmin }: { isAdmin: boolean }) {
    const [connectors, setConnectors] = useState<TrackerConnector[]>([]);
    const [listError, setListError] = useState<string | null>(null);
    const [loadingList, setLoadingList] = useState(false);
    // Configuration lives behind an explicit "Configure" step: null = closed,
    // "new" = creating, otherwise the connector being edited.
    const [editing, setEditing] = useState<string | "new" | null>(null);
    const [healthOpenId, setHealthOpenId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const deletion = useConfirmTarget<TrackerConnector>();

    const refreshConnectors = useCallback(async () => {
        if (!isAdmin) return;
        setLoadingList(true);
        setListError(null);
        try {
            setConnectors(await listConnectors());
        } catch (error) {
            setListError(error instanceof Error ? error.message : "Failed to load connections");
            setConnectors([]);
        } finally {
            setLoadingList(false);
        }
    }, [isAdmin]);

    const upsertConnector = useCallback((connector: TrackerConnector) => {
        // Upsert locally — do not re-fetch here. ConnectorSettings calls this on
        // every successful load/save; a list refetch would loop.
        setConnectors((prev) => {
            const index = prev.findIndex((item) => item.id === connector.id);
            if (index < 0) return [...prev, connector];
            const next = [...prev];
            next[index] = connector;
            return next;
        });
    }, []);

    const handleConnectorChange = useCallback(
        (connector: TrackerConnector) => {
            upsertConnector(connector);
            setEditing((current) => (current === "new" ? connector.id : current));
        },
        [upsertConnector],
    );

    const runAction = async (connector: TrackerConnector, action: "test" | "pause" | "resume" | "revoke") => {
        setBusyId(connector.id);
        try {
            if (action === "test") {
                const result = await testConnector(connector.id);
                upsertConnector(result);
                if (result.test.writesEnabled) {
                    toast.success(`${connector.displayName}: connection OK${result.bot.login ? ` as ${result.bot.login}` : ""}.`);
                } else {
                    toast.error(
                        `${connector.displayName}: test failed${result.test.pausedReason ? ` (${result.test.pausedReason.replace(/_/g, " ")})` : ""}.`,
                    );
                }
            } else if (action === "pause") {
                upsertConnector(await pauseConnector(connector.id));
                toast.success(`${connector.displayName} paused.`);
            } else if (action === "resume") {
                upsertConnector(await resumeConnector(connector.id));
                toast.success(`${connector.displayName} resumed.`);
            } else {
                upsertConnector(await revokeConnector(connector.id));
                toast.success(`${connector.displayName}: credentials revoked.`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Connection request failed");
        } finally {
            setBusyId(null);
        }
    };

    const runDelete = async (connector: TrackerConnector) => {
        setBusyId(connector.id);
        try {
            await deleteConnector(connector.id);
            setConnectors((prev) => prev.filter((item) => item.id !== connector.id));
            if (healthOpenId === connector.id) setHealthOpenId(null);
            toast.success(`${connector.displayName} removed.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not remove the connection");
        } finally {
            setBusyId(null);
            deletion.clear();
        }
    };

    useEffect(() => {
        void refreshConnectors();
    }, [refreshConnectors]);

    if (!isAdmin) {
        return (
            <div className="space-y-3" data-testid="tracker-settings-host">
                <div>
                    <h3 className="text-lg font-medium">Issue tracking</h3>
                    <p className="text-sm text-muted-foreground">
                        Only workspace administrators can connect or edit the GitHub integration.
                    </p>
                </div>
                <ConnectorSettings connectorId={null} isAdmin={false} />
            </div>
        );
    }

    const editingConnector = editing && editing !== "new" ? connectors.find((item) => item.id === editing) ?? null : null;

    return (
        <div className="space-y-4" data-testid="tracker-settings-host">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-medium">Issue tracking</h3>
                    <p className="text-sm text-muted-foreground">
                        Connect GitHub so review comments can be published as issues and kept in sync. Each project
                        then chooses its repository under its own publishing settings.
                    </p>
                </div>
                {connectors.length > 0 ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing("new")} data-testid="tracker-create-connector">
                        <Plus />
                        Add connection
                    </Button>
                ) : null}
            </div>

            {listError ? (
                <Alert variant="destructive">
                    <AlertDescription>
                        {listError}{" "}
                        <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={() => void refreshConnectors()}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : null}

            {loadingList ? (
                <div className="space-y-3" aria-busy="true">
                    <Skeleton className="h-28 w-full" />
                </div>
            ) : connectors.length > 0 ? (
                <ul className="space-y-3" data-testid="tracker-connector-list">
                    {connectors.map((connector) => (
                        <li key={connector.id}>
                            <ConnectorCard
                                connector={connector}
                                busy={busyId === connector.id}
                                healthOpen={healthOpenId === connector.id}
                                onConfigure={() => setEditing(connector.id)}
                                onToggleHealth={() =>
                                    setHealthOpenId((current) => (current === connector.id ? null : connector.id))
                                }
                                onTest={() => void runAction(connector, "test")}
                                onPauseResume={() => void runAction(connector, connector.paused ? "resume" : "pause")}
                                onRevoke={() => void runAction(connector, "revoke")}
                                onDelete={() => deletion.request(connector)}
                            />
                        </li>
                    ))}
                </ul>
            ) : (
                <Card className="items-center py-8 text-center" data-testid="tracker-empty-state">
                    <Link2 className="size-6 text-muted-foreground" aria-hidden="true" />
                    <CardTitle>GitHub is not connected yet</CardTitle>
                    <CardDescription className="max-w-md px-4">
                        Create a GitHub App, install it on the repositories that should receive issues, then enter its
                        credentials here. Nothing is published until a project opts in.
                    </CardDescription>
                    <Button type="button" size="sm" className="mt-2" onClick={() => setEditing("new")} data-testid="tracker-create-connector">
                        <Plus />
                        Connect GitHub
                    </Button>
                </Card>
            )}

            <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
                <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl" data-testid="tracker-configure-sheet">
                    <SheetHeader className="border-b px-6 py-4 text-left">
                        <SheetTitle>
                            {editing === "new" ? "Connect GitHub" : `Configure ${editingConnector?.displayName ?? "connection"}`}
                        </SheetTitle>
                        <SheetDescription>
                            {editing === "new"
                                ? "Four steps: name the connection, enter the GitHub App credentials, wire the webhook, and optionally enable member sign-in."
                                : "Rotate credentials, set the webhook secret, or enable member sign-in."}
                        </SheetDescription>
                    </SheetHeader>
                    {editing !== null ? (
                        <ConnectorSettings
                            key={editing}
                            className="border-0 ring-0"
                            connectorId={editing === "new" ? null : editing}
                            isAdmin={isAdmin}
                            prismOrigin={typeof window !== "undefined" ? window.location.origin : undefined}
                            onConnectorChange={handleConnectorChange}
                        />
                    ) : null}
                </SheetContent>
            </Sheet>

            <ConfirmDialog
                open={deletion.open}
                onOpenChange={(open) => { if (!open) deletion.clear(); }}
                title={`Remove ${deletion.target?.displayName ?? "connection"}?`}
                description="Deletes the stored credentials, webhook secret, OAuth client and member links for this connection. Projects that still publish through it, or threads still linked through it, block removal — point them elsewhere first. Issues already on GitHub are not touched."
                confirmLabel="Remove connection"
                destructive
                busy={busyId === deletion.target?.id}
                onConfirm={() => {
                    if (deletion.target) void runDelete(deletion.target);
                }}
            />
        </div>
    );
}

export function connectorStatus(connector: TrackerConnector): {
    label: string;
    variant: "success" | "warning" | "destructive" | "secondary";
    detail: string;
} {
    if (!connector.credentialConfigured) {
        return { label: "Needs credentials", variant: "destructive", detail: "Enter the GitHub App credentials to activate this connection." };
    }
    if (connector.paused) {
        const reason = (connector.pausedReason || "paused").replace(/_/g, " ");
        return { label: `Paused · ${reason}`, variant: "warning", detail: "Publishing and sync are on hold until this connection is resumed." };
    }
    if (connector.writesEnabled === false) {
        return { label: "Not verified", variant: "secondary", detail: "Run a connection test to confirm the installation can create issues." };
    }
    return { label: "Ready", variant: "success", detail: "Issues can be published and synced." };
}

function ConnectorCard({
    connector,
    busy,
    healthOpen,
    onConfigure,
    onToggleHealth,
    onTest,
    onPauseResume,
    onRevoke,
    onDelete,
}: {
    connector: TrackerConnector;
    busy: boolean;
    healthOpen: boolean;
    onConfigure: () => void;
    onToggleHealth: () => void;
    onTest: () => void;
    onPauseResume: () => void;
    onRevoke: () => void;
    onDelete: () => void;
}) {
    const status = connectorStatus(connector);
    const instance = connector.instanceKind === "ghes" ? connector.baseUrl || "GitHub Enterprise" : "github.com";
    return (
        <Card data-size="sm" className="gap-3" data-testid="tracker-connector-card" data-connector-id={connector.id}>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                    {connector.displayName}
                    <Badge variant={status.variant} data-testid="connector-status">{status.label}</Badge>
                </CardTitle>
                <CardDescription>
                    GitHub App on {instance}
                    {connector.bot.login ? ` · publishes as ${connector.bot.login}` : ""}
                </CardDescription>
                <CardAction>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${connector.displayName}`} disabled={busy}>
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={onPauseResume} disabled={!connector.credentialConfigured}>
                                {connector.paused ? <Play /> : <Pause />}
                                {connector.paused ? "Resume" : "Pause"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={onRevoke} disabled={!connector.credentialConfigured}>
                                <KeyRound />
                                Revoke credentials
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={onDelete} data-testid="connector-delete">
                                <Trash2 />
                                Remove connection
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{status.detail}</p>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <div className="flex items-center gap-1.5">
                        <dt className="text-muted-foreground">Webhook</dt>
                        <dd>{connector.webhookConfigured ? "configured" : "not set up (polling only)"}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <dt className="text-muted-foreground">Member sign-in</dt>
                        <dd>{connector.oauthClientConfigured ? "enabled" : "off"}</dd>
                    </div>
                </dl>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button type="button" size="sm" onClick={onConfigure} data-testid="connector-configure">
                        <KeyRound />
                        Configure
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy || !connector.credentialConfigured} onClick={onTest}>
                        {busy ? "Working…" : "Test connection"}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-muted-foreground"
                        onClick={onToggleHealth}
                        aria-expanded={healthOpen}
                    >
                        <Activity />
                        {healthOpen ? "Hide health" : "Show health"}
                    </Button>
                </div>
                {healthOpen ? <ConnectorHealthPanel connectorId={connector.id} isAdmin /> : null}
            </CardContent>
        </Card>
    );
}

function ConnectedAccountsSettings({
    user,
    isAdmin,
}: {
    user: User | null;
    isAdmin: boolean;
}) {
    const [linkable, setLinkable] = useState<LinkableConnector[]>([]);
    const [publicOrigin, setPublicOrigin] = useState<string | null>(null);
    const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
    // The forge sends the OAuth callback to PUBLIC_BASE_URL. A session on any
    // other origin (127.0.0.1 during local testing) has no cookie there, so the
    // callback lands as "Authentication required" — say so before Connect.
    const originMismatch = Boolean(publicOrigin && browserOrigin && publicOrigin !== browserOrigin);

    useEffect(() => {
        if (!isAdmin) {
            // Non-admins have no connector discovery API; ConnectedAccounts shows empty until an admin lists them.
            return;
        }
        let cancelled = false;
        void listConnectors()
            .then((connectors) => {
                if (cancelled) return;
                setLinkable(toLinkableConnectors(connectors));
                setPublicOrigin(publicOriginFromConnectors(connectors));
            })
            .catch(() => {
                if (!cancelled) setLinkable([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isAdmin]);

    return (
        <div className="space-y-3" data-testid="connected-accounts-host">
            <div>
                <h3 className="text-lg font-medium">Connected accounts</h3>
                <p className="text-sm text-muted-foreground">
                    Link your forge identity for assignment hints. Connector credentials stay on the server.
                </p>
            </div>
            {originMismatch ? (
                <p
                    className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
                    role="note"
                    data-testid="oauth-origin-mismatch"
                >
                    GitHub will send you back to <span className="font-mono">{publicOrigin}</span>, but you are signed in at{" "}
                    <span className="font-mono">{browserOrigin}</span>. Open Prism at the public address and sign in there
                    before connecting an account, or the return trip fails with “Authentication required”.
                </p>
            ) : null}
            <ConnectedAccounts
                linkableConnectors={linkable}
                isSessionUser={Boolean(user)}
                returnPath="/?settings=accounts"
                oauthCallbackSearch={typeof window !== "undefined" ? window.location.search : ""}
            />
            {!isAdmin && (
                <p className="text-xs text-muted-foreground" data-testid="linkable-connectors-residual">
                    Ask a workspace administrator to configure tracker connectors before personal linking is available.
                </p>
            )}
        </div>
    );
}

function PasswordSettings() {
    const [available, setAvailable] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        void fetchAuthConfig()
            .then((config) => setAvailable(Boolean(config.password_auth_enabled)))
            .catch(() => setAvailable(false));
    }, []);

    if (!available) {
        return (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                Local passwords are not enabled on this deployment.
            </div>
        );
    }

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("The new passwords do not match.");
            return;
        }
        setSaving(true);
        try {
            await changeOwnPassword(currentPassword, newPassword);
            toast.success("Password updated. Other sessions were signed out.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to change password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-medium">Password</h3>
                <p className="text-sm text-muted-foreground">
                    Change the password for this account. Other signed-in sessions will end.
                </p>
            </div>
            <form className="max-w-md space-y-3" onSubmit={(event) => void submit(event)}>
                <div className="space-y-1.5">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                        id="current-password"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="settings-new-password">New password</Label>
                    <Input
                        id="settings-new-password"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="settings-confirm-password">Confirm new password</Label>
                    <Input
                        id="settings-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                    />
                </div>
                <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Update password"}
                </Button>
            </form>
        </div>
    );
}

interface GitAccessKey {
    exists: boolean;
    public_key: string | null;
    fingerprint: string | null;
    key_type: string | null;
    comment: string | null;
    created_at: string | null;
}

interface GitAccessRepository {
    id: string;
    name: string;
    url: string;
    host: string | null;
    host_trusted: boolean | null;
    forge?: string;
    deploy_key_url?: string | null;
    guidance?: string | null;
    last_synced_at?: string | null;
}

interface GitAccessState {
    key: GitAccessKey;
    trusted_hosts: string[];
    repositories: GitAccessRepository[];
    /** Which OpenSSH binaries the server has. Missing ones disable features. */
    tools?: { ssh: boolean; "ssh-keygen": boolean; "ssh-keyscan": boolean };
}

interface AccessCheckResult {
    reachable: boolean;
    authorized: boolean;
    reason: string;
    message: string;
    deploy_key_url?: string | null;
}

// react-doctor-disable-next-line no-giant-component - settings form and connection test flow are mutually coupled
function GitSettings({ user }: { user: User | null }) {
    const [access, setAccess] = useState<GitAccessState | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [checking, setChecking] = useState<string | null>(null);
    const [checks, setChecks] = useState<Record<string, AccessCheckResult>>({});
    const [newHost, setNewHost] = useState("");
    const [pendingHost, setPendingHost] = useState<{ host: string; fingerprints: string[] } | null>(null);
    const [email] = useState(user?.email || "kicad-prism@example.com");

    const sshKey = access?.key.public_key ?? null;

    const loadAccess = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const res = await fetchApi("/api/settings/git-access", { signal });
            if (res.ok) {
                setAccess(await res.json());
            } else {
                toast.error(await readApiError(res, "Failed to load Git access settings."));
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                return;
            }
            console.error("Failed to fetch Git access settings", err);
            toast.error("Failed to load Git access settings");
        } finally {
            if (!signal?.aborted) {
                // Already in `finally`, so the rejection path is covered. The
                // rule reads the abort guard as a success-only branch; an
                // aborted load has a successor in flight that owns the flag.
                // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadAccess(controller.signal);
        return () => controller.abort();
    }, [loadAccess]);

    const generateKey = async () => {
        setConfirmRegenerate(false);
        setGenerating(true);
        try {
            const res = await fetchApi("/api/settings/ssh-key/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                toast.success("New SSH key generated. Register it before importing again.");
                await loadAccess();
            } else {
                toast.error(await readApiError(res, "Failed to generate SSH key."));
            }
        } catch {
            toast.error("An error occurred while connecting to the backend.");
        } finally {
            setGenerating(false);
        }
    };

    const copyToClipboard = () => {
        if (sshKey) {
            void navigator.clipboard.writeText(sshKey);
            toast.success("SSH key copied to clipboard");
        }
    };

    const checkAccess = async (repository: GitAccessRepository) => {
        setChecking(repository.id);
        try {
            const res = await fetchApi("/api/settings/git-access/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: repository.url }),
            });
            if (!res.ok) {
                toast.error(await readApiError(res, "Access check failed."));
                return;
            }
            const result: AccessCheckResult = await res.json();
            setChecks((previous) => ({ ...previous, [repository.id]: result }));
            if (result.authorized) {
                toast.success(`Prism can read ${repository.name}`);
            } else {
                toast.error(`Prism cannot read ${repository.name}`);
            }
        } catch {
            toast.error("An error occurred while connecting to the backend.");
        } finally {
            setChecking(null);
        }
    };

    const scanHost = async () => {
        if (!newHost.trim()) return;
        try {
            const res = await fetchApi("/api/settings/git-access/host-keys/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ host: newHost.trim() }),
            });
            if (!res.ok) {
                toast.error(await readApiError(res, "Could not read that host's key."));
                return;
            }
            const data = await res.json();
            setPendingHost({ host: data.host, fingerprints: data.fingerprints });
        } catch {
            toast.error("An error occurred while connecting to the backend.");
        }
    };

    const trustHost = async () => {
        if (!pendingHost) return;
        try {
            const res = await fetchApi("/api/settings/git-access/host-keys/trust", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ host: pendingHost.host }),
            });
            if (!res.ok) {
                toast.error(await readApiError(res, "Could not trust that host."));
                return;
            }
            toast.success(`${pendingHost.host} is now trusted`);
            setPendingHost(null);
            setNewHost("");
            await loadAccess();
        } catch {
            toast.error("An error occurred while connecting to the backend.");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Git Access</h3>
                <p className="text-sm text-muted-foreground">
                    How this workspace authenticates to your Git servers, and whether it works.
                </p>
            </div>

            {/* The single most important thing nobody was told: this key stands
                for the workspace, not for a person, and a deploy key only ever
                covers one repository. */}
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                <p className="font-medium">Prism uses one key for the whole workspace.</p>
                <p className="text-muted-foreground">
                    Add it to a dedicated machine user — a service account with read access to
                    the repositories this workspace imports. That account's access is what Prism
                    can see.
                </p>
                <p className="text-muted-foreground">
                    You can instead add the key as a read-only deploy key, but most Git hosts allow
                    a deploy key on only one repository, so that works for a single private
                    repository and no more.
                </p>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">Workspace SSH key</Label>
                        <p className="text-sm text-muted-foreground">
                            {access?.key.fingerprint
                                ? `Fingerprint ${access.key.fingerprint}`
                                : "The public key identifying this workspace."}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => (sshKey ? setConfirmRegenerate(true) : void generateKey())}
                        disabled={generating}
                    >
                        {generating ? "Generating..." : sshKey ? "Replace key" : "Generate key"}
                    </Button>
                </div>

                {loading ? (
                    <div className="h-24 bg-muted animate-pulse rounded-md" />
                ) : sshKey ? (
                    <div className="relative">
                        <Textarea
                            readOnly
                            value={sshKey}
                            className="font-mono text-xs resize-none h-24 bg-muted/50 pr-10"
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 h-8 w-8"
                            onClick={copyToClipboard}
                            title="Copy to clipboard"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground italic border border-dashed p-4 rounded-md text-center">
                        No SSH key yet. Generate one, then register it with your Git host.
                    </div>
                )}
            </div>

            <div className="space-y-3 border rounded-lg p-4 bg-card">
                <div className="space-y-0.5">
                    <Label className="text-base">Repository access</Label>
                    <p className="text-sm text-muted-foreground">
                        Check reads the repository the same way an import does, without cloning it.
                    </p>
                </div>

                {loading ? (
                    <div className="h-16 bg-muted animate-pulse rounded-md" />
                ) : (access?.repositories.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        No repositories imported yet.
                    </p>
                ) : (
                    <div className="divide-y rounded-md border">
                        {access?.repositories.map((repository) => {
                            const result = checks[repository.id];
                            return (
                                <div key={repository.id} className="p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-medium truncate">{repository.name}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {repository.url}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {result && (
                                                <span
                                                    className={
                                                        result.authorized
                                                            ? "text-xs text-success"
                                                            : "text-xs text-destructive"
                                                    }
                                                >
                                                    {result.authorized
                                                        ? "Readable"
                                                        : result.reachable
                                                          ? "No access"
                                                          : "Unreachable"}
                                                </span>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={checking === repository.id}
                                                onClick={() => void checkAccess(repository)}
                                            >
                                                {checking === repository.id ? "Checking…" : "Check access"}
                                            </Button>
                                        </div>
                                    </div>

                                    {repository.host_trusted === false && (
                                        <p className="text-xs text-destructive">
                                            {repository.host} is not a trusted host. Add its host key below
                                            before Prism can connect over SSH.
                                        </p>
                                    )}

                                    {result && !result.authorized && (
                                        <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
                                            <p className="whitespace-pre-line">{result.message}</p>
                                            {repository.deploy_key_url && (
                                                <a
                                                    className="underline"
                                                    href={repository.deploy_key_url}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                >
                                                    Open deploy key settings on {repository.forge}
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="space-y-3 border rounded-lg p-4 bg-card">
                <div className="space-y-0.5">
                    <Label className="text-base">Trusted Git hosts</Label>
                    <p className="text-sm text-muted-foreground">
                        Prism only connects to hosts whose SSH key it has pinned. Compare the
                        fingerprint against what your Git server publishes before trusting it.
                    </p>
                </div>

                {(access?.trusted_hosts.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {access?.trusted_hosts.map((host) => (
                            <span
                                key={host}
                                className="rounded bg-secondary px-2 py-1 text-xs font-mono"
                            >
                                {host}
                            </span>
                        ))}
                    </div>
                )}

                {access?.tools && !access.tools["ssh-keyscan"] && (
                    <p className="text-xs text-destructive">
                        The Prism server has no openssh-client installed, so it cannot read
                        host keys or connect to SSH remotes. Install it in the backend image
                        and restart.
                    </p>
                )}

                <div className="flex gap-2">
                    <Input
                        value={newHost}
                        onChange={(event) => setNewHost(event.target.value)}
                        placeholder="git.internal.example"
                        className="flex-1"
                    />
                    <Button
                        variant="outline"
                        onClick={() => void scanHost()}
                        disabled={!newHost.trim() || access?.tools?.["ssh-keyscan"] === false}
                    >
                        Read host key
                    </Button>
                </div>

                {pendingHost && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                        <p>
                            <span className="font-medium">{pendingHost.host}</span> offered these
                            fingerprints:
                        </p>
                        <ul className="font-mono text-xs space-y-0.5">
                            {pendingHost.fingerprints.map((fingerprint) => (
                                <li key={fingerprint}>{fingerprint}</li>
                            ))}
                        </ul>
                        <p className="text-xs text-muted-foreground">
                            This was read over the network, so it is only as trustworthy as the
                            network. Confirm it matches the fingerprint your Git server's operator
                            publishes before trusting it.
                        </p>
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => void trustHost()}>
                                Fingerprint matches — trust host
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setPendingHost(null)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Only asked when a key already exists: replacing one breaks every
                remote that trusts it, creating the first one breaks nothing. */}
            <ConfirmDialog
                open={confirmRegenerate}
                onOpenChange={setConfirmRegenerate}
                title="Replace SSH key"
                description="The existing key is overwritten and cannot be recovered. Every Git remote that trusts it will refuse this workspace until the new key is registered."
                confirmLabel="Hold to replace key"
                requireHold
                busy={generating}
                busyLabel="Generating…"
                onConfirm={() => void generateKey()}
            />
        </div>
    );
}

function AccessControlSettings({ isAdmin }: { isAdmin: boolean }) {
    const [loading, setLoading] = useState(false);
    const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
    const [newEmail, setNewEmail] = useState("");
    const [newRole, setNewRole] = useState<UserRole>("viewer");
    const [passwordAuthEnabled, setPasswordAuthEnabled] = useState(false);
    // The dialog names the person, so it holds the email rather than a boolean.
    const removalTarget = useConfirmTarget<string>();

    const loadAssignments = useCallback(async () => {
        if (!isAdmin) {
            setAssignments([]);
            return;
        }

        setLoading(true);
        try {
            const response = await fetchApi("/api/settings/access/users");
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to load role assignments"));
            }
            const data = (await response.json()) as RoleAssignment[];
            setAssignments(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load role assignments";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        void loadAssignments();
    }, [loadAssignments]);

    useEffect(() => {
        void fetchAuthConfig()
            .then((config) => setPasswordAuthEnabled(Boolean(config.password_auth_enabled)))
            .catch(() => setPasswordAuthEnabled(false));
    }, []);

    const upsertRole = async (email: string, role: UserRole) => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            toast.error("Email is required");
            return;
        }
        try {
            const response = await fetchApi(`/api/settings/access/users/${encodeURIComponent(normalizedEmail)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to update role assignment"));
            }
            toast.success("Role assignment updated");
            setNewEmail("");
            setNewRole("viewer");
            await loadAssignments();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update role assignment";
            toast.error(message);
        }
    };

    const removeRole = async (email: string) => {
        removalTarget.clear();
        try {
            const response = await fetchApi(`/api/settings/access/users/${encodeURIComponent(email)}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to remove role assignment"));
            }
            toast.success("Role assignment removed");
            await loadAssignments();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to remove role assignment";
            toast.error(message);
        }
    };

    const [passwordEmail, setPasswordEmail] = useState<string | null>(null);
    const [passwordValue, setPasswordValue] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);

    const submitPassword = async () => {
        if (!passwordEmail) return;
        setSavingPassword(true);
        try {
            const response = await fetchApi(
                `/api/settings/access/users/${encodeURIComponent(passwordEmail)}/password`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: passwordValue, must_change: true }),
                },
            );
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to set password"));
            }
            toast.success("Password set. The user must change it on next sign-in.");
            setPasswordEmail(null);
            setPasswordValue("");
            await loadAssignments();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to set password");
        } finally {
            setSavingPassword(false);
        }
    };

    const removePassword = async (email: string) => {
        try {
            const response = await fetchApi(
                `/api/settings/access/users/${encodeURIComponent(email)}/password`,
                { method: "DELETE" },
            );
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to remove password"));
            }
            toast.success("Local password removed");
            await loadAssignments();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove password");
        }
    };

    if (!isAdmin) {
        return (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                Admin role is required to view and manage user access.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Access Control</h3>
                <p className="text-sm text-muted-foreground">
                    Manage role assignments for workspace users.
                </p>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-2">
                    <Input
                        aria-label="User email address"
                        placeholder="user@example.com"
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                    />
                    <select
                        aria-label="Role for new assignment"
                        className="h-10 rounded-md border bg-background px-3 text-sm"
                        value={newRole}
                        onChange={(event) => setNewRole(event.target.value as UserRole)}
                    >
                        {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>{roleLabel(role)}</option>
                        ))}
                    </select>
                    <Button onClick={() => void upsertRole(newEmail, newRole)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add / Update
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_auto] border-b bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <div>Email</div>
                    <div>Role</div>
                    <div>Source</div>
                    <div />
                </div>
                {loading ? (
                    <div className="p-4 text-sm text-muted-foreground">Loading assignments...</div>
                ) : assignments.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No role assignments found.</div>
                ) : (
                    assignments.map((assignment) => {
                        const isBootstrap = assignment.source === "bootstrap";
                        return (
                            <div
                                key={assignment.email}
                                className="grid grid-cols-[2fr_1fr_1fr_auto] items-center border-b px-4 py-2 gap-2"
                            >
                                <div className="truncate text-sm">{assignment.email}</div>
                                <select
                                    aria-label={`Role for ${assignment.email}`}
                                    className="h-8 rounded-md border bg-background px-2 text-sm"
                                    value={assignment.role}
                                    disabled={isBootstrap}
                                    onChange={(event) =>
                                        void upsertRole(assignment.email, event.target.value as UserRole)
                                    }
                                >
                                    {ROLE_OPTIONS.map((role) => (
                                        <option key={role} value={role}>{roleLabel(role)}</option>
                                    ))}
                                </select>
                                <div className="text-sm text-muted-foreground">{assignment.source}</div>
                                <div className="flex justify-end gap-1">
                                    {passwordAuthEnabled && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => { setPasswordEmail(assignment.email); setPasswordValue(""); }}
                                            aria-label={`Set password for ${assignment.email}`}
                                            title={assignment.has_password ? "Reset password" : "Set password"}
                                        >
                                            <KeyRound className={`h-4 w-4 ${assignment.has_password ? "text-primary" : ""}`} />
                                        </Button>
                                    )}
                                    {passwordAuthEnabled && assignment.has_password && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => void removePassword(assignment.email)}
                                            aria-label={`Remove local password for ${assignment.email}`}
                                            title="Remove local password"
                                        >
                                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isBootstrap}
                                        onClick={() => removalTarget.request(assignment.email)}
                                        aria-label={`Remove role assignment for ${assignment.email}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <ConfirmDialog
                open={removalTarget.open}
                onOpenChange={(next) => { if (!next) removalTarget.clear(); }}
                title="Remove role assignment"
                description={`${removalTarget.target ?? ""} loses their assigned role and falls back to the workspace default. Any project or catalog access that depended on it stops immediately.`}
                confirmLabel="Hold to remove access"
                requireHold
                onConfirm={() => { if (removalTarget.target) void removeRole(removalTarget.target); }}
            />

            <Dialog open={passwordAuthEnabled && passwordEmail !== null} onOpenChange={(next) => { if (!next) { setPasswordEmail(null); setPasswordValue(""); } }}>
                <DialogContent className="max-w-sm">
                    <DialogTitle>Set a password</DialogTitle>
                    <DialogDescription>
                        {passwordEmail} will be required to change this password on their next sign-in.
                        Their existing sessions are ended.
                    </DialogDescription>
                    <form
                        className="mt-2 space-y-3"
                        onSubmit={(event) => { event.preventDefault(); void submitPassword(); }}
                    >
                        <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="Temporary password"
                            value={passwordValue}
                            onChange={(event) => setPasswordValue(event.target.value)}
                            required
                        />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => { setPasswordEmail(null); setPasswordValue(""); }}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={savingPassword || !passwordValue}>
                                {savingPassword ? "Saving…" : "Set password"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
