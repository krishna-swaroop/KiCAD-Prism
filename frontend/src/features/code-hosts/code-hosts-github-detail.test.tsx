import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listConnectors: vi.fn(),
    getOAuthCallbackUrl: vi.fn(),
    getConnector: vi.fn(),
}));

vi.mock("@/lib/trackers-client", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/trackers-client")>()),
    listConnectors: mocks.listConnectors,
    getOAuthCallbackUrl: mocks.getOAuthCallbackUrl,
    getConnector: mocks.getConnector,
}));

import { CodeHostsSettings } from "./code-hosts-settings";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

it("loads a GitHub connection once instead of re-fetching on every render", async () => {
    const github = {
        id: "cn_gh", provider: "github", instanceKind: "github.com", displayName: "GitHub-Testing",
        baseUrl: "", host: "github.com", bot: { id: null, login: null }, credentialConfigured: true,
        paused: true, pausedReason: "test_failed", capabilities: { issues: true, accountLinking: true },
    };
    mocks.listConnectors.mockResolvedValue([github]);
    mocks.getOAuthCallbackUrl.mockResolvedValue("https://prism.example/api/trackers/oauth/callback");
    mocks.getConnector.mockResolvedValue(github);

    render(<CodeHostsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /GitHub-Testing/ }));
    expect(await screen.findByDisplayValue("GitHub-Testing")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mocks.getConnector).toHaveBeenCalledTimes(1);
});
