import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extensionUrl, type ExtensionRegistry } from "./extensions-client";
import { ProjectExtensions } from "./project-extensions";
import { ExtensionsSettings } from "./extensions-settings";
import { settingsTabFromParam } from "@/lib/settings-tabs";

const mocks = vi.hoisted(() => ({ useExtensions: vi.fn(), refresh: vi.fn() }));
vi.mock("./extensions-client", async (original) => ({
    ...await original<typeof import("./extensions-client")>(),
    useExtensions: mocks.useExtensions,
}));

const action = { id: "inspect", label: "Inspect context", url: "https://tool.example/view?mode=review", kind: "panel" as const };
const registry: ExtensionRegistry = {
    schema_version: 1,
    extensions: [{ id: "bridge", name: "Context bridge", version: "1.0.0", description: "External engineering tool", actions: [
        action, { ...action, id: "open", label: "Open bridge", kind: "link" },
    ] }],
};
const context = { origin: "https://prism.example", projectId: "p/a & b", commit: "a".repeat(40), branch: "feature/review" };

beforeEach(() => mocks.useExtensions.mockReturnValue({ data: registry, loading: false, fetching: false, error: null, refresh: mocks.refresh }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("extension context", () => {
    it("encodes only the documented context and replaces reserved fields", () => {
        const href = extensionUrl({ ...action, url: `${action.url}&prism_commit=old&prism_token=bad&prism_project_id=spoofed` }, context)!;
        const url = new URL(href);
        expect(url.searchParams.get("mode")).toBe("review");
        expect(url.searchParams.get("prism_project_id")).toBe(context.projectId);
        expect(url.searchParams.get("prism_branch")).toBe(context.branch);
        expect(url.searchParams.get("prism_commit")).toBe(context.commit);
        expect(url.searchParams.has("prism_token")).toBe(false);
        const head = new URL(extensionUrl(action, { ...context, commit: null, branch: null })!);
        expect(head.searchParams.has("prism_commit")).toBe(false);
        expect(head.searchParams.has("prism_branch")).toBe(false);
    });

    it.each(["javascript:alert(1)", "file:///tmp/test", "/api/auth", "https://prism.example/api", "https://prism.example:8443/", "https://prism.example./", "http://prism.example:8000/", "http://remote.example/", "https://name:secret@tool.example/", "https://tool.example/#fragment"])("refuses unsafe target %s", (url) => {
        expect(extensionUrl({ ...action, url }, context)).toBeNull();
    });

    it("allows separately hosted loopback tools", () => {
        expect(extensionUrl({ ...action, url: "http://127.0.0.1:8765/" }, context)).toContain("prism_project_id=");
        expect(extensionUrl({ ...action, url: "http://localhost:8765/" }, { ...context, origin: "http://localhost:5173" })).toBeNull();
    });
});

describe("extension surfaces", () => {
    function project(active = true, commit = context.commit, path = "/?section=extensions") {
        return <MemoryRouter initialEntries={[path]}><ProjectExtensions projectId="p1" commit={commit} branch={context.branch} active={active} /></MemoryRouter>;
    }

    it("does not load tool content until selected and isolates the panel", () => {
        const view = render(project());
        expect(view.container.querySelector("iframe")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Inspect context" }));
        const frame = screen.getByTitle("Context bridge: Inspect context");
        expect(frame).toHaveAttribute("sandbox", "allow-scripts");
        expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
        expect(frame.getAttribute("src")).toContain(`prism_commit=${context.commit}`);
        const link = screen.getByRole("link", { name: "Open bridge" });
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
        expect(view.container.querySelector("iframe")).toBeNull();
    });

    it("remounts for a new revision and unloads hidden panels", () => {
        const view = render(project(true, context.commit, "/?section=extensions&extension=bridge&extension_action=inspect"));
        const initial = view.container.querySelector("iframe");
        view.rerender(project(true, "b".repeat(40)));
        const next = view.container.querySelector("iframe");
        expect(next).not.toBe(initial);
        expect(next?.src).toContain(`prism_commit=${"b".repeat(40)}`);
        view.rerender(project(false));
        expect(view.container.querySelector("iframe")).toBeNull();
    });

    it("unloads removed actions and refuses stale registry data on failure", () => {
        const view = render(project(true, context.commit, "/?extension=bridge&extension_action=inspect"));
        expect(view.container.querySelector("iframe")).not.toBeNull();
        mocks.useExtensions.mockReturnValue({ data: registry, error: new Error("Unavailable"), refresh: mocks.refresh });
        view.rerender(project());
        expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
        expect(view.container.querySelector("iframe")).toBeNull();
        mocks.useExtensions.mockReturnValue({ data: { ...registry, extensions: [] }, refresh: mocks.refresh });
        view.rerender(project());
        expect(screen.getByText(/No extensions installed/)).toBeVisible();
        expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    });

    it("provides registry refresh and a settings deep link", () => {
        render(<ExtensionsSettings />);
        expect(screen.getByText("External engineering tool")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(settingsTabFromParam("extensions")).toBe("extensions");
    });

    it("shows loading without stale launch actions", () => {
        mocks.useExtensions.mockReturnValue({ loading: true, fetching: true, refresh: mocks.refresh });
        const view = render(project());
        expect(screen.getByRole("status")).toHaveTextContent("Loading extensions");
        expect(view.container.querySelector("iframe")).toBeNull();
        expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    });
});
