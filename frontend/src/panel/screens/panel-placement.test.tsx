import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelComponent } from "@/panel/lib/panel-api";
import { getComponent, getInlineBundle, getPartManifest } from "@/panel/lib/panel-api";
import { KiCadRpcError, hasSession, sendRpcCommand } from "@/panel/lib/kicad-bridge";
import { PLACEMENT_RESPONSE_TIMEOUT_MS } from "@/panel/lib/panel-placement";

import { PartDetailScreen } from "./PartDetailScreen";

vi.mock("@/panel/lib/panel-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/panel/lib/panel-api")>(),
  getComponent: vi.fn(),
  getPartManifest: vi.fn(),
  getInlineBundle: vi.fn(),
}));
vi.mock("@/panel/lib/kicad-bridge", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/panel/lib/kicad-bridge")>(),
  hasSession: vi.fn(),
  sendRpcCommand: vi.fn(),
}));
vi.mock("@/components/workspace/library-preview-inspector", () => ({
  LibraryPreviewPair: () => null,
}));

const placeable: PanelComponent = {
  id: "part",
  slug: "part",
  name: "LM358",
  identity_kind: "mpn",
  manufacturer: "TI",
  mpn: "LM358",
  description: "Op-amp",
  package_name: "SOIC-8",
  category: "ICs",
  datasheet_url: "",
  summary: "",
  version: "1",
  library_name: "Prism",
  symbol_name: "LM358",
  representations: [{
    id: "rep-1",
    label: "Default",
    is_default: true,
    display_order: 0,
    source_internal_part_number: "",
    symbol: {
      id: "sym",
      asset_type: "symbol",
      name: "LM358",
      target_library: "Prism",
      target_name: "LM358",
      content_type: "application/x-kicad-symbol",
      required: true,
    },
    footprint: {
      id: "fp",
      asset_type: "footprint",
      name: "SOIC-8",
      target_library: "Prism",
      target_name: "SOIC-8",
      content_type: "application/x-kicad-footprint",
      required: true,
    },
  }],
  assets: [],
  missing_assets: [],
  availability_state: "place_ready",
  place_enabled: true,
  default_representation_id: "rep-1",
  effective_representation_id: "rep-1",
  preview_status: {},
  symbol_preview_url: "",
  footprint_preview_url: "",
  manifest_url: "",
  inline_url: "",
};

describe("panel placement", () => {
  beforeEach(() => {
    vi.mocked(hasSession).mockReturnValue(true);
    vi.mocked(getComponent).mockResolvedValue(placeable);
    vi.mocked(getPartManifest).mockResolvedValue({ library: "Prism" });
    vi.mocked(getInlineBundle).mockResolvedValue({
      library: "Prism",
      symbol_name: "LM358",
      compression: "",
      data: "",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("dispatches PLACE_COMPONENT once when KiCad accepts and drops the reply", async () => {
    vi.mocked(sendRpcCommand).mockImplementation(() => new Promise(() => {}));
    render(<PartDetailScreen componentId="part" onBack={() => {}} appendLog={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Place" }));
    await waitFor(() => expect(sendRpcCommand).toHaveBeenCalledTimes(1));
    expect(sendRpcCommand).toHaveBeenCalledWith(
      "PLACE_COMPONENT",
      { library: "Prism" },
      "",
      PLACEMENT_RESPONSE_TIMEOUT_MS,
    );
    expect(screen.getByRole("button", { name: "Place" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More actions" })).toBeDisabled();

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(sendRpcCommand).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable error after a dropped acknowledgement and allows a deliberate retry", async () => {
    vi.mocked(sendRpcCommand)
      .mockRejectedValueOnce(new KiCadRpcError("unknown_outcome", "Response timeout"))
      .mockResolvedValueOnce({ status: "OK", command: "PLACE_COMPONENT" });

    render(<PartDetailScreen componentId="part" onBack={() => {}} appendLog={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Place" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the schematic before placing again");
    expect(sendRpcCommand).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await waitFor(() => expect(sendRpcCommand).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
