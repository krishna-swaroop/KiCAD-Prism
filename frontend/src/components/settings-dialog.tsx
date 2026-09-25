import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GitBranch, Copy, Shield, Plus, Trash2, KeyRound, Link2, MoreHorizontal, Server, type LucideIcon } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CodeHostsSettings } from "@/features/code-hosts/code-hosts-settings";
import { ConnectedAccounts } from "@/features/code-hosts/connected-accounts";
import { User, UserRole } from "@/types/auth";
import { fetchApi, readApiError } from "@/lib/api";
import { changeOwnPassword, fetchAuthConfig } from "@/lib/auth";
import { ROLE_OPTIONS, roleLabel } from "@/lib/roles";
import type { SettingsTab } from "@/lib/settings-tabs";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    /** Page to show first, e.g. from a ``?settings=`` deep link. */
    initialTab?: SettingsTab;
}

interface RoleAssignment {
    email: string;
    role: UserRole;
    source: string;
    has_password?: boolean;
}

interface NavItem {
    tab: SettingsTab;
    label: string;
    icon: LucideIcon;
    adminOnly?: boolean;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
    {
        title: "Account",
        items: [
            { tab: "accounts", label: "Connected accounts", icon: Link2 },
            { tab: "password", label: "Password", icon: KeyRound },
        ],
    },
    {
        title: "Workspace",
        items: [
            { tab: "code-hosts", label: "Code hosts", icon: Server, adminOnly: true },
            { tab: "git", label: "Git & SSH", icon: GitBranch, adminOnly: true },
            { tab: "access", label: "Access control", icon: Shield, adminOnly: true },
        ],
    },
];

export function SettingsDialog({ open, onOpenChange, user, initialTab }: SettingsDialogProps) {
    const isAdmin = user?.role === "admin";
    const allowed = (tab: SettingsTab | undefined): tab is SettingsTab =>
        Boolean(tab) && NAV_GROUPS.some((group) => group.items.some((item) => item.tab === tab && (!item.adminOnly || isAdmin)));
    const [activeTab, setActiveTab] = useState<SettingsTab>(allowed(initialTab) ? initialTab : "accounts");
    // Unknown until the auth config arrives; Connected accounts waits for it.
    const [signInEnabled, setSignInEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetchAuthConfig()
            .then((config) => { if (!cancelled) setSignInEnabled(Boolean(config.auth_enabled)); })
            .catch(() => { if (!cancelled) setSignInEnabled(true); });
        return () => { cancelled = true; };
    }, []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden flex h-[640px]">
                <DialogTitle className="sr-only">Settings</DialogTitle>
                <DialogDescription className="sr-only">
                    Manage your connected accounts and password, and the workspace's code hosts, Git access and roles.
                </DialogDescription>
                <nav className="w-60 shrink-0 bg-muted/30 border-r p-4 flex flex-col gap-4" aria-label="Settings sections">
                    <h2 className="px-2 text-lg font-semibold tracking-tight">Settings</h2>
                    {NAV_GROUPS.map((group) => {
                        const items = group.items.filter((item) => !item.adminOnly || isAdmin);
                        if (!items.length) return null;
                        return (
                            <div key={group.title} className="flex flex-col gap-1">
                                <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {group.title}
                                </p>
                                {items.map((item) => (
                                    <Button
                                        key={item.tab}
                                        variant={activeTab === item.tab ? "secondary" : "ghost"}
                                        className="justify-start"
                                        aria-current={activeTab === item.tab ? "page" : undefined}
                                        onClick={() => setActiveTab(item.tab)}
                                    >
                                        <item.icon className="mr-2 h-4 w-4" />
                                        {item.label}
                                    </Button>
                                ))}
                            </div>
                        );
                    })}
                </nav>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === "accounts" && signInEnabled !== null && (
                        <ConnectedAccounts
                            signInEnabled={signInEnabled}
                            isAdmin={isAdmin}
                            onSetUpCodeHosts={isAdmin ? () => setActiveTab("code-hosts") : undefined}
                        />
                    )}
                    {activeTab === "password" && <PasswordSettings />}
                    {activeTab === "code-hosts" && isAdmin && (
                        <CodeHostsSettings />
                    )}
                    {activeTab === "git" && isAdmin && <GitSettings user={user} />}
                    {activeTab === "access" && isAdmin && <AccessControlSettings isAdmin={isAdmin} />}
                </div>
            </DialogContent>
        </Dialog>
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
                <h3 className="text-lg font-medium">Access control</h3>
                <p className="text-sm text-muted-foreground">Who can use this workspace, and with which role.</p>
            </div>

            <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => { event.preventDefault(); void upsertRole(newEmail, newRole); }}
            >
                <Input
                    aria-label="User email address"
                    placeholder="name@example.com"
                    type="email"
                    className="sm:flex-1"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                />
                <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
                    <SelectTrigger aria-label="Role for new assignment" className="sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button type="submit" disabled={!newEmail.trim()}>
                    <Plus className="mr-1.5 size-4" aria-hidden="true" />
                    Add
                </Button>
            </form>

            <RoleAssignmentsTable
                assignments={assignments}
                loading={loading}
                passwordAuthEnabled={passwordAuthEnabled}
                onChangeRole={(email, role) => void upsertRole(email, role)}
                onSetPassword={(email) => { setPasswordEmail(email); setPasswordValue(""); }}
                onRemovePassword={(email) => void removePassword(email)}
                onRemove={(email) => removalTarget.request(email)}
            />

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

