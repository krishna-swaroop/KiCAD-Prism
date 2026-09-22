import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "./connector-settings-section";

interface ConnectorIdentitySettingsProps {
    connectorId?: string;
    displayName: string;
    setDisplayName: (value: string) => void;
    instanceKind: string;
    setInstanceKind: (value: string) => void;
    baseUrl: string;
    setBaseUrl: (value: string) => void;
}

export function ConnectorIdentitySettings({
    connectorId,
    displayName,
    setDisplayName,
    instanceKind,
    setInstanceKind,
    baseUrl,
    setBaseUrl,
}: ConnectorIdentitySettingsProps) {
    return (
        <FormSection
            step={1}
            title="Connection"
            description="How this connection is shown in Prism and which GitHub it talks to."
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-display-name">Display name</Label>
                    <Input
                        id="tracker-display-name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="GitHub"
                        autoComplete="off"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-instance-kind">Instance</Label>
                    <Select
                        value={instanceKind === "github.com" ? "github.com" : "ghes"}
                        onValueChange={(value) => setInstanceKind(value === "ghes" ? "ghes" : "github.com")}
                        disabled={Boolean(connectorId)}
                    >
                        <SelectTrigger id="tracker-instance-kind" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="github.com">github.com</SelectItem>
                            <SelectItem value="ghes">GitHub Enterprise Server</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {instanceKind !== "github.com" ? (
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-base-url">API base URL</Label>
                    <Input
                        id="tracker-base-url"
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                        placeholder="https://ghe.example.com/api/v3"
                        autoComplete="off"
                    />
                </div>
            ) : null}
        </FormSection>
    );
}
