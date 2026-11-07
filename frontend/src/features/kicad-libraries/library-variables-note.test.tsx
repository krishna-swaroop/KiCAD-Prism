import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { LibraryVariablesNote, librariesLink } from "./library-variables-note";

afterEach(cleanup);

it("says nothing when every model resolved", () => {
    const { container } = render(<LibraryVariablesNote unresolved={[]} missing={[]} canConfigure search="" />);
    expect(container.textContent).toBe("");
});

it("names the variable the server does not define and how many models use it", () => {
    render(<LibraryVariablesNote unresolved={[{ variable: "LSF_KICAD_LIB", models: 86 }]} missing={[]} canConfigure={false} search="" />);
    expect(screen.getByRole("status").textContent).toContain("86 models use LSF_KICAD_LIB, which this server does not define.");
});

it("sends an administrator to add the library and anyone else to an administrator", () => {
    const unresolved = [{ variable: "LSF_KICAD_LIB", models: 1 }];
    render(<LibraryVariablesNote unresolved={unresolved} missing={[]} canConfigure search="?commit=abc&tab=3d" />);
    const link = screen.getByRole("link", { name: "Add a library" });
    expect(link.getAttribute("href")).toBe("?commit=abc&tab=3d&settings=kicad-libraries&variable=LSF_KICAD_LIB");
    cleanup();
    render(<LibraryVariablesNote unresolved={unresolved} missing={[]} canConfigure={false} search="" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Ask an administrator to add it.")).toBeTruthy();
});

it("says which model files are missing from a library that is defined", () => {
    render(<LibraryVariablesNote unresolved={[]} missing={[{ variable: "KICAD10_3DMODEL_DIR", models: 2 }, { variable: "LSF_KICAD_LIB", models: 1 }]} canConfigure search="" />);
    expect(screen.getByText(/2 model files under/).textContent).toContain("are not in its library");
    expect(screen.getByText(/1 model file under/).textContent).toContain("is not in its library");
});

it("closes, and opens again when what it reports changes", () => {
    const missing = [{ variable: "LSF_KICAD_LIB", models: 76 }];
    const { rerender } = render(<LibraryVariablesNote unresolved={[]} missing={missing} canConfigure search="" />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<LibraryVariablesNote unresolved={[]} missing={[...missing]} canConfigure search="" />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<LibraryVariablesNote unresolved={[]} missing={[{ variable: "LSF_KICAD_LIB", models: 3 }]} canConfigure search="" />);
    expect(screen.getByRole("status").textContent).toContain("3 model files under");
});

it("sits clear of a side panel open over the viewer", () => {
    render(<LibraryVariablesNote unresolved={[{ variable: "X_LIB", models: 1 }]} missing={[]} canConfigure search="" leftInset={320} />);
    expect(screen.getByRole("status").style.left).toBe("332px");
});

it("replaces an earlier settings link rather than stacking another", () => {
    expect(librariesLink("?settings=accounts&variable=OLD", "NEW_LIB")).toBe("?settings=kicad-libraries&variable=NEW_LIB");
});
