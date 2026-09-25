import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listConnectors: vi.fn(),
    getOAuthCallbackUrl: vi.fn(),
    createConnector: vi.fn(),
}));

vi.mock("@/lib/trackers-client", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/trackers-client")>()),
    listConnectors: mocks.listConnectors,
    getOAuthCallbackUrl: mocks.getOAuthCallbackUrl,
    createConnector: mocks.createConnector,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/tracker-integration/connector-settings", () => ({
    ConnectorSettings: ({ provider }: { provider?: string }) => <div>Issue host editor for {provider}</div>,
}));

import { CodeHostsSettings } from "./code-hosts-settings";

const CALLBACK = "https://prism.example/api/trackers/oauth/callback";
const base = { bot: { id: null, login: null }, credentialConfigured: false, paused: false, baseUrl: "" };

beforeEach(() => {
    mocks.getOAuthCallbackUrl.mockResolvedValue(CALLBACK);
    mocks.listConnectors.mockResolvedValue([
        { ...base, id: "cn_gh", provider: "github", instanceKind: "github.com", displayName: "GitHub", host: "github.com",
            credentialConfigured: true, writesEnabled: true, capabilities: { issues: true, accountLinking: false } },
        // No bot token yet: this GitLab only links accounts.
        { ...base, id: "cn_gl", provider: "gitlab", instanceKind: "self-hosted", displayName: "Acme GitLab",
            host: "gitlab.acme.io", capabilities: { issues: true, accountLinking: true } },
    ]);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

it("summarises what each host does and whether it is ready", async () => {
    render(<CodeHostsSettings />);
    expect(await screen.findByText("Issues")).toBeTruthy();
    expect(screen.getByText("Accounts")).toBeTruthy();
    expect(screen.getAllByText("Ready")).toHaveLength(2);
});

it("walks an admin through registering a Gitea or Forgejo server", async () => {
    mocks.createConnector.mockResolvedValue({
        ...base, id: "cn_new", provider: "gitea", instanceKind: "self-hosted", displayName: "git.corp.io",
        host: "git.corp.io", oauthClientConfigured: true, capabilities: { issues: false, accountLinking: true },
    });
    render(<CodeHostsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Add code host/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Gitea \/ Forgejo/ }));

    const save = screen.getByRole("button", { name: "Add Gitea / Forgejo" });
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "http://git.corp.io" } });
    expect(screen.getByText("Enter the full https:// address.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "https://git.corp.io" } });

    expect(screen.getByRole("link", { name: /Applications on git.corp.io/ }).getAttribute("href"))
        .toBe("https://git.corp.io/user/settings/applications");
    expect(screen.getByText(CALLBACK)).toBeTruthy();
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "app-id" } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "app-secret" } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.createConnector).toHaveBeenCalledWith({
        provider: "gitea",
        instanceKind: "self-hosted",
        baseUrl: "https://git.corp.io",
        displayName: "git.corp.io",
        credentials: { oauthClientId: "app-id", oauthClientSecret: "app-secret" },
    }));
});

it("opens GitLab in the same editor as GitHub", async () => {
    render(<CodeHostsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Add code host/ }));
    fireEvent.click(screen.getByRole("button", { name: /^GitLab/ }));
    expect(screen.getByText("Issue host editor for gitlab")).toBeTruthy();
});

it("offers Codeberg as a one-click Gitea/Forgejo address", async () => {
    render(<CodeHostsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Add code host/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Gitea \/ Forgejo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Codeberg" }));
    expect((screen.getByLabelText("Server address") as HTMLInputElement).value).toBe("https://codeberg.org");
    expect(screen.getByRole("link", { name: /Applications on codeberg.org/ }).getAttribute("href"))
        .toBe("https://codeberg.org/user/settings/applications");
});

it("uses the issue host editor for GitHub", async () => {
    render(<CodeHostsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /^GitHub github\.com/ }));
    expect(screen.getByText("Issue host editor for github")).toBeTruthy();
});
