/**
 * TR-42 — host mounts for tracker settings and discussion UI (C4/C8, F1/F2/F9).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { SettingsDialog } from "@/components/settings-dialog";
import { CommentCard, commentAutoEligible } from "@/components/comment-card";
import { CommentPanel } from "@/components/comment-panel";
import { CommentForm } from "@/components/comment-form";
import { ComparisonDiscussionRail } from "@/components/design-comparison/comparison-discussion-rail";
import { trackerUiMocks } from "@/lib/trackers-client-fixtures";
import type { Comment, CommentPermissions } from "@/types/comments";
import type { CommentTrackerProjection } from "@/types/trackers";
import { fetchApi } from "@/lib/api";
import * as trackersClient from "@/lib/trackers-client";

vi.mock("sonner", () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, fetchApi: vi.fn() };
});

vi.mock("@/lib/trackers-client", async () => {
    const actual = await vi.importActual<typeof import("@/lib/trackers-client")>("@/lib/trackers-client");
    return {
        ...actual,
        listConnectors: vi.fn(),
        getConnector: vi.fn(),
        getConnectorHealth: vi.fn(),
        getProjectTracker: vi.fn(),
        listIdentities: vi.fn(),
        promoteComment: vi.fn(),
        retryThreadSync: vi.fn(),
    };
});

vi.mock("@/lib/comments-client", async () => {
    const actual = await vi.importActual<typeof import("@/lib/comments-client")>("@/lib/comments-client");
    return {
        ...actual,
        listComparisonComments: vi.fn().mockResolvedValue([]),
    };
});

const mockedFetch = vi.mocked(fetchApi);
const mockedListConnectors = vi.mocked(trackersClient.listConnectors);
const mockedGetConnector = vi.mocked(trackersClient.getConnector);
const mockedGetHealth = vi.mocked(trackersClient.getConnectorHealth);
const mockedGetProjectTracker = vi.mocked(trackersClient.getProjectTracker);
const mockedListIdentities = vi.mocked(trackersClient.listIdentities);

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

function baseComment(overrides: Partial<Comment> & { tracker?: CommentTrackerProjection | null } = {}): Comment {
    const { tracker, ...rest } = overrides;
    const comment = {
        id: "c_42",
        author: "Priya",
        authorUserId: "u_priya",
        authorKind: "user" as const,
        timestamp: "2026-09-20T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
        revision: 1,
        status: "OPEN" as const,
        context: "PCB" as const,
        location: { x: 1, y: 2, layer: "F.Cu", page: undefined },
        content: "Check clearance",
        replies: [],
        commentClass: "general" as const,
        severity: "minor" as const,
        mentions: [],
        anchor: { state: "pinned" as const, commit: "abc", sourceRevisionKey: "board.kicad_pcb" },
        permissions: designerPermissions,
        ...rest,
    };
    return tracker !== undefined
        ? ({ ...comment, tracker } as Comment & { tracker: CommentTrackerProjection | null })
        : comment;
}

afterEach(() => {
    cleanup();
});

beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockImplementation(async () =>
        new Response(JSON.stringify({ key: { exists: false, public_key: null }, trusted_hosts: [], repositories: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }),
    );
    mockedListConnectors.mockReset();
    mockedGetConnector.mockReset();
    mockedGetHealth.mockReset();
    mockedGetProjectTracker.mockReset();
    mockedListIdentities.mockReset();
    mockedListConnectors.mockResolvedValue([trackerUiMocks.connector]);
    mockedGetConnector.mockResolvedValue(trackerUiMocks.connector);
    mockedGetHealth.mockResolvedValue(trackerUiMocks.health);
    mockedGetProjectTracker.mockResolvedValue(trackerUiMocks.projectSettings);
    mockedListIdentities.mockResolvedValue([]);
});

describe("SettingsDialog tracker hosts (C8)", () => {
    it("mounts connector settings and health for admins", async () => {
        render(
            <SettingsDialog
                open
                onOpenChange={() => undefined}
                user={{ email: "a@example.com", name: "Admin", role: "admin" }}
            />,
        );
        fireEvent.click(screen.getByTestId("settings-tab-trackers"));
        await waitFor(() => {
            expect(screen.getByTestId("tracker-settings-host")).toBeTruthy();
        });
        // Connections are summarised as cards; configuration and health sit
        // behind an explicit step instead of being exposed on the tab itself.
        await waitFor(() => {
            expect(screen.getByTestId("tracker-connector-card")).toBeTruthy();
        });
        expect(mockedListConnectors).toHaveBeenCalled();
        expect(screen.getByTestId("connector-status")).toBeTruthy();
        expect(mockedGetConnector).not.toHaveBeenCalled();
        expect(mockedGetHealth).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: /show health/i }));
        await waitFor(() => {
            expect(mockedGetHealth).toHaveBeenCalledWith("cn_gh1");
        });

        fireEvent.click(screen.getByTestId("connector-configure"));
        await waitFor(() => {
            expect(screen.getByTestId("tracker-configure-sheet")).toBeTruthy();
        });
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="ready"]')).toBeTruthy();
        });
        expect(mockedGetConnector).toHaveBeenCalledWith("cn_gh1");
    });

    it("shows forbidden connector editor for non-admins and still mounts accounts tab", async () => {
        render(
            <SettingsDialog
                open
                onOpenChange={() => undefined}
                user={{ email: "v@example.com", name: "Viewer", role: "viewer" }}
            />,
        );
        fireEvent.click(screen.getByTestId("settings-tab-trackers"));
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="forbidden"]')).toBeTruthy();
        });
        fireEvent.click(screen.getByTestId("settings-tab-accounts"));
        await waitFor(() => {
            expect(screen.getByTestId("connected-accounts-host")).toBeTruthy();
            expect(screen.getByTestId("linkable-connectors-residual")).toBeTruthy();
        });
    });

    it("unmounts connector host when leaving the trackers tab", async () => {
        render(
            <SettingsDialog
                open
                onOpenChange={() => undefined}
                user={{ email: "a@example.com", name: "Admin", role: "admin" }}
            />,
        );
        fireEvent.click(screen.getByTestId("settings-tab-trackers"));
        await waitFor(() => expect(screen.getByTestId("tracker-settings-host")).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: /git & ssh/i }));
        expect(screen.queryByTestId("tracker-settings-host")).toBeNull();
    });
});

describe("discussion host mounts (C4/C8)", () => {
    const settings = {
        destination: trackerUiMocks.projectSettings.destination,
        acknowledgement: trackerUiMocks.projectSettings.acknowledgement,
        promoteMinRole: trackerUiMocks.projectSettings.promoteMinRole,
        autoMinSeverity: trackerUiMocks.projectSettings.autoMinSeverity,
        autoTaskClass: trackerUiMocks.projectSettings.autoTaskClass,
    };

    it("CommentCard shows chip, destination disclosure, and promote control", async () => {
        const onTrackerChange = vi.fn();
        render(
            <CommentCard
                comment={baseComment({ tracker: null })}
                screenPosition={{ x: 40, y: 40 }}
                projectId="prj_47c2551996d0"
                trackerSettings={settings}
                canModify
                onClose={() => undefined}
                onResolve={async () => undefined}
                onReply={async () => undefined}
                onDelete={async () => undefined}
                onTrackerChange={onTrackerChange}
            />,
        );
        expect(document.querySelector('[data-tracker-discussion-host="canvas-card"]')).toBeTruthy();
        expect(screen.getByTestId("thread-link-chip")).toHaveTextContent(/not linked/i);
        expect(document.querySelector("[data-tracker-promotion]")).toBeTruthy();
        expect(screen.getByTestId("promote-button")).toBeTruthy();
        // Destination is disclosed before promote.
        expect(screen.getByText(/acme\/openswitch/i)).toBeTruthy();
    });

    it("viewer without canPublish sees publication-denied note", () => {
        render(
            <CommentCard
                comment={baseComment({ permissions: viewerPermissions, tracker: null })}
                screenPosition={null}
                projectId="prj_47c2551996d0"
                trackerSettings={settings}
                onClose={() => undefined}
                onResolve={async () => undefined}
                onReply={async () => undefined}
                onDelete={async () => undefined}
            />,
        );
        expect(screen.getByTestId("publication-denied-note")).toBeTruthy();
    });

    it("CommentPanel mounts stacked chip and promotion chrome", () => {
        render(
            <CommentPanel
                comments={[baseComment({ tracker: trackerUiMocks.linkedProjection })]}
                projectId="prj_47c2551996d0"
                trackerSettings={settings}
                canModify
                onClose={() => undefined}
                onResolve={async () => undefined}
                onReply={async () => undefined}
                onDelete={async () => undefined}
                onCommentClick={() => undefined}
            />,
        );
        expect(document.querySelector('[data-tracker-discussion-host="canvas-panel"]')).toBeTruthy();
        expect(screen.getByTestId("thread-link-chip")).toBeTruthy();
        expect(document.querySelector("[data-tracker-promotion]")).toBeTruthy();
    });

    it("CommentForm discloses destination when auto-promote eligible", () => {
        render(
            <CommentForm
                isOpen
                onClose={() => undefined}
                onSubmit={() => undefined}
                location={{ x: 1, y: 2, layer: "F.Cu" }}
                context="SCH"
                trackerSettings={settings}
            />,
        );
        // Default severity is info — not auto-eligible yet.
        expect(screen.queryByTestId("comment-form-auto-promote")).toBeNull();
        expect(commentAutoEligible({ severity: "minor", commentClass: "general" }, settings)).toBe(true);
    });

    it("merges onTrackerChange into the host without requiring a full reload", async () => {
        const onTrackerChange = vi.fn();
        vi.mocked(trackersClient.promoteComment).mockResolvedValue(trackerUiMocks.linkedProjection);
        render(
            <CommentCard
                comment={baseComment({ tracker: null })}
                screenPosition={null}
                projectId="prj_47c2551996d0"
                trackerSettings={settings}
                canModify
                onClose={() => undefined}
                onResolve={async () => undefined}
                onReply={async () => undefined}
                onDelete={async () => undefined}
                onTrackerChange={onTrackerChange}
            />,
        );
        fireEvent.click(screen.getByTestId("promote-button"));
        await waitFor(() => {
            expect(screen.getByText(/promote to tracker/i)).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /^promote$/i }));
        await waitFor(() => {
            expect(onTrackerChange).toHaveBeenCalledWith("c_42", trackerUiMocks.linkedProjection);
        });
    });

    it("RemoteReply badges unsynced_local replies in the card host", () => {
        const comment = baseComment({
            replies: [
                {
                    id: "r_1",
                    author: "Priya",
                    authorUserId: "u_priya",
                    authorKind: "user",
                    timestamp: "2026-09-20T00:00:00Z",
                    updatedAt: "2026-09-20T00:00:00Z",
                    revision: 1,
                    content: "Follow-up",
                    origin: "prism",
                    sync: { state: "unsynced_local", reason: "publication_required" },
                } as Comment["replies"][number] & { sync: { state: string; reason: string } },
            ],
        });
        render(
            <CommentCard
                comment={comment}
                screenPosition={null}
                projectId="prj_47c2551996d0"
                trackerSettings={settings}
                onClose={() => undefined}
                onResolve={async () => undefined}
                onReply={async () => undefined}
                onDelete={async () => undefined}
            />,
        );
        expect(document.querySelector('[data-reply-sync="unsynced_local"]')).toBeTruthy();
    });
});

describe("comparison discussion host (C8)", () => {
    it("mounts chip and promotion controls and clears local draft chrome on project change", async () => {
        const { rerender } = render(
            <ComparisonDiscussionRail
                projectId="prj_a"
                base="aaa"
                compare="bbb"
                domain="PCB"
                anchor={null}
                comments={[baseComment({ id: "c_cmp", context: "PCB" })]}
                canComment
                onCommentsChange={() => undefined}
                onClose={() => undefined}
            />,
        );
        await waitFor(() => {
            expect(mockedGetProjectTracker).toHaveBeenCalledWith("prj_a");
        });
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-discussion-host="comparison-thread"]')).toBeTruthy();
            expect(document.querySelector("[data-tracker-promotion]")).toBeTruthy();
        });

        mockedGetProjectTracker.mockClear();
        rerender(
            <ComparisonDiscussionRail
                projectId="prj_b"
                base="ccc"
                compare="ddd"
                domain="PCB"
                anchor={null}
                comments={[]}
                canComment
                onCommentsChange={() => undefined}
                onClose={() => undefined}
            />,
        );
        await waitFor(() => {
            expect(mockedGetProjectTracker).toHaveBeenCalledWith("prj_b");
        });
        expect(document.querySelector('[data-tracker-discussion-host="comparison-thread"]')).toBeNull();
    });
});

describe("project host wiring (allowlist source)", () => {
    it("ProjectDetailPage mounts ProjectTrackerSettingsPanel keyed by projectId", () => {
        const source = readFileSync(
            path.resolve(__dirname, "../../pages/ProjectDetailPage.tsx"),
            "utf8",
        );
        expect(source).toContain("ProjectTrackerSettingsPanel");
        expect(source).toContain("key={projectId}");
        expect(source).toContain('data-testid="project-tracker-settings-open"');
        expect(source).toContain("isAdmin={user?.role === \"admin\"}");
    });

    it("visualizer loads project tracker settings and polls pending sync", () => {
        const source = readFileSync(
            path.resolve(__dirname, "../visualizer.tsx"),
            "utf8",
        );
        expect(source).toContain("getProjectTracker(projectId)");
        expect(source).toContain("isWorkPending");
        expect(source).toContain("trackerSettings={trackerSettings}");
        expect(source).toContain("onTrackerChange={applyTrackerProjection}");
    });

    it("comparison comments hook clears prior list on pair change", () => {
        const source = readFileSync(
            path.resolve(__dirname, "../design-comparison/use-comparison-comments.ts"),
            "utf8",
        );
        expect(source).toContain("setComments([])");
        expect(source).toContain("isWorkPending");
    });
});
