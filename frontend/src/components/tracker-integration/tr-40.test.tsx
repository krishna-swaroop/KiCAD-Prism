import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerUiMocks } from "@/lib/trackers-client-fixtures";
import { fetchApi } from "@/lib/api";
import type { CommentPermissions, CommentReply } from "@/types/comments";
import type { DiscussionReply } from "./remote-reply";
import type { CommentTrackerProjection } from "@/types/trackers";

import {
    PromotionControl,
    canInitialPromote,
    canRepromoteThread,
    canRetrySync,
    canUnlinkThread,
    describePromotionError,
    publicationDeniedReason,
} from "./promotion-control";
import {
    RemoteReply,
    canShareReply,
    remoteAttributionLabel,
    replySyncLabel,
    tombstoneMessage,
} from "./remote-reply";
import {
    SyncHistory,
    fetchThreadSyncHistory,
    isSupersededSystemRevision,
    syncOpSummary,
} from "./sync-history";
import {
    TrackedThreadChip,
    isWorkPending,
    notPromotableLabel,
    pendingIntentLabel,
    trackedThreadChipLabel,
} from "./tracked-thread-chip";
import { promoteComment, retryThreadSync, TrackerApiError } from "./index";

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

const designerPermissions: CommentPermissions = {
    canReply: true,
    canEdit: true,
    canDelete: true,
    canResolve: true,
    canPublish: true,
};

const viewerPermissions: CommentPermissions = {
    canReply: true,
    canEdit: false,
    canDelete: false,
    canResolve: false,
    canPublish: false,
};

function reply(overrides: Partial<CommentReply> = {}): CommentReply {
    return {
        id: "r_test",
        author: "Priya",
        authorUserId: "u_priya",
        authorKind: "user",
        timestamp: "2026-09-20T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
        revision: 1,
        content: "Local reply",
        origin: "prism",
        ...overrides,
    };
}

afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
});

beforeEach(() => {
    mockedFetch.mockReset();
});

describe("tracked thread chip (C6 / C7 / F9.stale_cache)", () => {
    it("keeps link, sync and pending intent visually separate", () => {
        render(<TrackedThreadChip tracker={trackerUiMocks.pendingIntentProjection} variant="stacked" />);
        expect(screen.getByTestId("thread-link-chip")).toHaveTextContent(/linked/i);
        expect(screen.getByTestId("thread-sync-chip")).toHaveTextContent("sent");
        expect(screen.getByTestId("thread-pending-chip")).toHaveTextContent(/closing issue/i);
        expect(screen.getByTestId("thread-remote-state")).toHaveTextContent(/remote open/i);
        expect(isWorkPending(trackerUiMocks.pendingIntentProjection)).toBe(true);
    });

    it("labels distinct link states", () => {
        expect(trackedThreadChipLabel({ ...trackerUiMocks.linkedProjection, linkState: "inaccessible" })).toMatch(
            /inaccessible/i,
        );
        expect(trackedThreadChipLabel({ ...trackerUiMocks.linkedProjection, linkState: "deleted" })).toMatch(/deleted/i);
        expect(trackedThreadChipLabel({ ...trackerUiMocks.linkedProjection, linkState: "transferred" })).toMatch(
            /transferred/i,
        );
        expect(notPromotableLabel("below_auto_threshold")).toMatch(/ask a designer/i);
        expect(pendingIntentLabel("set_state:closed")).toBe("Closing issue…");
        expect(pendingIntentLabel("add_comment")).toBe("Sending reply…");
    });

    it("renders forge body authority and paused notices", () => {
        render(
            <TrackedThreadChip
                tracker={{
                    ...trackerUiMocks.linkedProjection,
                    bodyAuthority: "forge",
                    pausedReason: "visibility",
                }}
            />,
        );
        expect(screen.getByTestId("body-authority-note")).toHaveTextContent(/no longer updates/i);
        expect(screen.getByTestId("paused-reason")).toHaveTextContent(/acknowledg/i);
    });
});

