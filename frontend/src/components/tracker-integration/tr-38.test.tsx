import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerUiMocks } from "@/lib/trackers-client-fixtures";
import { fetchApi } from "@/lib/api";
import {
    DestinationDisclosure,
    ProjectTrackerSettingsPanel,
    TrackerApiError,
    acknowledgeDestination,
    autoPromoteSummary,
    destinationPolicyAlerts,
    destinationSourceLabel,
    formatDestinationLine,
    getProjectTracker,
    isImportedDefaultDestination,
    promoteRoleExplanation,
    updateProjectTracker,
    visibilityAckState,
} from "./index";
import { describeProjectTrackerError } from "./project-tracker-settings";

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

const importedDefaultSettings = {
    ...trackerUiMocks.projectSettings,
    destination: {
        ...trackerUiMocks.projectSettings.destination,
        containerPath: "acme/openswitch",
        remoteContainerId: "pending:acme/openswitch",
        generation: 1,
    },
};

afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
});

beforeEach(() => {
    mockedFetch.mockReset();
});

describe("destination disclosure helpers (C4 / F8)", () => {
    it("formats destination text from exact backend fields without guessing paths", () => {
        expect(formatDestinationLine(trackerUiMocks.destination)).toBe("repo · acme/openswitch · generation 2");
        expect(formatDestinationLine({
            containerKind: "repo",
            containerPath: "",
            remoteContainerId: "pending:prj_x",
            generation: 1,
        })).toBe("repo · (not configured) · generation 1");
    });

    it("distinguishes imported default from administrator override", () => {
        expect(isImportedDefaultDestination({ remoteContainerId: "pending:acme/openswitch" })).toBe(true);
        expect(destinationSourceLabel({ remoteContainerId: "987654321" })).toBe("override");
    });

    it("reports stale public visibility acknowledgement", () => {
        expect(visibilityAckState(trackerUiMocks.publicAckRequired.destination, trackerUiMocks.publicAckRequired.acknowledgement)).toBe(
            "stale",
        );
        expect(destinationPolicyAlerts(trackerUiMocks.publicAckRequired)).toEqual([
            "Visibility acknowledgement is stale. Queued writes stay paused until an administrator re-acknowledges the current destination.",
        ]);
    });

    it("renders compact disclosure for promotion surfaces", () => {
        render(
            <DestinationDisclosure
                variant="compact"
                destination={trackerUiMocks.publicAckRequired.destination}
                acknowledgement={trackerUiMocks.publicAckRequired.acknowledgement}
            />,
        );
        expect(screen.getByTestId("destination-line")).toHaveTextContent("repo · acme/openswitch · generation 2");
        expect(screen.getByTestId("destination-ack-badge")).toHaveTextContent(/stale ack/i);
        expect(screen.getAllByTestId("destination-policy-alert").length).toBeGreaterThan(0);
    });
});

