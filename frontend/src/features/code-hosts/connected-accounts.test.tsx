import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listLinkableCodeHosts: vi.fn(),
    listIdentities: vi.fn(),
    beginIdentityLink: vi.fn(),
    unlinkIdentity: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trackers-client", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/trackers-client")>()),
    listLinkableCodeHosts: mocks.listLinkableCodeHosts,
    listIdentities: mocks.listIdentities,
    beginIdentityLink: mocks.beginIdentityLink,
    unlinkIdentity: mocks.unlinkIdentity,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }));

import { ConnectedAccounts } from "./connected-accounts";

const GITHUB = { id: "cn_gh", provider: "github", instanceKind: "github.com", displayName: "GitHub", host: "github.com" };
const GITLAB = { id: "cn_gl", provider: "gitlab", instanceKind: "self-hosted", displayName: "Acme GitLab", host: "gitlab.acme.io" };
const ANA = { connectorId: "cn_gh", provider: "github", forgeUserId: "1", forgeLogin: "ana", scopes: ["read:user"],
    linkedAt: "2026-09-24T10:00:00Z", status: "active" };

function Location() {
    const location = useLocation();
    return <output aria-label="location">{location.search}</output>;
}

function renderAccounts(props: Partial<Parameters<typeof ConnectedAccounts>[0]> = {}, search = "?settings=accounts") {
    return render(
        <MemoryRouter initialEntries={[`/${search}`]}>
            <ConnectedAccounts signInEnabled isAdmin={false} {...props} />
            <Location />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mocks.listLinkableCodeHosts.mockResolvedValue([GITHUB, GITLAB]);
    mocks.listIdentities.mockResolvedValue([ANA]);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

it("shows each code host with the linked handle or a Connect action", async () => {
    renderAccounts();
    const handle = await screen.findByRole("link", { name: "@ana" });
    expect(handle.getAttribute("href")).toBe("https://github.com/ana");
    expect(screen.getByText("gitlab.acme.io")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
});

it("sends the browser to the host and asks to come back to this page", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/", assign });
    mocks.beginIdentityLink.mockResolvedValue({ authorizeUrl: "https://gitlab.acme.io/oauth/authorize?x=1" });
    renderAccounts();
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://gitlab.acme.io/oauth/authorize?x=1"));
    expect(mocks.beginIdentityLink).toHaveBeenCalledWith("cn_gl", "/?settings=accounts");
});

it("confirms a completed link by name and clears the callback parameters", async () => {
    renderAccounts({}, "?settings=accounts&tracker_oauth=linked&tracker_oauth_connector=cn_gh");
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Connected GitHub as @ana"));
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toBe("?settings=accounts"));
});

it("explains a failed link in plain words", async () => {
    renderAccounts({}, "?settings=accounts&tracker_oauth=error&tracker_oauth_error=missing_code_or_state");
    expect(await screen.findByText("Linking was cancelled or did not finish on the code host.")).toBeTruthy();
});

it("disconnects only after confirmation", async () => {
    mocks.unlinkIdentity.mockResolvedValue(undefined);
    renderAccounts();
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText(/credit you by name instead of @ana/)).toBeTruthy();
    expect(mocks.unlinkIdentity).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!);
    await waitFor(() => expect(mocks.unlinkIdentity).toHaveBeenCalledWith("cn_gh"));
    await waitFor(() => expect(screen.getAllByText("Not connected")).toHaveLength(2));
});

it("cannot link without sign-in", async () => {
    renderAccounts({ signInEnabled: false });
    expect(await screen.findByText("Sign-in is off for this workspace")).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "Connect" })) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(mocks.listIdentities).not.toHaveBeenCalled();
});

it("points admins at setup when nothing can be linked", async () => {
    mocks.listLinkableCodeHosts.mockResolvedValue([]);
    const onSetUp = vi.fn();
    renderAccounts({ isAdmin: true, onSetUpCodeHosts: onSetUp });
    fireEvent.click(await screen.findByRole("button", { name: "Set up a code host" }));
    expect(onSetUp).toHaveBeenCalled();
});