describe("promotion control (C4 / F8 / F9)", () => {
    it("shows destination before promote and blocks inaccessible re-promotion", () => {
        const inaccessible: CommentTrackerProjection = {
            ...trackerUiMocks.linkedProjection,
            linkState: "inaccessible",
            syncState: "failed",
        };
        render(
            <PromotionControl
                projectId="prj_a"
                commentId="c_1"
                tracker={inaccessible}
                permissions={designerPermissions}
                settings={trackerUiMocks.projectSettings}
            />,
        );
        expect(screen.queryByTestId("destination-line")).toBeNull();
        expect(canRepromoteThread(inaccessible, designerPermissions)).toBe(false);
        expect(screen.getByTestId("promote-button")).toBeDisabled();
    });

    it("offers promote again only for confirmed deleted links", async () => {
        const deleted: CommentTrackerProjection = {
            linkState: "deleted",
            provider: "github",
            syncState: "confirmed",
            pendingIntent: null,
            remoteState: null,
        };
        expect(canRepromoteThread(deleted, designerPermissions)).toBe(true);
        expect(canRepromoteThread({ ...deleted, linkState: "inaccessible" }, designerPermissions)).toBe(false);
        expect(canUnlinkThread(deleted, designerPermissions)).toBe(false);
        mockedFetch.mockResolvedValueOnce(respond({ ...deleted, linkState: "linked", syncState: "pending" }));
        const onTrackerChange = vi.fn();
        render(
            <PromotionControl
                projectId="prj_a"
                commentId="c_1"
                tracker={deleted}
                permissions={designerPermissions}
                settings={trackerUiMocks.projectSettings}
                onTrackerChange={onTrackerChange}
            />,
        );
        expect(screen.getByTestId("destination-line")).toBeTruthy();
        expect(screen.getByTestId("promote-button")).toHaveTextContent(/promote again/i);
        fireEvent.click(screen.getByTestId("promote-button"));
        await waitFor(() => {
            expect(screen.getByText(/promote again on forge/i)).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /promote again/i }));
        await waitFor(() => expect(onTrackerChange).toHaveBeenCalled());
        expect(String(mockedFetch.mock.calls[0]?.[0] ?? "")).toMatch(/tracker\/repromote/);
    });

    it("offers unlink for live links and posts to the unlink route", async () => {
        expect(canUnlinkThread(trackerUiMocks.linkedProjection, designerPermissions)).toBe(true);
        mockedFetch.mockResolvedValueOnce(respond({ linkState: null, pendingIntent: null, remoteState: null }));
        const onTrackerChange = vi.fn();
        render(
            <PromotionControl
                projectId="prj_a"
                commentId="c_1"
                tracker={trackerUiMocks.linkedProjection}
                permissions={designerPermissions}
                settings={trackerUiMocks.projectSettings}
                onTrackerChange={onTrackerChange}
            />,
        );
        fireEvent.click(screen.getByTestId("unlink-thread-button"));
        await waitFor(() => {
            expect(screen.getByText(/unlink from tracker/i)).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /^unlink$/i }));
        await waitFor(() => expect(onTrackerChange).toHaveBeenCalled());
        expect(String(mockedFetch.mock.calls[0]?.[0] ?? "")).toMatch(/tracker\/unlink/);
    });

    it("explains viewer publication denial while keeping promotion UI honest", () => {
        render(
            <PromotionControl
                projectId="prj_a"
                commentId="c_1"
                tracker={{ linkState: null, pendingIntent: null, remoteState: null }}
                permissions={viewerPermissions}
                settings={trackerUiMocks.projectSettings}
            />,
        );
        expect(publicationDeniedReason(null, viewerPermissions, "designer")).toMatch(/not shared/i);
        expect(screen.getByTestId("publication-denied-note")).toHaveTextContent(/local comment actions/i);
        expect(canInitialPromote({ linkState: null }, viewerPermissions)).toBe(false);
    });

    it("promotes after confirmation through the barrel client", async () => {
        mockedFetch.mockResolvedValueOnce(respond(trackerUiMocks.linkedProjection));
        const onTrackerChange = vi.fn();
        render(
            <PromotionControl
                projectId="prj_a"
                commentId="c_1"
                tracker={{ linkState: null, pendingIntent: null, remoteState: null }}
                permissions={designerPermissions}
                settings={trackerUiMocks.projectSettings}
                onTrackerChange={onTrackerChange}
            />,
        );
        fireEvent.click(screen.getByTestId("promote-button"));
        await waitFor(() => {
            expect(screen.getByText(/promote to tracker/i)).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /^promote$/i }));
        await waitFor(() => expect(onTrackerChange).toHaveBeenCalled());
        expect(mockedFetch).toHaveBeenCalled();
    });

    it("retries failed sync when publication allows", async () => {
        const failed: CommentTrackerProjection = {
            ...trackerUiMocks.linkedProjection,
            syncState: "failed",
            lastError: trackerUiMocks.providerRateLimited,
        };
        expect(canRetrySync(failed)).toBe(true);
        mockedFetch.mockResolvedValueOnce(respond(trackerUiMocks.pendingIntentProjection));
        const onTrackerChange = vi.fn();
        render(
            <PromotionControl
                projectId="prj_a"
                commentId="c_1"
                tracker={failed}
                permissions={designerPermissions}
                settings={trackerUiMocks.projectSettings}
                onTrackerChange={onTrackerChange}
            />,
        );
        fireEvent.click(screen.getByTestId("retry-sync-button"));
        await waitFor(() => expect(onTrackerChange).toHaveBeenCalled());
    });

    it("maps tracker API errors for designers", () => {
        const message = describePromotionError(
            new TrackerApiError(403, trackerUiMocks.publicationDenied),
        );
        expect(message).toMatch(/designer/i);
    });
});

