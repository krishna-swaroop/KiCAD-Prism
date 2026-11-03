import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { OptionRow, ProvenanceMarker } from "./option-row";

describe("OptionRow", () => {
    afterEach(cleanup);

    it("leaves a native input to the label's own `for`", () => {
        render(
            <OptionRow label="Layers" htmlFor="layers">
                <input id="layers" />
                <button type="button">Other</button>
            </OptionRow>,
        );
        // The browser focuses the input itself; the row must not steal focus for the button.
        fireEvent.click(screen.getByText("Layers"));
        expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Other" }));
    });

    it("focuses the selected button of a button group when its label is clicked", () => {
        render(
            <OptionRow label="Finish" htmlFor="finish">
                <SegmentedControl
                    id="finish"
                    aria-label="Finish"
                    value="b"
                    onChange={() => undefined}
                    options={[
                        { value: "a", label: "A" },
                        { value: "b", label: "B" },
                    ]}
                />
            </OptionRow>,
        );
        fireEvent.click(screen.getByText("Finish"));
        expect(document.activeElement).toBe(screen.getByRole("radio", { name: "B" }));
    });

    it("focuses the first button when nothing in the group is selected", () => {
        render(
            <OptionRow label="Finish" htmlFor="finish">
                <SegmentedControl
                    id="finish"
                    aria-label="Finish"
                    value=""
                    onChange={() => undefined}
                    options={[
                        { value: "a", label: "A" },
                        { value: "b", label: "B" },
                    ]}
                />
            </OptionRow>,
        );
        fireEvent.click(screen.getByText("Finish"));
        expect(document.activeElement).toBe(screen.getByRole("radio", { name: "A" }));
    });

    it("does nothing for a read-only row with no control to focus", () => {
        render(
            <OptionRow label="Layers">
                <span>4</span>
            </OptionRow>,
        );
        fireEvent.click(screen.getByText("Layers"));
        expect(document.activeElement).toBe(document.body);
    });
});

describe("ProvenanceMarker", () => {
    afterEach(cleanup);

    it("names where a value came from, and shows nothing without one", () => {
        const { rerender, container } = render(<ProvenanceMarker provenance="extracted" />);
        expect(screen.getByText("From board")).toBeTruthy();
        rerender(<ProvenanceMarker provenance="manual" />);
        expect(screen.getByText("Edited")).toBeTruthy();
        rerender(<ProvenanceMarker provenance="default" />);
        expect(screen.getByText("Default")).toBeTruthy();
        rerender(<ProvenanceMarker provenance={null} />);
        expect(container.textContent).toBe("");
    });
});
