import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { TrackerConnector } from "@/types/trackers";
import type { ConnectorCredentialFields } from "./connector-settings";
import { FormSection, SectionHeading } from "./connector-settings-section";

/** The server-provided URL takes precedence because it uses PUBLIC_BASE_URL. */
export function connectorWebhookPublicUrl(connectorId: string, origin = "", provider = "github"): string {
    const base = (origin || "https://prism.example").replace(/\/$/, "");
    return `${base}/api/trackers/webhooks/${encodeURIComponent(provider)}/${encodeURIComponent(connectorId)}`;
}

interface ConnectorDeliverySettingsProps {
    connector: TrackerConnector | null;
    credentials: ConnectorCredentialFields;
    setCredentials: Dispatch<SetStateAction<ConnectorCredentialFields>>;
    prismOrigin?: string;
}

export function ConnectorDeliverySettings({
    connector,
    credentials,
    setCredentials,
    prismOrigin,
}: ConnectorDeliverySettingsProps) {
    const [oauthOpen, setOauthOpen] = useState(Boolean(connector?.oauthClientConfigured));

    const webhookUrl = useMemo(() => {
        if (!connector?.id) return null;
        return connector.webhookUrl ?? connectorWebhookPublicUrl(connector.id, prismOrigin, connector.provider);
    }, [connector?.id, connector?.provider, connector?.webhookUrl, prismOrigin]);

    const oauthCallbackUrl = useMemo(() => {
        if (!webhookUrl) return null;
        try {
            return `${new URL(webhookUrl).origin}/api/trackers/oauth/callback`;
        } catch {
            return null;
        }
    }, [webhookUrl]);

    const copyWebhook = async () => {
        if (!webhookUrl) return;
        try {
            await navigator.clipboard.writeText(webhookUrl);
            toast.success("Webhook URL copied.");
        } catch {
            toast.error("Could not copy webhook URL.");
        }
    };

    return (
        <>
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
        </>
    );
}
