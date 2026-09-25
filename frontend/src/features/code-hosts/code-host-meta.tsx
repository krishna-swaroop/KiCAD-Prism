import { Github, Gitlab, Server } from "lucide-react";
import { cn } from "@/lib/utils";

/** The code hosts Prism can talk to, in the order an admin is offered them. */
export type CodeHostProvider = "github" | "gitlab" | "gitea";

export const CODE_HOST_PROVIDERS: CodeHostProvider[] = ["github", "gitlab", "gitea"];

export function providerName(provider: string): string {
    if (provider === "github") return "GitHub";
    if (provider === "gitlab") return "GitLab";
    if (provider === "gitea") return "Gitea / Forgejo";
    return provider;
}

export function instanceLabel(provider: string, instanceKind: string): string {
    if (provider === "github") return instanceKind === "ghes" ? "GitHub Enterprise Server" : "GitHub.com";
    if (provider === "gitlab") return instanceKind === "gitlab.com" ? "GitLab.com" : "Self-managed GitLab";
    if (provider === "gitea") return "Gitea or Forgejo server";
    return instanceKind;
}

/** Brand marks for the two hosted forges; self-hosted Gitea/Forgejo gets a neutral server mark. */
export function CodeHostMark({ provider, className }: { provider: string; className?: string }) {
    const Icon = provider === "github" ? Github : provider === "gitlab" ? Gitlab : Server;
    return (
        <span
            className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-foreground",
                className,
            )}
            aria-hidden="true"
        >
            <Icon className="size-4" />
        </span>
    );
}

function origin(host: string): string | null {
    const trimmed = host.trim();
    return trimmed ? `https://${trimmed}` : null;
}

/** Public profile of a linked account. */
export function profileUrl(host: string, login: string): string | null {
    const base = origin(host);
    return base && login ? `${base}/${encodeURIComponent(login)}` : null;
}

/** Where a person removes Prism from their own account on the host. */
export function authorizedAppsUrl(provider: string, host: string): string | null {
    const base = origin(host);
    if (!base) return null;
    if (provider === "github") return `${base}/settings/applications`;
    if (provider === "gitlab") return `${base}/-/user_settings/applications`;
    if (provider === "gitea") return `${base}/user/settings/applications`;
    return null;
}

/** Where an admin registers Prism as an OAuth application on the host. */
export function registerApplicationUrl(provider: string, host: string): string | null {
    const base = origin(host);
    if (!base) return null;
    if (provider === "gitlab") return `${base}/-/user_settings/applications`;
    if (provider === "gitea") return `${base}/user/settings/applications`;
    return null;
}

/** Hostname from a URL an admin typed, or ``null`` while it is not a valid https URL. */
export function hostFromUrl(value: string): string | null {
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" && url.hostname ? url.host : null;
    } catch {
        return null;
    }
}
