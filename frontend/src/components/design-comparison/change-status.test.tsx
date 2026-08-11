import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ChangeStatusDot, ChangeStatusLegend } from "./change-status";

describe("change status marks", () => {
    it("names each kind for assistive technology", () => {
        render(<ChangeStatusDot kind="added" />);

        expect(screen.getByRole("img", { name: "Added" })).toBeTruthy();
    });

    it("distinguishes added from removed by shape, not only colour", () => {
        // Added and removed are green and red, the pair red-green colour
        // blindness collapses. If these two ever render the same shape, the
        // change list stops being readable for those users.
        const { container: added } = render(<ChangeStatusDot kind="added" />);
        const { container: removed } = render(<ChangeStatusDot kind="removed" />);
        const { container: changed } = render(<ChangeStatusDot kind="changed" />);

        const shapeOf = (root: HTMLElement) =>
            [...root.firstElementChild!.classList]
                .filter((name) => name.startsWith("rounded") || name === "rotate-45")
                .sort()
                .join(" ");

        expect(shapeOf(added)).not.toEqual(shapeOf(removed));
        expect(shapeOf(added)).not.toEqual(shapeOf(changed));
        expect(shapeOf(removed)).not.toEqual(shapeOf(changed));
    });

    it("carries no text of its own", () => {
        const { container } = render(<ChangeStatusDot kind="removed" />);

        expect(container.textContent).toBe("");
    });

    it("legends all three kinds", () => {
        render(<ChangeStatusLegend />);

        for (const label of ["Added", "Removed", "Modified"]) {
            expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        }
    });
});
