/**
 * Settings pages addressable as ``?settings=<tab>``. Kept apart from the
 * lazily loaded dialog so hosts can read a deep link without loading it.
 */
export type SettingsTab = "accounts" | "password" | "tokens" | "mcp-clients" | "mcp" | "webhooks" | "git" | "access" | "code-hosts" | "extensions";

const SETTINGS_TABS: readonly SettingsTab[] = ["accounts", "password", "tokens", "mcp-clients", "mcp", "webhooks", "git", "access", "code-hosts", "extensions"];

export function settingsTabFromParam(value: string | null): SettingsTab | null {
    return value && (SETTINGS_TABS as readonly string[]).includes(value) ? (value as SettingsTab) : null;
}

/** Workspace URL that opens Settings on ``tab``. */
export function settingsHref(tab: SettingsTab): string {
    return `/?settings=${tab}`;
}
