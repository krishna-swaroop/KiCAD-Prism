import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { IssueHostProvider } from "./connector-settings";
import { FormSection } from "./connector-settings-section";

interface InstanceOption {
    value: string;
    label: string;
    /** Needs an address the admin types. */
    selfHosted: boolean;
}

const INSTANCES: Record<IssueHostProvider, InstanceOption[]> = {
    github: [
        { value: "github.com", label: "github.com", selfHosted: false },
        { value: "ghes", label: "GitHub Enterprise Server", selfHosted: true },
    ],
    gitlab: [
        { value: "gitlab.com", label: "GitLab.com", selfHosted: false },
        { value: "self-hosted", label: "Self-managed GitLab", selfHosted: true },
    ],
};

const ADDRESS: Record<IssueHostProvider, { label: string; placeholder: string }> = {
    github: { label: "API base URL", placeholder: "https://ghe.example.com/api/v3" },
    gitlab: { label: "Server address", placeholder: "https://gitlab.example.com" },
};

interface ConnectorIdentitySettingsProps {
    provider: IssueHostProvider;
    connectorId?: string;
    displayName: string;
    setDisplayName: (value: string) => void;
    instanceKind: string;
    setInstanceKind: (value: string) => void;
    baseUrl: string;
    setBaseUrl: (value: string) => void;
}

export function isSelfHostedInstance(provider: IssueHostProvider, instanceKind: string): boolean {
    return INSTANCES[provider].some((option) => option.value === instanceKind && option.selfHosted);
}

export function ConnectorIdentitySettings({
    provider,
    connectorId,
    displayName,
    setDisplayName,
    instanceKind,
    setInstanceKind,
    baseUrl,
    setBaseUrl,
}: ConnectorIdentitySettingsProps) {
    const options = INSTANCES[provider];
    const selected = options.find((option) => option.value === instanceKind) ?? options[0];
    return (
        <FormSection step={1} title="Connection">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-display-name">Name</Label>
                    <Input
                        id="tracker-display-name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder={provider === "gitlab" ? "GitLab" : "GitHub"}
                        autoComplete="off"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-instance-kind">Instance</Label>
                    <Select value={selected.value} onValueChange={setInstanceKind} disabled={Boolean(connectorId)}>
                        <SelectTrigger id="tracker-instance-kind" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {selected.selfHosted ? (
                <div className="space-y-1.5">
                    <Label htmlFor="tracker-base-url">{ADDRESS[provider].label}</Label>
                    <Input
                        id="tracker-base-url"
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                        placeholder={ADDRESS[provider].placeholder}
                        inputMode="url"
                        autoComplete="off"
                    />
                </div>
            ) : null}
        </FormSection>
    );
}