describe("remote reply (C6 / F8)", () => {
    it("renders remote attribution and external sync badge", () => {
        const remote: DiscussionReply = {
            ...reply({
                author: "arjun-gh",
                authorKind: "remote",
                origin: "remote",
                remoteAttribution: { provider: "github", login: "arjun-gh", url: "https://github.com/arjun-gh" },
            }),
            sync: { state: "linked", externalCommentId: "2211044" },
        };
        render(<RemoteReply reply={remote} />);
        expect(screen.getByTestId("reply-attribution-link")).toHaveTextContent(/arjun-gh on github/i);
        expect(screen.getByTestId("reply-sync-badge")).toHaveTextContent(/shared/i);
        expect(remoteAttributionLabel(remote)).toMatch(/arjun-gh/);
    });

    it("shows tombstones and unsynced_local share affordance", () => {
        const unsynced: DiscussionReply = {
            ...reply(),
            sync: { state: "unsynced_local", reason: "publication_required" },
        };
        expect(replySyncLabel(unsynced.sync)).toMatch(/not shared/i);
        expect(canShareReply(unsynced, designerPermissions)).toBe(true);
        render(
            <RemoteReply
                reply={unsynced}
                permissions={designerPermissions}
                assignmentHints={["Mira (not linked)"]}
                onShare={vi.fn()}
            />,
        );
        expect(screen.getByTestId("share-reply-button")).toBeTruthy();
        expect(screen.getByTestId("assignment-hints")).toHaveTextContent(/mira \(not linked\)/i);

        const deleted = reply({ deletedAt: "2026-09-20T16:00:00Z", origin: "remote", content: "" });
        render(<RemoteReply reply={deleted} />);
        expect(tombstoneMessage(deleted)).toMatch(/forge/i);
        expect(screen.getAllByTestId("reply-tombstone").length).toBeGreaterThan(0);
    });
});

describe("sync history (C5 / F6)", () => {
    it("summarizes superseded operations and system revisions", () => {
        expect(
            syncOpSummary({
                opId: "op_1",
                trackedThreadId: "tt_1",
                op: "set_state",
                state: "superseded",
                expectedRemoteState: "closed",
            }),
        ).toMatch(/superseded/i);
        expect(
            isSupersededSystemRevision({
                targetKind: "root",
                targetId: "c_1",
                revision: 2,
                changeKind: "status",
                editorKind: "system",
                editorDisplay: "Remote reopened; local close superseded",
                origin: "remote",
                editedAt: "2026-09-20T16:00:00Z",
            }),
        ).toBe(true);
    });

    it("loads history from Prism and lists operations", async () => {
        mockedFetch.mockImplementation(async () =>
            respond({
                commentId: "c_1",
                trackedThreadId: "tt_1",
                operations: [
                    {
                        opId: "op_91a4c0de",
                        trackedThreadId: "tt_1",
                        op: "create_issue",
                        state: "confirmed",
                    },
                ],
            }),
        );

        render(
            <SyncHistory
                projectId="prj_a"
                commentId="c_1"
                revisions={[
                    {
                        targetKind: "root",
                        targetId: "c_1",
                        revision: 2,
                        changeKind: "status",
                        editorKind: "system",
                        editorDisplay: "Remote reopened; local close superseded",
                        origin: "remote",
                        editedAt: "2026-09-20T16:00:00Z",
                        content: "Close request superseded by remote reopen.",
                    },
                ]}
            />,
        );
        await waitFor(() => {
            expect(screen.queryByTestId("sync-history-loading")).toBeNull();
            expect(document.querySelector('[data-op-state="confirmed"]')).toBeTruthy();
            expect(screen.getByTestId("superseded-note")).toHaveTextContent(/superseded/i);
        });

        const payload = await fetchThreadSyncHistory("prj_a", "c_1");
        expect(payload.operations).toHaveLength(1);
    });
});

describe("layout and barrel imports (F9.accessibility)", () => {
    it("imports tracker client actions from the feature index", () => {
        expect(promoteComment).toBeTypeOf("function");
        expect(retryThreadSync).toBeTypeOf("function");
        expect(TrackerApiError).toBeTypeOf("function");
    });

    it("supports keyboard focus in dark narrow layout", () => {
        document.documentElement.classList.add("dark");
        const { container } = render(
            <div className="max-w-[360px]">
                <TrackedThreadChip tracker={trackerUiMocks.linkedProjection} variant="stacked" />
                <PromotionControl
                    projectId="prj_a"
                    commentId="c_1"
                    tracker={{ linkState: null, pendingIntent: null, remoteState: null }}
                    permissions={designerPermissions}
                    settings={trackerUiMocks.projectSettings}
                />
            </div>,
        );
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        const promote = within(container).getByTestId("promote-button");
        promote.focus();
        expect(document.activeElement).toBe(promote);
    });
});
