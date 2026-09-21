import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectorHealthPanel, formatIsoDuration, formatIsoTimestamp, healthIsRateLimited } from "./connector-health";
import {
    ConnectorSettings,
    connectorWebhookPublicUrl,
    credentialRotationHint,
    describeConnectorSettingsError,
} from "./connector-settings";
import { trackerUiMocks } from "@/lib/trackers-client-fixtures";
import { fetchApi } from "@/lib/api";
import {
    TrackerApiError,
    getConnector,
    getConnectorHealth,
    pauseConnector,
    resumeConnector,
    revokeConnector,
    testConnector,
    updateConnector,
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

afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
});

beforeEach(() => {
    mockedFetch.mockReset();
    Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
});

describe("connector helpers", () => {
    it("builds the public webhook URL for provider configuration", () => {
        expect(connectorWebhookPublicUrl("cn_gh1", "https://prism.example")).toBe(
            "https://prism.example/api/trackers/webhooks/github/cn_gh1",
        );
    });

    it("describes credential rotation without echoing secrets", () => {
        expect(credentialRotationHint(false)).toMatch(/never echoed/i);
        expect(credentialRotationHint(true)).toMatch(/leave fields blank/i);
        expect(credentialRotationHint(true)).not.toMatch(/privateKey|gho_/);
    });

    it("formats health timestamps and ISO durations", () => {
        expect(formatIsoTimestamp(null)).toBe("Never");
        expect(formatIsoDuration("PT4M")).toBe("4m");
        expect(healthIsRateLimited({
            ...trackerUiMocks.health,
            rateLimitResumeAt: "2099-01-01T00:00:00Z",
        })).toBe(true);
    });

    it("maps permission errors for settings", () => {
        const message = describeConnectorSettingsError(
            new TrackerApiError(403, { detail: "admin only", code: "admin_required" }),
        );
        expect(message).toMatch(/administrator/i);
    });
});

describe("ConnectorSettings (F9.settings_states / C8)", () => {
    it("renders forbidden state for non-admin users", () => {
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={false} />);
        expect(screen.getByText(/administrator access is required/i)).toBeTruthy();
        expect(document.querySelector('[data-tracker-phase="forbidden"]')).toBeTruthy();
    });

    it("renders loading skeleton while connector loads", () => {
        mockedFetch.mockImplementation(() => new Promise(() => {}));
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} />);
        expect(document.querySelector('[data-tracker-phase="loading"]')).toBeTruthy();
    });

    it("renders offline state with retry", async () => {
        mockedFetch.mockResolvedValue(respond({ detail: "offline" }, 503));
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="offline"]')).toBeTruthy();
        });
        mockedFetch.mockResolvedValueOnce(respond(trackerUiMocks.connector));
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        await waitFor(() => {
            expect(screen.getByLabelText(/display name/i)).toBeTruthy();
        });
    });

    it("never echoes secrets after save and reload", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond(trackerUiMocks.connector))
            .mockResolvedValueOnce(
                respond({
                    ...trackerUiMocks.connector,
                    credential_envelope: "should-not-reach-ui",
                    credentials: { privateKey: "leak" },
                }),
            );
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} prismOrigin="https://prism.test" />);
        await waitFor(() => {
            expect(screen.getByLabelText(/display name/i)).toHaveValue("GitHub.com");
        });
        expect(screen.getByLabelText(/private key/i)).toHaveValue("");
        const appCredentials = screen.getByRole("group", { name: /GitHub App installation/i });
        expect(within(appCredentials).getByText(/leave fields blank/i)).toBeTruthy();
        expect(screen.queryByDisplayValue("leak")).toBeNull();
        expect(JSON.stringify(document.body.textContent)).not.toMatch(/credential_envelope|gho_/);

        fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "GitHub prod" } });
        fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
        await waitFor(() => {
            expect(screen.getByLabelText(/private key/i)).toHaveValue("");
        });
        const serialized = JSON.stringify(document.body.textContent);
        expect(serialized).not.toMatch(/leak|credential_envelope/);
    });

    it("shows the server-computed webhook endpoint (PUBLIC_BASE_URL, not the browser origin) with copy", async () => {
        mockedFetch.mockResolvedValue(respond(trackerUiMocks.connector));
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} prismOrigin="https://prism.test" />);
        await waitFor(() => {
            expect(screen.getByText(/public webhook endpoint/i)).toBeTruthy();
        });
        // The forge has to reach this URL, so the DTO's PUBLIC_BASE_URL-derived value wins over prismOrigin.
        expect(
            screen.getByText("https://prism.example/api/trackers/webhooks/github/cn_gh1"),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /copy url/i }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "https://prism.example/api/trackers/webhooks/github/cn_gh1",
        );
    });

    it("falls back to the provider-qualified path on the given origin when the DTO has no webhookUrl", async () => {
        mockedFetch.mockResolvedValue(respond({ ...trackerUiMocks.connector, webhookUrl: null }));
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} prismOrigin="https://prism.test" />);
        await waitFor(() => {
            expect(screen.getByText("https://prism.test/api/trackers/webhooks/github/cn_gh1")).toBeTruthy();
        });
    });

    it("runs test connection and lifecycle controls from the barrel client", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond(trackerUiMocks.connector))
            .mockResolvedValueOnce(
                respond({
                    ...trackerUiMocks.connector,
                    test: {
                        ok: true,
                        writesEnabled: true,
                        pausedReason: null,
                        visibility: "private",
                        permissions: { issues: "write" },
                        bot: trackerUiMocks.connector.bot,
                    },
                }),
            )
            .mockResolvedValueOnce(respond({ ...trackerUiMocks.pausedConnector }))
            .mockResolvedValueOnce(respond(trackerUiMocks.connector))
            .mockResolvedValueOnce(respond({ ...trackerUiMocks.connector, credentialConfigured: false, paused: true }));
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /test connection/i })).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
        await waitFor(() => {
            expect(screen.getByTestId("connector-test-result")).toHaveTextContent(/succeeded/i);
        });

        fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
        await waitFor(() => {
            expect(screen.getByText(/paused/i)).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: /resume/i }));
        await waitFor(() => {
            expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
        });

        const revoke = screen.getByRole("button", { name: /revoke credentials/i });
        fireEvent.keyDown(revoke, { key: " ", code: "Space" });
        await waitFor(() => expect(revoke).toHaveAttribute("data-holding", "true"));
        fireEvent.keyUp(revoke, { key: " ", code: "Space" });
        fireEvent.keyDown(revoke, { key: " ", code: "Space" });
        await new Promise((resolve) => setTimeout(resolve, 950));
        fireEvent.keyUp(revoke, { key: " ", code: "Space" });
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="revoked"]')).toBeTruthy();
        });
    });

    it("renders revoked badge when credentials are cleared", async () => {
        mockedFetch.mockResolvedValue(
            respond({ ...trackerUiMocks.connector, credentialConfigured: false, paused: true, pausedReason: "auth" }),
        );
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="revoked"]')).toBeTruthy();
        });
    });

    it("supports keyboard focus in dark mode", async () => {
        document.documentElement.classList.add("dark");
        mockedFetch.mockResolvedValue(respond(trackerUiMocks.connector));
        render(<ConnectorSettings connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getByLabelText(/display name/i)).toBeTruthy();
        });
        screen.getByLabelText(/display name/i).focus();
        expect(document.activeElement).toBe(screen.getByLabelText(/display name/i));
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
});

