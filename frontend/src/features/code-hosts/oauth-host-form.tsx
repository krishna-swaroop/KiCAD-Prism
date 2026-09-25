import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createConnector, deleteConnector, TrackerApiError, updateConnector } from "@/lib/trackers-client";
import { CopyField } from "@/features/tracker-integration/copy-field";
import type { TrackerConnector } from "@/types/trackers";

import { CodeHostMark, hostFromUrl, providerName, registerApplicationUrl } from "./code-host-meta";


interface OAuthHostFormProps {
    provider: "gitea";
    /** Omitted when adding a new host. */
    connector?: TrackerConnector | null;
    callbackUrl: string | null;
    onSaved: (connector: TrackerConnector) => void;
    onRemoved: (connectorId: string) => void;
}

function describe(error: unknown, fallback: string): string {
    if (error instanceof TrackerApiError || error instanceof Error) return error.message || fallback;
    return fallback;
}

/**
 * Account linking on Gitea/Forgejo: where the host lives, and the
 * OAuth application an admin registers there so people can sign in with it.
 */
// react-doctor-disable-next-line prefer-useReducer - each field is edited independently; save/remove are separate async states
export function OAuthHostForm({ provider, connector, callbackUrl, onSaved, onRemoved }: OAuthHostFormProps) {
    const existing = connector ?? null;
    const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
    const [displayName, setDisplayName] = useState(existing?.displayName ?? "");
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [removing, setRemoving] = useState(false);

    const host = hostFromUrl(baseUrl);
    const registerUrl = host ? registerApplicationUrl(provider, host) : null;
    const name = providerName(provider);
    const credentialsRequired = !existing?.oauthClientConfigured;
    const canSave = Boolean(host)
        && (credentialsRequired ? Boolean(clientId.trim() && clientSecret.trim()) : true)
        && (!existing || Boolean(clientId.trim() || clientSecret.trim() || displayName !== existing.displayName));

    const save = async () => {
        setSaving(true);
        setError(null);
        const credentials: Record<string, string> = {};
        if (clientId.trim()) credentials.oauthClientId = clientId.trim();
        if (clientSecret.trim()) credentials.oauthClientSecret = clientSecret.trim();
        try {
            const saved = existing
                ? await updateConnector(existing.id, {
                    displayName: displayName.trim() || undefined,
                    credentials: Object.keys(credentials).length ? credentials : undefined,
                })
                : await createConnector({
                    provider,
                    instanceKind: "self-hosted",
                    baseUrl: baseUrl.trim(),
                    displayName: displayName.trim() || host || name,
                    credentials,
                });
            setClientId("");
            setClientSecret("");
            toast.success(existing ? "Code host updated." : `${saved.displayName} is ready for account linking.`);
            onSaved(saved);
        } catch (caught) {
            setError(describe(caught, "The code host could not be saved."));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!existing) return;
        setRemoving(true);
        try {
            await deleteConnector(existing.id);
            toast.success(`${existing.displayName} removed.`);
            setConfirmRemove(false);
            onRemoved(existing.id);
        } catch (caught) {
            toast.error(describe(caught, "The code host could not be removed."));
        } finally {
            setRemoving(false);
        }
    };

    return (
        <form
            className="space-y-6"
            onSubmit={(event) => { event.preventDefault(); if (canSave && !saving) void save(); }}
        >
            <div className="flex items-center gap-3">
                <CodeHostMark provider={provider} />
                <div>
                    <h4 className="font-medium">{existing ? existing.displayName : `Add ${name}`}</h4>
                    <p className="text-sm text-muted-foreground">Account linking</p>
                </div>
            </div>

            <fieldset className="space-y-3" disabled={Boolean(existing)}>
                <legend className="text-sm font-medium">Instance</legend>
                <div className="space-y-1.5">
                    <Label htmlFor="code-host-url">Server address</Label>
                    <div className="flex gap-2">
                        <Input
                            id="code-host-url"
                            inputMode="url"
                            placeholder="https://codeberg.org"
                            value={baseUrl}
                            onChange={(event) => setBaseUrl(event.target.value)}
                            aria-invalid={Boolean(baseUrl.trim()) && !host}
                        />
                        {!existing && (
                            <Button type="button" variant="outline" onClick={() => setBaseUrl("https://codeberg.org")}>
                                Codeberg
                            </Button>
                        )}
                    </div>
                    {baseUrl.trim() && !host ? (
                        <p className="text-xs text-destructive">Enter the full https:// address.</p>
                    ) : null}
                </div>
            </fieldset>

            <div className="space-y-1.5">
                <Label htmlFor="code-host-name">Name</Label>
                <Input
                    id="code-host-name"
                    placeholder={host ?? name}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                />
            </div>

            <section className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm" aria-labelledby="register-app">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h5 id="register-app" className="font-medium">OAuth application</h5>
                    {!existing && registerUrl && (
                        <a href={registerUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs text-primary underline-offset-2 hover:underline">
                            Applications on {host}<ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                    )}
                </div>
                <CopyField
                    label="Redirect URI"
                    value={callbackUrl}
                    copyLabel="Copy redirect URI"
                    hint="Confidential client"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="code-host-client-id">Client ID</Label>
                        <Input id="code-host-client-id" autoComplete="off" value={clientId}
                            placeholder={existing?.oauthClientConfigured ? "Stored · type to replace" : ""}
                            onChange={(event) => setClientId(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="code-host-client-secret">Client Secret</Label>
                        <Input id="code-host-client-secret" type="password" autoComplete="new-password" value={clientSecret}
                            placeholder={existing?.oauthClientConfigured ? "Stored · type to replace" : ""}
                            onChange={(event) => setClientSecret(event.target.value)} />
                    </div>
                </div>
            </section>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            <div className="flex items-center gap-2">
                <Button type="submit" disabled={!canSave || saving}>
                    {saving ? "Saving…" : existing ? "Save changes" : `Add ${name}`}
                </Button>
                {existing && (
                    <Button type="button" variant="ghost" className="ml-auto text-destructive"
                        onClick={() => setConfirmRemove(true)}>
                        Remove code host
                    </Button>
                )}
            </div>

            {existing && (
                <ConfirmDialog
                    open={confirmRemove}
                    onOpenChange={setConfirmRemove}
                    title={`Remove ${existing.displayName}?`}
                    description={`Everyone who linked an account on ${existing.host || existing.displayName} is disconnected, and the stored OAuth application is deleted. Add it again at any time.`}
                    confirmLabel="Remove"
                    requireHold
                    busy={removing}
                    busyLabel="Removing…"
                    onConfirm={() => void remove()}
                />
            )}
        </form>
    );
}
