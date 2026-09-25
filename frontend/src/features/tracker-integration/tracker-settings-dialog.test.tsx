import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./project-tracker-settings", () => ({
    ProjectTrackerSettingsPanel: ({ projectId, onManageCodeHosts }: { projectId: string; onManageCodeHosts?: () => void }) => (
        <div>
            Project {projectId} policy
            {onManageCodeHosts ? <button type="button" onClick={onManageCodeHosts}>Connections</button> : null}
        </div>
    ),
}));

import { TrackerSettingsDialog } from "./tracker-settings-dialog";

afterEach(cleanup);

function Location() {
    const location = useLocation();
    return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderDialog(isAdmin: boolean, onOpenChange = vi.fn()) {
    render(
        <MemoryRouter initialEntries={["/project/prj_1"]}>
            <Routes>
                <Route path="*" element={<>
                    <TrackerSettingsDialog projectId="prj_1" isAdmin={isAdmin} open onOpenChange={onOpenChange} />
                    <Location />
                </>} />
            </Routes>
        </MemoryRouter>,
    );
    return onOpenChange;
}

it("keeps project policy here and sends admins to Settings for code hosts", () => {
    const onOpenChange = renderDialog(true);
    fireEvent.click(screen.getByRole("button", { name: "Connections" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("location").textContent).toBe("/?settings=code-hosts");
});

it("does not offer code-host management to non-admins", () => {
    renderDialog(false);
    expect(screen.getByText(/Project prj_1 policy/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
});
