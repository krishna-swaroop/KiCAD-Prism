import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchApi, readApiError } from "@/lib/api";

/** Every scope a personal access token may hold; `remote_symbols.read` is the KiCad provider's. */
export const PERSONAL_TOKEN_SCOPES = [
    "api:read",
    "api:write",
    "comments:write",
    "design:write",
    "catalog:write",
    "release:approve",
    "catalog:qa",
    "admin",
    "ops:read",
    "ops:act",
] as const;

export interface PersonalAccessToken {
    id: string;
    user_email: string;
    name: string;
    scopes: string[];
    prefix: string;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

function formatDate(value: string | null): string {
    if (!value) return "never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString();
}

/**
 * Personal access tokens: scoped, expiring credentials a person creates here for
 * scripts and CI. The secret is shown once, in the create response, and never
 * returned again; rows show only the stored prefix.
 */
export function PersonalAccessTokens() {
    const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<string[]>(["api:read"]);
    const [days, setDays] = useState(90);
    const [creating, setCreating] = useState(false);
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const revokeTarget = useConfirmTarget<PersonalAccessToken>();

    const reload = useCallback(async () => {
        try {
            const response = await fetchApi("/api/auth/tokens");
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to load personal access tokens"));
            }
            setTokens((await response.json()) as PersonalAccessToken[]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load personal access tokens");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const toggleScope = (scope: string, checked: boolean) => {
        setScopes((current) =>
            checked ? [...current, scope] : current.filter((value) => value !== scope),
        );
    };

    const create = async () => {
        setCreating(true);
        try {
            const response = await fetchApi("/api/auth/tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), scopes, expiresInDays: days }),
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to create personal access token"));
            }
            const created = (await response.json()) as PersonalAccessToken & { token: string };
            setCreatedToken(created.token);
            setName("");
            await reload();
            toast.success("Personal access token created");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create personal access token");
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (token: PersonalAccessToken) => {
        try {
            const response = await fetchApi(`/api/auth/tokens/${encodeURIComponent(token.id)}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to revoke personal access token"));
            }
            toast.success("Personal access token revoked");
            await reload();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to revoke personal access token");
        }
    };

    const copy = () => {
        if (!createdToken) return;
        void navigator.clipboard.writeText(createdToken);
        toast.success("Token copied to clipboard");
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium">Personal access tokens</h3>

            <form
                className="space-y-3 rounded-lg border p-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void create();
                }}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="pat-name">Name</Label>
                    <Input
                        id="pat-name"
                        aria-label="Token name"
                        placeholder="ci-runner"
                        maxLength={80}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {PERSONAL_TOKEN_SCOPES.map((scope) => (
                        <label key={scope} className="flex items-center gap-1.5 text-xs font-mono">
                            <Checkbox
                                aria-label={scope}
                                checked={scopes.includes(scope)}
                                onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                            />
                            {scope}
                        </label>
                    ))}
                </div>
                <div className="flex items-end gap-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="pat-days">Expiry (days)</Label>
                        <Input
                            id="pat-days"
                            aria-label="Expiry days"
                            type="number"
                            min={1}
                            className="w-28"
                            value={days}
                            onChange={(event) => setDays(Number(event.target.value))}
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={creating || !name.trim() || scopes.length === 0 || days < 1}
                    >
                        {creating ? "Creating…" : "Create"}
                    </Button>
                </div>
            </form>

            {createdToken && (
                <div className="flex items-center gap-2">
                    <Input
                        readOnly
                        aria-label="New personal access token"
                        className="font-mono text-xs"
                        value={createdToken}
                    />
                    <Button type="button" size="icon" variant="ghost" title="Copy token" onClick={copy}>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
            )}

            <div className="divide-y rounded-md border">
                {loading ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
                ) : tokens.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No personal access tokens.</p>
                ) : (
                    tokens.map((token) => (
                        <div key={token.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                            <span className="min-w-0 flex-1 truncate font-medium" title={token.name}>
                                {token.name}
                            </span>
                            <span className="font-mono text-muted-foreground" title="Token prefix">
                                {token.prefix}…
                            </span>
                            <span
                                className="min-w-0 max-w-40 truncate font-mono text-muted-foreground"
                                title={token.scopes.join(" ")}
                            >
                                {token.scopes.join(" ")}
                            </span>
                            <span className="whitespace-nowrap text-muted-foreground" title="Expires">
                                {formatDate(token.expires_at)}
                            </span>
                            <span
                                className="whitespace-nowrap text-muted-foreground"
                                title={`Last used ${formatDate(token.last_used_at)}`}
                            >
                                {formatDate(token.last_used_at)}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                aria-label={`Revoke token ${token.name}`}
                                onClick={() => revokeTarget.request(token)}
                            >
                                Revoke
                            </Button>
                        </div>
                    ))
                )}
            </div>

            <ConfirmDialog
                open={revokeTarget.open}
                onOpenChange={(next) => {
                    if (!next) revokeTarget.clear();
                }}
                title="Revoke personal access token"
                description={
                    revokeTarget.target
                        ? `${revokeTarget.target.name} stops working immediately.`
                        : ""
                }
                confirmLabel="Hold to revoke"
                requireHold
                onConfirm={() => {
                    const target = revokeTarget.target;
                    revokeTarget.clear();
                    if (target) void revoke(target);
                }}
            />
        </div>
    );
}
