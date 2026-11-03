import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Gauge } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "./empty-state";
import { OptionSelect } from "./option-select";
import { RefreshIconButton } from "./refresh-icon-button";
import { StatTile } from "./stat-tile";

afterEach(cleanup);

const open = (label: string) => fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });

describe("OptionSelect", () => {
    const options = [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
    ];

    it("shows the placeholder until something is chosen, then reports the pick", () => {
        const onValueChange = vi.fn();
        render(<OptionSelect id="pick" aria-label="Pick" value="" onValueChange={onValueChange} options={options} placeholder="Choose one" />);
        expect(screen.getByLabelText("Pick").textContent).toContain("Choose one");
        open("Pick");
        fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Beta" }));
        expect(onValueChange).toHaveBeenCalledWith("b");
    });

    it("turns the empty option into an empty string, first by default", () => {
        const onValueChange = vi.fn();
        render(<OptionSelect aria-label="Pick" value="a" onValueChange={onValueChange} options={options} emptyLabel="Not set" />);
        open("Pick");
        const names = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
        expect(names).toEqual(["Not set", "Alpha", "Beta"]);
        fireEvent.click(screen.getByRole("option", { name: "Not set" }));
        expect(onValueChange).toHaveBeenCalledWith("");
    });

    it("shows the empty label while the value is empty, and can put it last", () => {
        render(<OptionSelect aria-label="Pick" value="" onValueChange={() => {}} options={options} emptyLabel="None" emptyLast />);
        expect(screen.getByLabelText("Pick").textContent).toContain("None");
        open("Pick");
        const names = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
        expect(names).toEqual(["Alpha", "Beta", "None"]);
    });
});

describe("SectionHeading", () => {
    it("is a heading with an optional count and a slot for actions", () => {
        render(<SectionHeading title="Defects" count={3} actions={<button type="button">Log</button>} />);
        const heading = screen.getByRole("heading", { level: 3 });
        expect(heading.textContent).toBe("Defects3");
        expect(screen.getByRole("button", { name: "Log" })).toBeTruthy();
    });

    it("leaves out the count and actions when not given", () => {
        render(<SectionHeading title="Notes" />);
        expect(screen.getByRole("heading", { name: "Notes" }).querySelector("span")).toBeNull();
    });
});

describe("StatTile", () => {
    it("shows the label, the figure and a hint", () => {
        render(<StatTile icon={Gauge} label="Yield" value="98%" hint="Closed runs" />);
        expect(screen.getByText("Yield")).toBeTruthy();
        expect(screen.getByText("98%")).toBeTruthy();
        expect(screen.getByText("Closed runs")).toBeTruthy();
    });

    it("lets children replace the figure", () => {
        render(
            <StatTile icon={Gauge} label="Good" value={1}>
                <input aria-label="Good" />
            </StatTile>,
        );
        expect(screen.getByRole("textbox", { name: "Good" })).toBeTruthy();
        expect(screen.queryByText("1")).toBeNull();
    });
});

describe("EmptyState", () => {
    it("says what is empty and offers the way out", () => {
        render(<EmptyState action={<button type="button">Add</button>}>Nothing yet.</EmptyState>);
        expect(screen.getByText("Nothing yet.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    });
});

describe("RefreshIconButton", () => {
    it("is an icon button named Refresh that cannot be pressed while it works", () => {
        const onClick = vi.fn();
        const { rerender } = render(<RefreshIconButton refreshing={false} onClick={onClick} />);
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: "Refresh" }).textContent).toBe("");

        rerender(<RefreshIconButton refreshing onClick={onClick} />);
        expect(screen.getByRole("button", { name: "Refresh" })).toHaveProperty("disabled", true);
        expect(screen.getByRole("button", { name: "Refresh" }).querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
    });
});
