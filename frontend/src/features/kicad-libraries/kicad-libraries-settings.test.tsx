import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { forgetServerState } from "@/lib/server-state";
import type { KicadLibrary, KicadLibraryList } from "@/types/kicad-libraries";

const mocks = vi.hoisted(() => ({
    listLibraries: vi.fn(),
    createLibrary: vi.fn(),
    updateLibrary: vi.fn(),
    fetchLibraryAgain: vi.fn(),
    refreshLibrary: vi.fn(),
    checkLibraryNow: vi.fn(),
    updateLibraryNow: vi.fn(),
    freezeLibrary: vi.fn(),
    unfreezeLibrary: vi.fn(),
    pinLibraryAt: vi.fn(),
    listVersions: vi.fn(),
    deleteLibrary: vi.fn(),
    checkRemote: vi.fn(),
}));

vi.mock("@/lib/kicad-libraries-client", () => ({ ...mocks, KICAD_LIBRARIES_KEY: ["kicad-libraries"] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { KicadLibrariesSettings } from "./kicad-libraries-settings";

const A = "a".repeat(40);
const B = "b".repeat(40);
const lsf: KicadLibrary = {
    name: "lsf", kind: "git", variables: ["LSF_KICAD_LIB"], git: "https://example.org/lsf.git", ref: "main", subdir: "", path: "",
    updatePolicy: "follow", pinnedCommit: "", checkIntervalSeconds: 86400, lastCheckedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    lastCheckError: null, remoteCommit: A, fetchedCommit: A, servedCommit: A, state: "ready", error: null, progress: 100,
    sizeBytes: 5 * 1024 * 1024, fetchedAt: "2026-11-02T10:00:00Z", updatedBy: "a@example.org", ready: true, problem: null, overriddenVariables: [],
    etag: '"kicad-library:lsf:3"', projectsUsing: 2,
};
const REFS = { reachable: true, error: null, defaultBranch: "main", tags: ["v2", "v1.5"], branches: ["main", "dev"], refFound: null };
// The repository is read after a short pause in typing.
const LOADED = { timeout: 3000 };

function list(libraries: KicadLibrary[], extra: Partial<KicadLibraryList> = {}) {
    mocks.listLibraries.mockResolvedValue({
        libraries, usage: [], pathLibrariesEnabled: false, checkIntervals: [3600, 21600, 86400, 604800], ...extra,
    });
}

function mount(path = "/") {
    return render(<MemoryRouter initialEntries={[path]}><KicadLibrariesSettings /></MemoryRouter>);
}

async function openMenu(name: string) {
    const trigger = await screen.findByRole("button", { name: `Actions for ${name}` });
    fireEvent.keyDown(trigger, { key: "Enter" });
}

async function choose(item: string) {
    fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

beforeEach(() => {
    list([lsf]);
    mocks.checkRemote.mockResolvedValue(REFS);
});
afterEach(() => {
    cleanup();
    forgetServerState(["kicad-libraries"]);
    vi.clearAllMocks();
});

it("lists each library with its variables, state, size and how many projects use it", async () => {
    mount();
    expect(await screen.findByText("lsf")).toBeTruthy();
    expect(screen.getByText("${LSF_KICAD_LIB}")).toBeTruthy();
    expect(screen.queryByText(/https:\/\/example\.org/)).toBeNull();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText(/Following main, at aaaaaaaa, checked 2 hours ago/)).toBeTruthy();
    expect(screen.getByText("5.0 MB")).toBeTruthy();
    expect(screen.getByText(/2 projects use it/)).toBeTruthy();
});

it("says so when there are no libraries", async () => {
    list([]);
    mount();
    expect(await screen.findByText(/No libraries yet/)).toBeTruthy();
});

it("shows a pinned library whose ref moved, a failed update that keeps serving, and an overridden variable", async () => {
    list([
        { ...lsf, name: "pinned", variables: ["P_LIB"], updatePolicy: "pinned", pinnedCommit: A, remoteCommit: B },
        { ...lsf, name: "broken", variables: ["B_LIB"], state: "failed", error: "git fetch failed", remoteCommit: B },
        { ...lsf, name: "mine", variables: ["M_LIB"], overriddenVariables: ["M_LIB"] },
    ]);
    mount();
    expect(await screen.findByText("Update available")).toBeTruthy();
    expect(screen.getByText(/Pinned at aaaaaaaa, main moved to bbbbbbbb/)).toBeTruthy();
    expect(screen.getByText("Update failed")).toBeTruthy();
    expect(screen.getByText("git fetch failed")).toBeTruthy();
    expect(screen.getByText(/Overridden by the server's environment: M_LIB/)).toBeTruthy();
});

it("shows fetch progress for a library that is still being fetched", async () => {
    list([{ ...lsf, name: "busy", variables: ["BUSY"], ready: false, servedCommit: "", state: "fetching", progress: 40 }]);
    mount();
    expect(await screen.findByText("Fetching 40%")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Fetching busy" }).getAttribute("aria-valuenow")).toBe("40");
});

it("lists variables boards use that nothing defines and starts a library for one", async () => {
    list([lsf], { usage: [
        { variable: "NOPE_LIB", projects: 3, models: 86, sheets: 1, bound: false },
        { variable: "LSF_KICAD_LIB", projects: 1, models: 4, sheets: 0, bound: true },
    ] });
    mount();
    expect(await screen.findByText("Undefined Variables")).toBeTruthy();
    expect(screen.getByText(/86 models and 1 drawing sheet in 3 projects/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Add library" })[1]);
    expect((await screen.findByLabelText("Path variables") as HTMLInputElement).value).toBe("NOPE_LIB");
});

it("opens the add form with the variable named in the address", async () => {
    mount("/?settings=kicad-libraries&variable=KICAD10_3DMODEL_DIR");
    expect((await screen.findByLabelText("Path variables") as HTMLInputElement).value).toBe("KICAD10_3DMODEL_DIR");
});

it("offers KiCad's stock 3D models until a library binds them", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Add KiCad's 3D models/ }));
    expect((await screen.findByLabelText("Name") as HTMLInputElement).value).toBe("kicad-packages3d");
    expect((screen.getByLabelText("Repository") as HTMLInputElement).value).toBe("https://gitlab.com/kicad/libraries/kicad-packages3d.git");
    expect((screen.getByLabelText("Path variables") as HTMLInputElement).value).toBe("KICAD10_3DMODEL_DIR, KICAD9_3DMODEL_DIR");
    cleanup();
    list([{ ...lsf, name: "kicad-packages3d", variables: ["KICAD10_3DMODEL_DIR"] }]);
    forgetServerState(["kicad-libraries"]);
    mount();
    await screen.findByText("kicad-packages3d");
    expect(screen.queryByRole("button", { name: /Add KiCad's 3D models/ })).toBeNull();
});

it("checks, pins and unpins with the library's own ETag", async () => {
    mocks.checkLibraryNow.mockResolvedValue({ library: lsf, remoteCommit: A, moved: false, queued: false, error: null });
    mocks.freezeLibrary.mockResolvedValue(lsf);
    mount();
    await openMenu("lsf");
    await choose("Check now");
    await waitFor(() => expect(mocks.checkLibraryNow).toHaveBeenCalledWith(expect.objectContaining({ etag: lsf.etag })));
    await openMenu("lsf");
    await choose("Pin at this commit");
    await waitFor(() => expect(mocks.freezeLibrary).toHaveBeenCalledWith(expect.objectContaining({ etag: lsf.etag })));
});

it("offers the update only when the remote moved, after saying how many projects refresh", async () => {
    list([{ ...lsf, remoteCommit: B }]);
    mocks.updateLibraryNow.mockResolvedValue(lsf);
    mount();
    await openMenu("lsf");
    await choose("Update to the new commit");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Boards in 2 projects refresh their 3D parts/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Update library" }));
    await waitFor(() => expect(mocks.updateLibraryNow).toHaveBeenCalledWith(expect.objectContaining({ name: "lsf" })));
});

it("does not offer an update for a library whose remote has not moved", async () => {
    mount();
    await openMenu("lsf");
    await screen.findByRole("menuitem", { name: "Check now" });
    expect(screen.queryByRole("menuitem", { name: "Update to the new commit" })).toBeNull();
});

it("lists the versions and pins the library at an earlier one", async () => {
    mocks.listVersions.mockResolvedValue([
        { commit: A, ref: "main", fetchedAt: "2026-11-03T10:00:00Z", requestedBy: "a", serving: true },
        { commit: B, ref: "main", fetchedAt: "2026-11-01T10:00:00Z", requestedBy: "a", serving: false },
    ]);
    mocks.pinLibraryAt.mockResolvedValue(lsf);
    mount();
    await openMenu("lsf");
    await choose("Versions");
    expect(await screen.findByText("Serving")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this version" }));
    await waitFor(() => expect(mocks.pinLibraryAt).toHaveBeenCalledWith(expect.objectContaining({ name: "lsf" }), B));
});

it("removes a library after saying what it takes with it", async () => {
    mocks.deleteLibrary.mockResolvedValue(undefined);
    mount();
    await openMenu("lsf");
    await choose("Remove");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/render without those models/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove library" }));
    await waitFor(() => expect(mocks.deleteLibrary).toHaveBeenCalledWith(expect.objectContaining({ etag: lsf.etag })));
});

it("saves a change to a library with its ETag and the new update policy", async () => {
    mocks.updateLibrary.mockResolvedValue(lsf);
    mount();
    await openMenu("lsf");
    await choose("Edit");
    fireEvent.change(await screen.findByLabelText("Tag or branch"), { target: { value: "dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateLibrary).toHaveBeenCalledTimes(1));
    const [library, changes] = mocks.updateLibrary.mock.calls[0];
    expect(library.etag).toBe(lsf.etag);
    expect(changes).toMatchObject({ ref: "dev", updatePolicy: "follow", checkIntervalSeconds: 86400, variables: ["LSF_KICAD_LIB"] });
});

it("adds a library once its repository answers, following a branch by default", async () => {
    list([]);
    mocks.createLibrary.mockResolvedValue(lsf);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Add library" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "lsf" } });
    fireEvent.change(screen.getByLabelText("Path variables"), { target: { value: "LSF_KICAD_LIB" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "https://example.org/lsf.git" } });
    const trigger = screen.getByRole("combobox", { name: "Tag or branch" }) as HTMLButtonElement;
    await waitFor(() => expect(trigger.disabled).toBe(false), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Add library" }));
    await waitFor(() => expect(mocks.createLibrary).toHaveBeenCalledTimes(1));
    expect(mocks.createLibrary.mock.calls[0][0]).toMatchObject({
        name: "lsf", variables: ["LSF_KICAD_LIB"], git: "https://example.org/lsf.git", ref: "main",
        updatePolicy: "follow", checkIntervalSeconds: 86400,
    });
});
