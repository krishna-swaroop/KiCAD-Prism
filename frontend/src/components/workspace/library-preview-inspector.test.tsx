import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RenderController, RenderNavigationOptions } from "@/lib/ecad-renderer";

import { LibraryPreviewPair } from "./library-preview-inspector";

vi.mock("./library-asset-renderer", async () => {
  const { useEffect, useMemo } = await import("react");
  const { useLibraryCrossProbe } = await import("./library-cross-probe");

  function FakeAssetRenderer({
    kind,
    unit = 1,
    navigation,
    onUnitsChange,
  }: {
    kind: "symbol" | "footprint";
    unit?: number;
    navigation?: RenderNavigationOptions;
    onUnitsChange?: (units: number) => void;
  }) {
    const probe = useLibraryCrossProbe();
    const register = probe?.register;
    const controller = useMemo<RenderController>(
      () => ({
        zoomBy: vi.fn(),
        resetView: vi.fn(),
        setProbeHighlight: vi.fn(() => 1),
        clearProbeHighlight: vi.fn(),
      }),
      [],
    );

    useEffect(() => {
      onUnitsChange?.(kind === "symbol" ? 3 : 1);
    }, [kind, onUnitsChange]);
    useEffect(
      () => register?.(kind, controller),
      [controller, kind, register],
    );

    const surface = navigation?.wheel ?? "unknown";
    return (
      <div data-testid={`${surface}-${kind}`} data-unit={unit}>
        {kind === "symbol" ? (
          <button
            onClick={() =>
              probe?.handleProbe({
                phase: "activate",
                source: "pin",
                number: "1",
                index: "symbol_pin_1",
                crossIndex: "footprint_pad_1",
              })
            }
          >
            Latch pin 1
          </button>
        ) : null}
      </div>
    );
  }

  return {
    EMBEDDED_PREVIEW_NAVIGATION: {
      wheel: "modifier",
      pinch: false,
      touchPan: false,
      drag: true,
    },
    EXPANDED_PREVIEW_NAVIGATION: {
      wheel: "direct",
      pinch: true,
      touchPan: false,
      drag: true,
    },
    LibraryAssetRenderer: FakeAssetRenderer,
  };
});

describe("LibraryPreviewPair", () => {
  it("opens the expanded session with the embedded latch and symbol unit", async () => {
    render(
      <LibraryPreviewPair
        label="Test component"
        symbolAssetId="symbol-a"
        footprintAssetId="footprint-a"
      />,
    );

    const unitC = await screen.findByRole("tab", { name: "Unit C" });
    fireEvent.click(unitC);
    fireEvent.click(screen.getByRole("button", { name: "Latch pin 1" }));
    expect(await screen.findByText("Pin 1 ↔ Pad 1")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand paired preview" }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(
      await within(dialog).findByText("Pin 1 ↔ Pad 1"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: "Unit C" }),
    ).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(within(dialog).getByTestId("direct-symbol")).toHaveAttribute(
        "data-unit",
        "3",
      ),
    );
  });
});
