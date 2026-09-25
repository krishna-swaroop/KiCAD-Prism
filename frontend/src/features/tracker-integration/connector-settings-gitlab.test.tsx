import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createConnector: vi.fn(), getConnector: vi.fn() }));

vi.mock("@/lib/trackers-client", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/trackers-client")>()),
    createConnector: mocks.createConnector,
    getConnector: mocks.getConnector,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConnectorSettings } from "./connector-settings";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const created = {
    id: "cn_gl", provider: "gitlab", instanceKind: "self-hosted", displayName: "Pixxel GitLab",
    baseUrl: "https://gitlab.pixxel.io", host: "gitlab.pixxel.io", bot: { id: null, login: null },
    credentialConfigured: true, paused: true, pausedReason: "test_failed",
    capabilities: { issues: true, accountLinking: false },
};

it("creates a self-managed GitLab connection with its bot token", async () => {
    mocks.createConnector.mockResolvedValue(created);
    render(<ConnectorSettings connectorId={null} provider="gitlab" isAdmin />);
    expect(screen.getByText("New GitLab connection")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pixxel GitLab" } });
    // The instance picker is a Radix select; drive it the way a person would.
    fireEvent.click(screen.getByLabelText("Instance"));
    fireEvent.click(await screen.findByRole("option", { name: "Self-managed GitLab" }));
    const save = screen.getByRole("button", { name: "Create connection" });
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "gitlab.pixxel.io" } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "https://gitlab.pixxel.io" } });
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-bot" } });
    fireEvent.click(save);

    await waitFor(() => expect(mocks.createConnector).toHaveBeenCalledWith({
        provider: "gitlab",
        instanceKind: "self-hosted",
        displayName: "Pixxel GitLab",
        baseUrl: "https://gitlab.pixxel.io",
        credentials: { accessToken: "glpat-bot" },
    }));
});

it("names GitLab's account-linking fields the way GitLab does", async () => {
    mocks.getConnector.mockResolvedValue({ ...created, oauthClientConfigured: true });
    render(<ConnectorSettings connectorId="cn_gl" provider="gitlab" isAdmin />);
    expect(await screen.findByLabelText("Application ID")).toBeTruthy();
    expect(screen.getByLabelText("Secret")).toBeTruthy();
    expect(screen.getByText("Redirect URI")).toBeTruthy();
    expect(screen.getByText("Triggers: Issues events, Comments")).toBeTruthy();
    expect(screen.queryByText(/Revoked/)).toBeNull();
});
