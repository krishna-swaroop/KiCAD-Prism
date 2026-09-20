import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerUiMocks } from "@/lib/trackers-client-fixtures";
import { fetchApi } from "@/lib/api";
import {
    ConnectedAccounts,
    TRACKER_OAUTH_RETURN_KEY,
    clearOAuthCallbackSearch,
    connectorRowKey,
    consumeOAuthReturnPath,
    describeConnectedAccountsError,
    formatIdentityExpiry,
    identityIsUsable,
    identityStatusLabel,
    parseOAuthCallbackSearch,
    storeOAuthReturnPath,
    unlinkedAssignmentHint,
} from "./connected-accounts";
import {
    TrackerApiError,
    beginIdentityLink,
    listIdentities,
    unlinkIdentity,
} from "./index";

vi.mock("sonner", () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, fetchApi: vi.fn() };
});

const mockedFetch = vi.mocked(fetchApi);

const respond = (payload: unknown, status = 200): Response =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const githubCom = {
    id: "cn_gh1",
    provider: "github",
    displayName: "GitHub.com",
    instanceKind: "github.com",
};

const ghes = {
    id: "cn_ghe1",
    provider: "github",
    displayName: "GitHub Enterprise",
    instanceKind: "ghe.example.com",
};

const ghesIdentity = {
    ...trackerUiMocks.identity,
    connectorId: "cn_ghe1",
    forgeLogin: "arjun-ghe",
    forgeUserId: "5550002",
};

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.classList.remove("dark");
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
});

beforeEach(() => {
    mockedFetch.mockReset();
    Object.defineProperty(window, "location", {
        configurable: true,
        value: {
            ...window.location,
            assign: vi.fn(),
            pathname: "/workspace",
            search: "",
            href: "http://localhost/workspace",
        },
    });
});

describe("connected account helpers", () => {
    it("stores and consumes the OAuth return path", () => {
        storeOAuthReturnPath("/workspace?settings=accounts");
        expect(sessionStorage.getItem(TRACKER_OAUTH_RETURN_KEY)).toBe("/workspace?settings=accounts");
        expect(consumeOAuthReturnPath()).toBe("/workspace?settings=accounts");
        expect(sessionStorage.getItem(TRACKER_OAUTH_RETURN_KEY)).toBeNull();
    });

    it("parses OAuth callback search params and clears them", () => {
        expect(parseOAuthCallbackSearch("?tracker_oauth=linked")).toEqual({ result: "linked", errorCode: null });
        expect(parseOAuthCallbackSearch("?tracker_oauth=error&tracker_oauth_error=session_expired")).toEqual({
            result: "error",
            errorCode: "session_expired",
        });
        expect(clearOAuthCallbackSearch("?tracker_oauth=linked&connector_id=cn_gh1&tab=general")).toBe("?tab=general");
    });

    it("labels identity status and formats expiry without leaking secrets", () => {
        expect(identityStatusLabel("active").label).toBe("Connected");
        expect(identityStatusLabel("revoked").variant).toBe("destructive");
        expect(formatIdentityExpiry(null)).toBe("No expiry recorded");
        expect(identityIsUsable(trackerUiMocks.identity)).toBe(true);
        expect(identityIsUsable(trackerUiMocks.revokedIdentity)).toBe(false);
        expect(unlinkedAssignmentHint()).toMatch(/unlinked/i);
        expect(connectorRowKey(ghes)).toBe("cn_ghe1:ghe.example.com");
    });

    it("maps session expiry and permission errors", () => {
        const sessionMessage = describeConnectedAccountsError(
            new TrackerApiError(409, { detail: "session changed", code: "session_expired" }),
        );
        expect(sessionMessage).toMatch(/session changed/i);
        const permissionMessage = describeConnectedAccountsError(
            new TrackerApiError(403, { detail: "session required", code: "admin_required" }),
        );
        expect(permissionMessage).toMatch(/sign in/i);
    });
});

