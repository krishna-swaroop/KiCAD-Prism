import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as TrackerSurface from "./index";
import {
    TrackerApiError,
    TRACKER_ROUTES,
    acknowledgeDestination,
    beginIdentityLink,
    createConnector,
    getConnector,
    getConnectorHealth,
    getProjectTracker,
    LINK_STATES,
    listConnectors,
    listIdentities,
    pauseConnector,
    projectionFromComment,
    promoteComment,
    PROVIDER_ERROR_CLASSES,
    resumeConnector,
    retryThreadSync,
    revokeConnector,
    stripTrackerSecrets,
    testConnector,
    trackerUiMocks,
    unlinkIdentity,
    updateConnector,
    updateProjectTracker,
} from "./index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const examples = JSON.parse(
    readFileSync(path.join(repoRoot, "docs/tracker-integration/dto-examples.json"), "utf8"),
) as {
    comments: Record<string, Record<string, unknown>>;
    tracker: Record<string, unknown>;
};

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        return handler(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("frozen DTOs", () => {
    it("exposes the public tracker surface from the feature index", () => {
        expect(TrackerSurface.listConnectors).toBeTypeOf("function");
        expect(TrackerSurface.pauseConnector).toBeTypeOf("function");
        expect(TrackerSurface.resumeConnector).toBeTypeOf("function");
        expect(TrackerSurface.revokeConnector).toBeTypeOf("function");
        expect(TrackerSurface.testConnector).toBeTypeOf("function");
        expect(TrackerSurface.updateConnector).toBeTypeOf("function");
        expect(TrackerSurface.unlinkIdentity).toBeTypeOf("function");
        expect(TrackerSurface.LINK_STATES).toEqual(["linked", "inaccessible", "deleted", "transferred"]);
        expect(TrackerSurface.PROVIDER_ERROR_CLASSES.length).toBeGreaterThan(0);
        expect(TrackerSurface.IDENTITY_STATUSES).toContain("active");
        expect(TrackerSurface.CONTAINER_KINDS).toContain("repo");
        expect(TrackerSurface.VISIBILITIES).toContain("private");
        expect(TrackerSurface.TRACKER_ERROR_CODES).toContain("admin_required");
    });

    it("matches TR-00/TR-09 tracker examples", () => {
        const tracker = examples.tracker as Record<string, Record<string, unknown>>;
        expect(trackerUiMocks.destination).toMatchObject(tracker.Destination);
        expect(trackerUiMocks.health).toEqual(tracker.ConnectorHealth);
        expect(trackerUiMocks.projectSettings).toEqual(tracker.ProjectTrackerSettings);
        expect(trackerUiMocks.identity).toEqual(tracker.UserIdentity);
        expect(trackerUiMocks.connector).toEqual(tracker.TrackerConnector);
        expect(tracker.AdminConnectorRoutes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    method: "GET",
                    path: "/api/admin/trackers/connectors",
                    auth: "admin",
                }),
            ]),
        );
        expect(TRACKER_ROUTES.connectors).toBe("/api/admin/trackers/connectors");
        expect(TRACKER_ROUTES.connector("cn_gh1")).toBe("/api/admin/trackers/connectors/cn_gh1");
        expect(trackerUiMocks.linkedProjection).toMatchObject(
            examples.comments.Comment.tracker as Record<string, unknown>,
        );
        expect(trackerUiMocks.providerRateLimited).toEqual(tracker.ProviderError);
        expect(tracker.ProviderError_classes).toEqual([...PROVIDER_ERROR_CLASSES]);
        expect(tracker.LinkState_values).toEqual([...LINK_STATES]);
    });

    it("keeps observed remote state separate from pending intent and link state", () => {
        const pending = trackerUiMocks.pendingIntentProjection;
        expect(pending.linkState).toBe("linked");
        expect(pending.remoteState).toBe("open");
        expect(pending.pendingIntent).toBe("set_state:closed");
        expect(pending.pendingIntent).not.toBe(pending.remoteState);
    });

    it("tolerates documented legacy forge projection", () => {
        const unpinned = projectionFromComment(
            examples.comments.Comment_legacy_unpinned as {
                tracker: { linkState: null; notPromotableReason: string };
            },
        );
        expect(unpinned.linkState).toBeNull();
        expect(unpinned.notPromotableReason).toBe("unpinned_anchor");

        const legacyOnly = projectionFromComment({
            forgeProvider: "github",
            forgeIssueId: "412",
            forgeIssueUrl: "https://github.com/acme/openswitch/issues/412",
            forgeSyncState: "confirmed",
        });
        expect(legacyOnly.linkState).toBe("linked");
        expect(legacyOnly.externalId).toBe("412");
        expect(legacyOnly.syncState).toBe("confirmed");
        expect(legacyOnly.pendingIntent).toBeNull();
        expect(legacyOnly.remoteState).toBeNull();
    });

    it("never exposes provider tokens on UI mocks", () => {
        const serialized = JSON.stringify(trackerUiMocks);
        expect(serialized).not.toMatch(/accessToken|refreshToken|credential_envelope|privateKey|gho_/);
        expect(stripTrackerSecrets({ accessToken: "should-not-leak", id: "cn_gh1" })).toEqual({ id: "cn_gh1" });
    });
});