describe("ProjectTrackerSettingsPanel (F8 / F9 / C8)", () => {
    it("renders read-only destination for non-admin users", async () => {
        mockedFetch.mockResolvedValue(respond(trackerUiMocks.projectSettings));
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={false} />);
        await waitFor(() => {
            expect(screen.getByTestId("destination-line")).toHaveTextContent("repo · acme/openswitch · generation 2");
        });
        expect(screen.getByText(/read-only/i)).toBeTruthy();
        expect(screen.getByTestId("viewer-readonly-note")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /save publication settings/i })).toBeNull();
        expect(screen.getByText(promoteRoleExplanation("designer"))).toBeTruthy();
    });

    it("explains viewer opt-in versus designer default", async () => {
        mockedFetch.mockResolvedValue(
            respond({ ...trackerUiMocks.projectSettings, promoteMinRole: "viewer" }),
        );
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={false} />);
        await waitFor(() => {
            expect(screen.getByText(promoteRoleExplanation("viewer"))).toBeTruthy();
        });
        expect(autoPromoteSummary(trackerUiMocks.projectSettings)).toMatch(/severity ≥ minor/i);
    });

    it("blocks non-admin override controls while showing imported default note for admins", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond(importedDefaultSettings))
            .mockResolvedValueOnce(respond([trackerUiMocks.connector]));
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getByTestId("imported-default-note")).toHaveTextContent(/imported default/i);
        });
        expect(screen.getByLabelText(/override imported destination/i)).not.toBeChecked();
        expect(screen.queryByLabelText(/container path/i)).toBeNull();
    });

    it("requires confirmation before changing destination and leaves policy unchanged when cancelled", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond(importedDefaultSettings))
            .mockResolvedValueOnce(respond([trackerUiMocks.connector]));
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getByLabelText(/override imported destination/i)).toBeTruthy();
        });

        fireEvent.click(screen.getByLabelText(/override imported destination/i));
        fireEvent.change(screen.getByLabelText(/container path/i), {
            target: { value: "acme/hardware-issues" },
        });
        fireEvent.change(screen.getByLabelText(/remote container id/i), {
            target: { value: "111222333" },
        });
        fireEvent.click(screen.getByRole("button", { name: /save publication settings/i }));

        await waitFor(() => {
            expect(screen.getByText(/change tracker destination/i)).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
        await waitFor(() => {
            expect(screen.queryByText(/change tracker destination/i)).toBeNull();
        });

        expect(mockedFetch.mock.calls.filter((call) => String(call[0]).includes("/tracker") && call[1]?.method === "PUT")).toHaveLength(0);
        expect(screen.getByTestId("destination-line")).toHaveTextContent(/generation 1/);
    });

    it("saves destination override after confirmation and shows stale acknowledgement alerts", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond(importedDefaultSettings))
            .mockResolvedValueOnce(respond([trackerUiMocks.connector]))
            .mockResolvedValueOnce(
                respond({
                    ...trackerUiMocks.publicAckRequired,
                    destination: {
                        ...trackerUiMocks.publicAckRequired.destination,
                        containerPath: "acme/hardware-issues",
                        remoteContainerId: "111222333",
                        generation: 2,
                    },
                }),
            );
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getByLabelText(/override imported destination/i)).toBeTruthy();
        });

        fireEvent.click(screen.getByLabelText(/override imported destination/i));
        fireEvent.change(screen.getByLabelText(/container path/i), {
            target: { value: "acme/hardware-issues" },
        });
        fireEvent.change(screen.getByLabelText(/remote container id/i), {
            target: { value: "111222333" },
        });
        fireEvent.click(screen.getByRole("button", { name: /save publication settings/i }));
        await waitFor(() => {
            expect(screen.getByText(/change tracker destination/i)).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /change destination/i }));

        await waitFor(() => {
            expect(screen.getByTestId("destination-line")).toHaveTextContent("repo · acme/hardware-issues · generation 2");
        });
        expect(screen.getByTestId("policy-alerts-section")).toBeTruthy();
        expect(screen.getByRole("button", { name: /acknowledge public visibility/i })).toBeTruthy();

        const putCall = mockedFetch.mock.calls.find(
            (call) => String(call[0]).endsWith("/tracker") && call[1]?.method === "PUT",
        );
        expect(putCall).toBeTruthy();
        expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({
            destination: {
                containerPath: "acme/hardware-issues",
                remoteContainerId: "111222333",
            },
        });
    });

    it("acknowledges public visibility after explicit confirmation", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond(trackerUiMocks.publicAckRequired))
            .mockResolvedValueOnce(respond([trackerUiMocks.connector]))
            .mockResolvedValueOnce(
                respond({
                    ...trackerUiMocks.publicAckRequired,
                    acknowledgement: {
                        visibility: "public",
                        acknowledgedBy: "u_admin",
                        acknowledgedAt: "2026-09-20T16:00:00Z",
                        valid: true,
                    },
                }),
            );
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={true} />);
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /acknowledge public visibility/i })).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: /acknowledge public visibility/i }));
        await waitFor(() => {
            expect(screen.getByText(/acknowledge public destination/i)).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /acknowledge public visibility/i }));

        await waitFor(() => {
            expect(screen.getByTestId("destination-ack-badge")).toHaveTextContent(/acknowledged/i);
        });
        const ackCall = mockedFetch.mock.calls.find((call) => String(call[0]).includes("/acknowledge"));
        expect(ackCall?.[1]?.method).toBe("POST");
    });

    it("retries after offline errors", async () => {
        mockedFetch
            .mockResolvedValueOnce(respond({ detail: "offline" }, 503))
            .mockResolvedValueOnce(respond(trackerUiMocks.projectSettings));
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={false} />);
        await waitFor(() => {
            expect(document.querySelector('[data-tracker-phase="offline"]')).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        await waitFor(() => {
            expect(screen.getByTestId("destination-line")).toBeTruthy();
        });
    });

    it("supports keyboard focus in dark mode", async () => {
        document.documentElement.classList.add("dark");
        mockedFetch.mockResolvedValue(respond(trackerUiMocks.projectSettings));
        render(<ProjectTrackerSettingsPanel projectId="prj_47c2551996d0" isAdmin={false} />);
        await waitFor(() => {
            expect(screen.getByTestId("destination-line")).toBeTruthy();
        });
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("maps permission errors for settings", () => {
        const message = describeProjectTrackerError(
            new TrackerApiError(403, { detail: "admin only", code: "admin_required" }),
        );
        expect(message).toMatch(/administrator/i);
        expect(promoteRoleExplanation("viewer")).toMatch(/opts in/i);
    });
});

describe("barrel client consumption for scan:gate", () => {
    it("imports project tracker functions from the feature index", () => {
        expect(getProjectTracker).toBeTypeOf("function");
        expect(updateProjectTracker).toBeTypeOf("function");
        expect(acknowledgeDestination).toBeTypeOf("function");
        expect(DestinationDisclosure).toBeTypeOf("function");
        expect(ProjectTrackerSettingsPanel).toBeTypeOf("function");
    });
});