describe("ConnectedAccounts (F3 / F9.settings_states / C8)", () => {
    it("renders forbidden state for non-session users", () => {
        render(<ConnectedAccounts linkableConnectors={[githubCom]} isSessionUser={false} />);
        expect(screen.getByText(/sign in with a session account/i)).toBeTruthy();
        expect(document.querySelector('[data-tracker-phase="forbidden"]')).toBeTruthy();
    });

    it("renders loading skeleton while identities load", () => {
        mockedFetch.mockImplementation(() => new Promise(() => {}));
        render(<ConnectedAccounts linkableConnectors={[githubCom]} isSessionUser={true} />);
        expect(document.querySelector('[data-tracker-phase="loading"]')).toBeTruthy();
    });

    it("renders offline state with retry", async () => {
        mockedFetch.mockResolvedValue(respond({ detail: "offline" }, 503));
        render(<ConnectedAccounts linkableConnectors={[githubCom]} isSessionUser={true} />);
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="offline"]')).toBeTruthy();
        });
        mockedFetch.mockResolvedValueOnce(respond([trackerUiMocks.identity]));
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="ready"]')).toBeTruthy();
        });
    });

    it("keeps distinct connectors stable after login rename", async () => {
        mockedFetch.mockResolvedValue(respond([trackerUiMocks.identity, ghesIdentity]));
        render(<ConnectedAccounts linkableConnectors={[githubCom, ghes]} isSessionUser={true} />);
        await waitFor(() => {
            expect(screen.getByText("arjun-gh")).toBeTruthy();
            expect(screen.getByText("arjun-ghe")).toBeTruthy();
        });
        const rows = document.querySelectorAll("[data-connector-id]");
        expect(rows).toHaveLength(2);
        expect(document.querySelector('[data-connector-id="cn_gh1"][data-instance-kind="github.com"]')).toBeTruthy();
        expect(document.querySelector('[data-connector-id="cn_ghe1"][data-instance-kind="ghe.example.com"]')).toBeTruthy();
    });

    it("starts OAuth through the barrel client and stores the return path", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond([]))
            .mockResolvedValueOnce(respond({ authorizeUrl: "/api/trackers/oauth/redirect/cn_gh1" }));
        render(
            <ConnectedAccounts
                linkableConnectors={[githubCom]}
                isSessionUser={true}
                returnPath="/workspace?settings=accounts"
            />,
        );
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /connect/i })).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /connect/i }));
        await waitFor(() => {
            expect(window.location.assign).toHaveBeenCalledWith("/api/trackers/oauth/redirect/cn_gh1");
        });
        expect(sessionStorage.getItem(TRACKER_OAUTH_RETURN_KEY)).toBe("/workspace?settings=accounts");
    });

    it("unlinks immediately and clears usable identity UI", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond([trackerUiMocks.identity]))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(respond([]));
        render(<ConnectedAccounts linkableConnectors={[githubCom]} isSessionUser={true} />);
        await waitFor(() => {
            expect(screen.getByText("arjun-gh")).toBeTruthy();
        });
        const unlink = screen.getByRole("button", { name: /unlink github.com account/i });
        fireEvent.keyDown(unlink, { key: " ", code: "Space" });
        await waitFor(() => expect(unlink).toHaveAttribute("data-holding", "true"));
        fireEvent.keyUp(unlink, { key: " ", code: "Space" });
        fireEvent.keyDown(unlink, { key: " ", code: "Space" });
        await new Promise((resolve) => setTimeout(resolve, 950));
        fireEvent.keyUp(unlink, { key: " ", code: "Space" });
        await waitFor(() => {
            expect(screen.queryByText("arjun-gh")).toBeNull();
            expect(screen.getByRole("button", { name: /connect/i })).toBeTruthy();
            expect(document.querySelector('[data-identity-usable="false"]')).toBeTruthy();
        });
        const serialized = JSON.stringify(document.body.textContent);
        expect(serialized).not.toMatch(/accessToken|tokenEnvelope|gho_/);
    });

    it("recovers from OAuth callback session expiry errors", async () => {
        const replaceState = vi.spyOn(window.history, "replaceState");
        mockedFetch.mockResolvedValue(respond([]));
        render(
            <ConnectedAccounts
                linkableConnectors={[githubCom]}
                isSessionUser={true}
                oauthCallbackSearch="?tracker_oauth=error&tracker_oauth_error=session_expired"
            />,
        );
        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(/session changed/i);
        });
        expect(replaceState).toHaveBeenCalledWith(null, "", `${window.location.pathname}`);
    });

    it("restores the stored settings location after a successful OAuth callback", async () => {
        const replaceState = vi.spyOn(window.history, "replaceState");
        storeOAuthReturnPath("/workspace?settings=accounts");
        mockedFetch.mockResolvedValue(respond([trackerUiMocks.identity]));
        render(
            <ConnectedAccounts
                linkableConnectors={[githubCom]}
                isSessionUser={true}
                oauthCallbackSearch="?tracker_oauth=linked"
            />,
        );
        await waitFor(() => {
            expect(replaceState).toHaveBeenCalledWith(null, "", "/workspace?settings=accounts");
        });
    });

    it("shows reconnect for revoked identities and explains unlinked hints", async () => {
        mockedFetch.mockResolvedValue(respond([trackerUiMocks.revokedIdentity]));
        render(<ConnectedAccounts linkableConnectors={[githubCom]} isSessionUser={true} />);
        await waitFor(() => {
            expect(screen.getByText(/revoked/i)).toBeTruthy();
            expect(screen.getByRole("button", { name: /reconnect/i })).toBeTruthy();
            expect(screen.getByText(/unlinked names until they connect here/i)).toBeTruthy();
        });
    });

    it("supports keyboard focus in dark mode", async () => {
        document.documentElement.classList.add("dark");
        mockedFetch.mockResolvedValue(respond([]));
        render(<ConnectedAccounts linkableConnectors={[githubCom]} isSessionUser={true} />);
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /connect/i })).toBeTruthy();
        });
        screen.getByRole("button", { name: /connect/i }).focus();
        expect(document.activeElement).toBe(screen.getByRole("button", { name: /connect/i }));
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
});

describe("barrel client consumption for scan:gate", () => {
    it("imports identity functions from the feature index", () => {
        expect(listIdentities).toBeTypeOf("function");
        expect(beginIdentityLink).toBeTypeOf("function");
        expect(unlinkIdentity).toBeTypeOf("function");
        expect(trackerUiMocks.identity.connectorId).toBe("cn_gh1");
    });
});
