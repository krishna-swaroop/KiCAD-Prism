import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProjectTrackerChoice } from "./project-tracker-choice";
import type { TrackerSettingsDraft } from "./project-tracker-settings-model";

afterEach(cleanup);

const draft: TrackerSettingsDraft = {
    connectorId: "cn_gh", useOverride: false, containerPath: "", remoteContainerId: "",
    autoMinSeverity: "minor", autoTaskClass: false, promoteMinRole: "designer",
    labels: { base: "prism", severityPrefix: "sev:", classPrefix: "class:", boardPrefix: "board:" },
};
const github = {
    id: "cn_gh", provider: "github", instanceKind: "github.com", displayName: "GitHub-Testing", baseUrl: "",
    bot: { id: null, login: null }, credentialConfigured: true, paused: false,
};

it("offers the trackers that have a connection and marks Jira and Linear as coming", () => {
    render(<ProjectTrackerChoice draft={draft} setDraft={vi.fn()} connectors={[github]} isAdmin />);
    const options = screen.getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
        "GitHub Issues", "Not set upGitLab Issues", "SoonJira", "SoonLinear",
    ]);
    expect(options[0].getAttribute("aria-checked")).toBe("true");
    expect(options.slice(1).every((option) => (option as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByTestId("tracker-connection").textContent).toBe("Via GitHub-Testing");
});

it("switching to GitLab asks for a project on that host", () => {
    const setDraft = vi.fn();
    const gitlab = { ...github, id: "cn_gl", provider: "gitlab", displayName: "Pixxel GitLab" };
    render(<ProjectTrackerChoice draft={draft} setDraft={setDraft} connectors={[github, gitlab]} isAdmin />);
    fireEvent.click(screen.getByRole("radio", { name: /GitLab Issues/ }));
    const next = setDraft.mock.calls[0][0](draft);
    expect(next).toMatchObject({ connectorId: "cn_gl", useOverride: true, containerPath: "", remoteContainerId: "" });
});

it("switching back to the saved tracker restores the saved destination", () => {
    const onRestoreSaved = vi.fn();
    const gitlab = { ...github, id: "cn_gl", provider: "gitlab", displayName: "Pixxel GitLab" };
    render(<ProjectTrackerChoice draft={{ ...draft, connectorId: "cn_gl" }} setDraft={vi.fn()}
        connectors={[github, gitlab]} savedProvider="github" onRestoreSaved={onRestoreSaved} isAdmin />);
    fireEvent.click(screen.getByRole("radio", { name: /GitHub Issues/ }));
    expect(onRestoreSaved).toHaveBeenCalled();
});

it("shows people who cannot manage connections which tracker is used", () => {
    render(<ProjectTrackerChoice draft={{ ...draft, connectorId: "cn_gl" }} setDraft={vi.fn()} connectors={[]}
        savedProvider="gitlab" isAdmin={false} />);
    expect(screen.getByRole("radio", { name: /GitLab Issues/ }).getAttribute("aria-checked")).toBe("true");
});
