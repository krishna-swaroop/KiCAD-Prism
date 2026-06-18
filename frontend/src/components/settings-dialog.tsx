import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GitBranch, Copy, FileCode, Shield, Plus, Trash2 } from "lucide-react";
import { User, UserRole } from "@/types/auth";
import { fetchApi, readApiError } from "@/lib/api";
import { ROLE_OPTIONS, roleLabel } from "@/lib/roles";

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

function GitSettings({ user }: { user: User | null }) {
    const [sshKey, setSshKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [email] = useState(user?.email || "kicad-prism@example.com");

    const fetchSshKey = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const res = await fetchApi("/api/settings/ssh-key", { signal });
            if (res.ok) {
                const data = await res.json();
                setSshKey(data.public_key);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                return;
            }
            console.error("Failed to fetch SSH key", err);
            toast.error("Failed to load SSH key settings");
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void fetchSshKey(controller.signal);
        return () => controller.abort();
    }, [fetchSshKey]);

    const generateKey = async () => {
        if (!window.confirm("This will overwrite any existing SSH key. Continue?")) return;

        setGenerating(true);
        try {
            const res = await fetchApi("/api/settings/ssh-key/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                const data = await res.json();
                setSshKey(data.public_key);
                toast.success("New SSH key generated successfully");
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
            toast.success("SSH Key copied to clipboard");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Git Configuration</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your SSH keys for authenticating with Git providers like GitHub and GitLab.
                </p>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">SSH Key</Label>
                        <p className="text-sm text-muted-foreground">
                            Your public SSH key for identifying this workspace.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={generateKey}
                        disabled={generating}
                    >
                        {generating ? "Generating..." : "Generate New Key"}
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
                        No SSH key found. Click "Generate New Key" to create one.
                    </div>
                )}
            </div>
        </div>
    );
}

function AccessControlSettings({ isAdmin }: { isAdmin: boolean }) {
    const [loading, setLoading] = useState(false);
    const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
    const [newEmail, setNewEmail] = useState("");
    const [newRole, setNewRole] = useState<UserRole>("viewer");

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
        if (!window.confirm(`Remove role assignment for ${email}?`)) {
            return;
        }

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
                                <div className="flex justify-end">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isBootstrap}
                                        onClick={() => void removeRole(assignment.email)}
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
        </div>
    );
}
