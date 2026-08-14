import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GitBranch, Copy, FileCode, Shield, Plus, Trash2, KeyRound } from "lucide-react";
import { User, UserRole } from "@/types/auth";
import { fetchApi, readApiError } from "@/lib/api";
import { ROLE_OPTIONS, roleLabel } from "@/lib/roles";
import { RoleAuthorityPopover } from "@/components/role-authority-popover";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
}

type SettingsTab = "git" | "access" | "general";

interface RoleAssignment {
    email: string;
    role: UserRole;
    source: string;
    has_password?: boolean;
}

export function SettingsDialog({ open, onOpenChange, user }: SettingsDialogProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>("git");
    const isAdmin = user?.role === "admin";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden flex h-[600px]">
                <DialogTitle className="sr-only">Workspace Settings</DialogTitle>
                <DialogDescription className="sr-only">
                    Manage Git, SSH, and access control settings for this workspace.
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
                        variant={activeTab === "general" ? "secondary" : "ghost"}
                        className="justify-start opacity-50 cursor-not-allowed"
                        title="Coming soon"
                    >
                        <FileCode className="mr-2 h-4 w-4" />
                        General
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === "git" && <GitSettings user={user} />}
                    {activeTab === "access" && <AccessControlSettings isAdmin={isAdmin} />}
                    {activeTab === "general" && (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            General settings coming soon.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
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

    // Password provisioning. The admin sets a value the user must change on next
    // login, so it is only ever a one-time credential.
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
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-medium">Access Control</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage role assignments for workspace users.
                    </p>
                </div>
                <RoleAuthorityPopover trigger="View role permissions" />
            </div>

            <div className="rounded-lg border p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-2">
                    <Input
                        placeholder="user@example.com"
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                    />
                    <select
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
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => { setPasswordEmail(assignment.email); setPasswordValue(""); }}
                                        aria-label={`Set password for ${assignment.email}`}
                                        title={assignment.has_password ? "Reset password" : "Set password"}
                                    >
                                        <KeyRound className={`h-4 w-4 ${assignment.has_password ? "text-primary" : ""}`} />
                                    </Button>
                                    {assignment.has_password && (
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

            <Dialog open={passwordEmail !== null} onOpenChange={(next) => { if (!next) { setPasswordEmail(null); setPasswordValue(""); } }}>
                <DialogContent className="max-w-sm">
                    <DialogTitle>Set a password</DialogTitle>
                    <DialogDescription>
                        {passwordEmail} will be required to change this password on their next sign-in.
                        Their existing sessions are ended.
                    </DialogDescription>
                    <form
                        className="mt-2 space-y-3"
                        onSubmit={(e) => { e.preventDefault(); void submitPassword(); }}
                    >
                        <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="Temporary password"
                            value={passwordValue}
                            onChange={(e) => setPasswordValue(e.target.value)}
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
