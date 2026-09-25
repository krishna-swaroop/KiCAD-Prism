import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DesignSearchField } from "./design-search-field";
import { VISUALIZER_DESIGN_SEARCH_SLOT_ID } from "@/lib/design-search";
import type { PrismSemanticIndex } from "@/types/prism-selection";

const index: PrismSemanticIndex = {
    schema: "prism.semantic_index_a0",
    sourceRevisionKey: "rev",
    components: [
        {
            componentUid: "cmp:R12",
            reference: "R12",
            value: "10k",
            footprint: "R_0402",
        },
        {
            componentUid: "cmp:R13",
            reference: "R13",
            value: "10k",
            footprint: "R_0402",
        },
        {
            componentUid: "cmp:R14",
            reference: "R14",
            value: "10k",
            footprint: "R_0402",
        },
    ],
    nets: [{ netUid: "net:GND", name: "GND", netClass: "Power" }],
    terminals: [],
    indexes: {},
};

function Harness({
    onPick,
    loading,
}: {
    onPick: (title: string) => void;
    loading?: boolean;
}) {
    const [picked, setPicked] = useState("");
    return (
        <>
            <p>{picked ? `picked ${picked}` : "idle"}</p>
            <DesignSearchField
                semanticIndex={index}
                loading={loading}
                onPick={(hit) => {
                    setPicked(hit.title);
                    onPick(hit.title);
                }}
            />
        </>
    );
}

describe("DesignSearchField", () => {
    beforeEach(() => {
        const slot = document.createElement("div");
        slot.id = VISUALIZER_DESIGN_SEARCH_SLOT_ID;
        document.body.append(slot);
    });

    afterEach(() => {
        document.getElementById(VISUALIZER_DESIGN_SEARCH_SLOT_ID)?.remove();
    });

    it("opens under the field, lists components and nets, and picks on click", () => {
        const picked: string[] = [];
        render(<Harness onPick={(title) => picked.push(title)} />);

        const field = screen.getByRole("combobox", { name: "Find component or net" });
        fireEvent.focus(field);
        expect(screen.getByText("Reference, value, footprint, or net name")).toBeTruthy();

        fireEvent.change(field, { target: { value: "r12" } });
        fireEvent.click(screen.getByRole("option", { name: /R12/ }));
        expect(picked).toEqual(["R12"]);
        expect(screen.queryByRole("listbox")).toBeNull();
        expect((field as HTMLInputElement).value).toBe("r12");
    });

    it("clears the query on a second Escape", () => {
        render(<Harness onPick={() => undefined} />);
        const field = screen.getByRole("combobox", { name: "Find component or net" });
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "gnd" } });
        expect(screen.getByRole("option", { name: /GND/ })).toBeTruthy();

        fireEvent.keyDown(field, { key: "Escape" });
        expect(screen.queryByRole("listbox")).toBeNull();
        expect((field as HTMLInputElement).value).toBe("gnd");

        fireEvent.keyDown(field, { key: "Escape" });
        expect((field as HTMLInputElement).value).toBe("");
    });

    it("moves the highlight with arrows and jumps to the ends with Home/End", () => {
        render(<Harness onPick={() => undefined} />);
        const field = screen.getByRole("combobox", { name: "Find component or net" });
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "10k" } });

        fireEvent.keyDown(field, { key: "ArrowDown" });
        expect(screen.getByRole("option", { name: /R13/ }).getAttribute("aria-selected")).toBe("true");

        fireEvent.keyDown(field, { key: "ArrowUp" });
        expect(screen.getByRole("option", { name: /R12/ }).getAttribute("aria-selected")).toBe("true");

        fireEvent.keyDown(field, { key: "End" });
        expect(screen.getByRole("option", { name: /R14/ }).getAttribute("aria-selected")).toBe("true");

        fireEvent.keyDown(field, { key: "Home" });
        expect(screen.getByRole("option", { name: /R12/ }).getAttribute("aria-selected")).toBe("true");
    });

    it("does not pretend there are no hits while the index is loading", () => {
        render(<Harness onPick={() => undefined} loading />);
        const field = screen.getByRole("combobox", { name: "Find component or net" });
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "R12" } });
        expect(screen.getByText("Loading design index…")).toBeTruthy();
        expect(screen.queryByRole("option")).toBeNull();
    });
});