describe("trackers-client", () => {
    it("lists identities and strips leaked secret keys from reads", async () => {
        const fetchMock = stubFetch(() =>
            jsonResponse(200, [
                {
                    ...trackerUiMocks.revokedIdentity,
                    accessToken: "should-not-reach-ui",
                    tokenEnvelope: "envelope-ciphertext-fixture",
                },
            ]),
        );
        const identities = await listIdentities();
        expect(identities).toEqual([trackerUiMocks.revokedIdentity]);
        expect(identities[0].status).toBe("revoked");
        expect(JSON.stringify(identities)).not.toContain("should-not-reach-ui");
        expect(fetchMock).toHaveBeenCalledWith(
            TRACKER_ROUTES.identities,
            expect.objectContaining({ credentials: "include" }),
        );
    });

    it("loads paused health and public-ack-required settings for UI owners", async () => {
        stubFetch((url) => {
            if (url.endsWith("/health")) {
                return jsonResponse(200, { ...trackerUiMocks.health, paused: true, degraded: true });
            }
            return jsonResponse(200, trackerUiMocks.publicAckRequired);
        });
        const health = await getConnectorHealth("cn_gh1");
        expect(health.paused).toBe(true);
        expect(health.degraded).toBe(true);
        const settings = await getProjectTracker("prj_47c2551996d0");
        expect(settings.destination.visibility).toBe("public");
        expect(settings.acknowledgement?.valid).toBe(false);
        expect(settings.acknowledgement?.visibility).toBe("private");
    });

    it("sends write-only credentials to Prism and returns a secret-free connector", async () => {
        const fetchMock = stubFetch(() =>
            jsonResponse(200, {
                ...trackerUiMocks.connector,
                credentials: { privateKey: "should-not-echo" },
            }),
        );
        const created = await createConnector({
            provider: "github",
            instanceKind: "github.com",
            displayName: "GitHub.com",
            credentials: { installationMaterial: "unit-test-app-material" },
        });
        expect(created.credentialConfigured).toBe(true);
        expect(created).not.toHaveProperty("credentials");
        const [, init] = fetchMock.mock.calls[0];
        expect(fetchMock.mock.calls[0][0]).toBe(TRACKER_ROUTES.connectors);
        expect(JSON.parse(String(init?.body))).toMatchObject({
            provider: "github",
            credentials: { installationMaterial: "unit-test-app-material" },
        });
        expect(created.bot).toEqual({ id: "199001", login: "prism[bot]" });
        expect(created).not.toHaveProperty("botForgeUserId");
    });

    it("preserves publication and conflict error state", async () => {
        stubFetch(() => jsonResponse(403, trackerUiMocks.publicationDenied));
        await expect(promoteComment("prj_a", "c_1")).rejects.toMatchObject({
            name: "TrackerApiError",
            status: 403,
            code: "publication_required",
            requiredRole: "designer",
            isPermission: true,
        });

        stubFetch(() => jsonResponse(409, trackerUiMocks.conflictError));
        try {
            await updateProjectTracker("prj_a", {
                connectorId: "cn_gh1",
                destination: trackerUiMocks.projectSettings.destination,
            });
            throw new Error("expected conflict");
        } catch (reason) {
            expect(reason).toBeInstanceOf(TrackerApiError);
            expect(reason).toMatchObject({
                isConflict: true,
                currentRevision: 3,
                code: "revision_conflict",
            });
        }
    });

    it("retries failed sync without calling a provider host", async () => {
        const fetchMock = stubFetch((url) => {
            expect(url.startsWith("/api/")).toBe(true);
            expect(url).not.toContain("github.com");
            return jsonResponse(200, trackerUiMocks.pendingIntentProjection);
        });
        const projection = await retryThreadSync("prj_a", "c_1");
        expect(projection.pendingIntent).toBe("set_state:closed");
        expect(projection.remoteState).toBe("open");
        expect(fetchMock.mock.calls[0][0]).toBe(TRACKER_ROUTES.commentRetry("prj_a", "c_1"));
    });

    it("starts OAuth on Prism and acknowledges a public destination", async () => {
        stubFetch((url) => {
            if (url.includes("oauth/begin")) {
                return jsonResponse(200, { authorizeUrl: "/api/trackers/oauth/redirect/cn_gh1" });
            }
            return jsonResponse(200, {
                ...trackerUiMocks.publicAckRequired,
                acknowledgement: {
                    visibility: "public",
                    acknowledgedBy: "u_admin",
                    acknowledgedAt: "2026-09-20T16:00:00Z",
                    valid: true,
                },
            });
        });
        const begin = await beginIdentityLink("cn_gh1");
        expect(begin.authorizeUrl.startsWith("/api/")).toBe(true);
        const acked = await acknowledgeDestination("prj_47c2551996d0", "public");
        expect(acked.acknowledgement?.valid).toBe(true);
        expect(acked.acknowledgement?.visibility).toBe("public");
    });

    it("loads a connector without echoing envelopes", async () => {
        stubFetch(() => jsonResponse(200, trackerUiMocks.pausedConnector));
        const connector = await getConnector("cn_gh1");
        expect(connector.paused).toBe(true);
        expect(connector.pausedReason).toBe("auth");
        expect(connector.bot.login).toBe("prism[bot]");
        expect(connector).not.toHaveProperty("credential_envelope");
    });

    it("calls admin lifecycle routes from the frozen table", async () => {
        const fetchMock = stubFetch((url) => {
            if (url.endsWith("/health")) {
                return jsonResponse(200, trackerUiMocks.health);
            }
            if (url.endsWith("/test")) {
                return jsonResponse(200, {
                    ...trackerUiMocks.connector,
                    test: {
                        ok: true,
                        writesEnabled: true,
                        pausedReason: null,
                        visibility: "private",
                        permissions: { issues: "write" },
                        bot: { id: "199001", login: "prism[bot]" },
                    },
                });
            }
            return jsonResponse(200, trackerUiMocks.connector);
        });
        await listConnectors();
        await updateConnector("cn_gh1", { displayName: "GitHub.com" });
        await pauseConnector("cn_gh1");
        await resumeConnector("cn_gh1");
        await testConnector("cn_gh1");
        await revokeConnector("cn_gh1");
        await unlinkIdentity("cn_gh1");
        const paths = fetchMock.mock.calls.map((call) => String(call[0]));
        expect(paths[0]).toBe("/api/admin/trackers/connectors");
        expect(paths.some((path) => path.endsWith("/pause"))).toBe(true);
        expect(paths.some((path) => path.endsWith("/test"))).toBe(true);
        expect(paths.every((path) => !path.startsWith("/api/trackers/connectors"))).toBe(true);
    });
});