interface RoleAssignmentsTableProps {
    assignments: RoleAssignment[];
    loading: boolean;
    passwordAuthEnabled: boolean;
    onChangeRole: (email: string, role: UserRole) => void;
    onSetPassword: (email: string) => void;
    onRemovePassword: (email: string) => void;
    onRemove: (email: string) => void;
}

/** One row per user; fixed column widths keep every row's controls aligned. */
function RoleAssignmentsTable({
    assignments,
    loading,
    passwordAuthEnabled,
    onChangeRole,
    onSetPassword,
    onRemovePassword,
    onRemove,
}: RoleAssignmentsTableProps) {
    return (
        <div className="overflow-hidden rounded-lg border">
            <table className="w-full table-fixed text-sm">
                <colgroup>
                    <col />
                    <col className="w-36" />
                    <col className="w-28" />
                    <col className="w-12" />
                </colgroup>
                <thead className="border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                    <tr>
                        <th scope="col" className="px-4 py-2 font-medium">User</th>
                        <th scope="col" className="px-2 py-2 font-medium">Role</th>
                        <th scope="col" className="px-2 py-2 font-medium">Source</th>
                        <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {loading ? (
                        <tr><td colSpan={4} className="px-4 py-3 text-muted-foreground">Loading…</td></tr>
                    ) : assignments.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-3 text-muted-foreground">No one has a role yet.</td></tr>
                    ) : (
                        assignments.map((assignment) => {
                            const isBootstrap = assignment.source === "bootstrap";
                            return (
                                <tr key={assignment.email}>
                                    <td className="px-4 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate" title={assignment.email}>{assignment.email}</span>
                                            {passwordAuthEnabled && assignment.has_password && (
                                                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a local password" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-2 py-2">
                                        <Select
                                            value={assignment.role}
                                            disabled={isBootstrap}
                                            onValueChange={(value) => onChangeRole(assignment.email, value as UserRole)}
                                        >
                                            <SelectTrigger size="sm" className="w-full" aria-label={`Role for ${assignment.email}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-2 py-2 text-muted-foreground" title={isBootstrap ? "Set by BOOTSTRAP_ADMIN_USERS_STR in the deployment" : undefined}>
                                        {isBootstrap ? "Deployment" : "Assigned"}
                                    </td>
                                    <td className="py-2 pr-2 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${assignment.email}`}>
                                                    <MoreHorizontal aria-hidden="true" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {passwordAuthEnabled && (
                                                    <DropdownMenuItem onSelect={() => onSetPassword(assignment.email)}>
                                                        <KeyRound aria-hidden="true" />
                                                        {assignment.has_password ? "Reset password" : "Set password"}
                                                    </DropdownMenuItem>
                                                )}
                                                {passwordAuthEnabled && assignment.has_password && (
                                                    <DropdownMenuItem onSelect={() => onRemovePassword(assignment.email)}>
                                                        <KeyRound aria-hidden="true" />
                                                        Remove password
                                                    </DropdownMenuItem>
                                                )}
                                                {passwordAuthEnabled && <DropdownMenuSeparator />}
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    disabled={isBootstrap}
                                                    onSelect={() => onRemove(assignment.email)}
                                                >
                                                    <Trash2 aria-hidden="true" />
                                                    Remove access
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}
