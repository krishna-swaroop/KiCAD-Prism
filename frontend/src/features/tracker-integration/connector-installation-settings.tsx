import type { Dispatch, SetStateAction } from "react";
import { Activity, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ConnectorTestResult, TrackerConnector } from "@/types/trackers";
import type { ConnectorCredentialFields } from "./connector-settings";
import { SectionHeading } from "./connector-settings-section";

/** Placeholder for a secret field; stored values are never sent back to the browser. */
export function credentialRotationHint(configured: boolean): string {
    return configured ? "Stored · type to replace" : "";
}

interface ConnectorInstallationSettingsProps {
    connector: TrackerConnector | null;
    credentials: ConnectorCredentialFields;
    setCredentials: Dispatch<SetStateAction<ConnectorCredentialFields>>;
    testing: boolean;
    lifecycleBusy: boolean;
    testResult: ConnectorTestResult | null;
    onTest: () => void | Promise<void>;
}

export function ConnectorInstallationSettings({
    connector,
    credentials,
    setCredentials,
    testing,
    lifecycleBusy,
    testResult,
    onTest,
}: ConnectorInstallationSettingsProps) {
    const stored = Boolean(connector?.credentialConfigured);
    return (
        <fieldset className="space-y-3">
            <legend className="sr-only">GitHub App installation</legend>
            <SectionHeading
                step={2}
                title="GitHub App"
                description="From the App's settings page on GitHub."
                trailing={stored ? <Badge variant="success">Stored</Badge> : <Badge variant="secondary">Required</Badge>}
            />
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-app-id">App ID</Label>
                    <Input
                        id="tracker-app-id"
                        value={credentials.appId}
                        onChange={(event) => setCredentials((prev) => ({ ...prev, appId: event.target.value }))}
                        placeholder={stored ? credentialRotationHint(true) : "123456"}
                        autoComplete="off"
                        inputMode="numeric"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-installation-id">Installation ID</Label>
                    <Input
                        id="tracker-installation-id"
                        value={credentials.installationId}
                        onChange={(event) =>
                            setCredentials((prev) => ({ ...prev, installationId: event.target.value }))
                        }
                        placeholder={stored ? credentialRotationHint(true) : "987654"}
                        autoComplete="off"
                        inputMode="numeric"
                    />
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="tracker-private-key">Private key (PEM)</Label>
                <Textarea
                    id="tracker-private-key"
                    value={credentials.privateKey}
                    onChange={(event) =>
                        setCredentials((prev) => ({ ...prev, privateKey: event.target.value }))
                    }
                    placeholder={stored ? credentialRotationHint(true) : "Paste the downloaded .pem file"}
                    className="min-h-24 font-mono text-[11px]"
                    autoComplete="off"
                    spellCheck={false}
                />
                <p className="text-[11px] text-muted-foreground">Permissions: Issues read &amp; write · Metadata read</p>
            </div>
            {connector?.id ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={testing || lifecycleBusy}
                        onClick={() => void onTest()}
                    >
                        {testing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Activity aria-hidden="true" />}
                        {testing ? "Testing…" : "Test connection"}
                    </Button>
                    {testResult ? (
                        <span className="text-xs" data-testid="connector-test-result" aria-live="polite">
                            {testResult.ok ? "Connected" : "Test failed"}
                            {testResult.bot?.login ? ` · publishes as ${testResult.bot.login}` : ""}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </fieldset>
    );
}