describe("ConnectorHealthPanel (C7 / F7)", () => {
    it("renders forbidden state for viewers", () => {
        render(<ConnectorHealthPanel connectorId="cn_gh1" isAdmin={false} />);
        expect(screen.getByText(/administrator access is required/i)).toBeTruthy();
    });

    it("shows webhook, poll, sweep and backlog metrics", async () => {
        mockedFetch.mockResolvedValue(respond(trackerUiMocks.health));
        render(<ConnectorHealthPanel connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getAllByText(/last webhook/i).length).toBeGreaterThan(0);
        });
        expect(screen.getAllByText(/last poll/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/last sweep/i).length).toBeGreaterThan(0);
        expect(screen.getByText("Pending ops").closest("div")?.textContent).toContain(
            String(trackerUiMocks.health.pendingOps),
        );
        expect(screen.getByText("Failed ops").closest("div")?.textContent).toContain(
            String(trackerUiMocks.health.failedOps),
        );
        expect(document.querySelector('[data-tracker-phase="ready"]')).toBeTruthy();
    });

    it("renders rate-limited health with resume guidance", async () => {
        mockedFetch.mockResolvedValue(
            respond({
                ...trackerUiMocks.health,
                degraded: true,
                rateLimitResumeAt: "2099-06-01T12:00:00Z",
                lastError: trackerUiMocks.providerRateLimited,
            }),
        );
        render(<ConnectorHealthPanel connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="rate_limited"]')).toBeTruthy();
        });
        expect(screen.getAllByText(/rate limited/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/secondary rate limit/i)).toBeTruthy();
    });

    it("retries after offline errors", async () => {
        mockedFetch.mockResolvedValueOnce(respond({ detail: "down" }, 503));
        render(<ConnectorHealthPanel connectorId="cn_gh1" isAdmin={true} />);
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="offline"]')).toBeTruthy();
        });
        mockedFetch.mockResolvedValueOnce(respond(trackerUiMocks.health));
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="ready"]')).toBeTruthy();
        });
    });
});

describe("barrel client consumption for scan:gate", () => {
    it("imports admin lifecycle functions from the feature index", () => {
        expect(getConnector).toBeTypeOf("function");
        expect(getConnectorHealth).toBeTypeOf("function");
        expect(testConnector).toBeTypeOf("function");
        expect(pauseConnector).toBeTypeOf("function");
        expect(resumeConnector).toBeTypeOf("function");
        expect(revokeConnector).toBeTypeOf("function");
        expect(updateConnector).toBeTypeOf("function");
        expect(trackerUiMocks.health.connectorId).toBe("cn_gh1");
    });
});
