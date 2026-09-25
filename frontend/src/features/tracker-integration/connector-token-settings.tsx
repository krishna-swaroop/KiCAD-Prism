import type { Dispatch, SetStateAction } from "react";
import { Activity, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConnectorTestResult, TrackerConnector } from "@/types/trackers";
import type { ConnectorCredentialFields } from "./connector-settings";
import { SectionHeading } from "./connector-settings-section";
import { credentialRotationHint } from "./connector-installation-settings";

interface ConnectorTokenSettingsProps {
    connector: TrackerConnector | null;
    credentials: ConnectorCredentialFields;
    setCredentials: Dispatch<SetStateAction<ConnectorCredentialFields>>;
    testing: boolean;
    lifecycleBusy: boolean;
    testResult: ConnectorTestResult | null;
    onTest: () => void | Promise<void>;
}

/** GitLab publishes as a bot user through one access token. */
export function ConnectorTokenSettings({
    connector,
    credentials,
    setCredentials,
    testing,
    lifecycleBusy,
    testResult,
    onTest,
}: ConnectorTokenSettingsProps) {
    const stored = Boolean(connector?.credentialConfigured);
    return (
        <fieldset className="space-y-3">
            <legend className="sr-only">GitLab bot token</legend>
            <SectionHeading
                step={2}
                title="Bot token"
                description="Optional. Needed to publish issues; account linking works without it."
                trailing={stored ? <Badge variant="success">Stored</Badge> : <Badge variant="secondary">Optional</Badge>}
            />
            <div className="space-y-1.5">
                <Label htmlFor="tracker-access-token">Access token</Label>
                <Input
                    id="tracker-access-token"
                    type="password"
                    value={credentials.accessToken}
                    onChange={(event) => setCredentials((prev) => ({ ...prev, accessToken: event.target.value }))}
                    placeholder={stored ? credentialRotationHint(true) : "glpat-…"}
                    autoComplete="off"
                    spellCheck={false}
                />
                <p className="text-[11px] text-muted-foreground">
                    Project or group access token, or a bot user&apos;s personal access token · scope api · role Developer
                </p>
            </div>
            {connector?.id && stored ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" disabled={testing || lifecycleBusy} onClick={() => void onTest()}>
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
