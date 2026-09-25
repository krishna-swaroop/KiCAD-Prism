/**
 * VAR-20: the Source step always offers an explicit Default choice, even when
 * the revision has named variants, and a saved name that this revision no
 * longer has falls back to Default instead of rendering blank.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SourceStep } from "./SourceStep";
import type { ReleaseSource } from "../types";

const BASE_SOURCE: ReleaseSource = {
    boards: ["board.kicad_pcb"],
    schematics: ["board.kicad_sch"],
    board: "board.kicad_pcb",
    schematic: "board.kicad_sch",
    project: "board.kicad_pro",
    variants: ["default", "assembly", "pro"],
    bom_presets: ["Current project settings"],
    default_bom_preset: "Current project settings",
    variant: "default",
};

function renderStep(
    source: ReleaseSource | null,
    variant: string,
): { onVariant: ReturnType<typeof vi.fn> } {
    const onVariant = vi.fn();
    render(
        <SourceStep
            commits={[]}
            commitSha={"a".repeat(40)}
            commitsLoading={false}
            source={source}
            variant={variant}
            bomPreset="Current project settings"
            canMutate
            busy=""
            onCommit={vi.fn()}
            onBoard={vi.fn()}
            onSchematic={vi.fn()}
            onVariant={onVariant}
            onBomPreset={vi.fn()}
            onContinue={vi.fn()}
        />,
    );
    return { onVariant };
}

const variantSelect = () =>
    screen.getByLabelText("Variant") as HTMLSelectElement;

describe("SourceStep variant selection", () => {
    it("offers Default plus every named variant", () => {
        renderStep(BASE_SOURCE, "assembly");
        expect(Array.from(variantSelect().options).map((option) => option.value)).toEqual([
            "default",
            "assembly",
            "pro",
        ]);
        expect(variantSelect().value).toBe("assembly");
    });

    it("labels the sentinel as Default and reports the selected name", () => {
        const { onVariant } = renderStep(BASE_SOURCE, "default");
        expect(variantSelect().options[0]!.textContent).toBe("Default");
        fireEvent.change(variantSelect(), { target: { value: "pro" } });
        expect(onVariant).toHaveBeenCalledWith("pro");
    });

    it("falls back to Default when the saved variant left the revision", () => {
        renderStep(BASE_SOURCE, "assembly-v2");
        expect(variantSelect().value).toBe("default");
        expect(Array.from(variantSelect().options).map((option) => option.value)).not.toContain(
            "assembly-v2",
        );
    });

    it("keeps Default selectable when the revision has no named variants", () => {
        renderStep(
            { ...BASE_SOURCE, variants: [], variant: "default" },
            "default",
        );
        expect(variantSelect().disabled).toBe(false);
        expect(Array.from(variantSelect().options).map((option) => option.value)).toEqual([
            "default",
        ]);
    });
});
