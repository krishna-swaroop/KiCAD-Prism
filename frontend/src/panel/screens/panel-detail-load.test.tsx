import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { PanelApiError, getComponent, type PanelComponent } from "@/panel/lib/panel-api";

import { PartDetailScreen } from "./PartDetailScreen";

vi.mock("@/panel/lib/panel-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/panel/lib/panel-api")>(),
  getComponent: vi.fn(),
  getPartManifest: vi.fn(),
  getInlineBundle: vi.fn(),
}));
vi.mock("@/components/workspace/library-preview-inspector", () => ({
  LibraryPreviewPair: () => null,
}));

const placeable: PanelComponent = {
  id: "part-a",
  slug: "part-a",
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

const slimPrefetch: PanelComponent = {
  ...placeable,
  representations: [],
  default_representation_id: "",
  effective_representation_id: "",
};

const otherPart: PanelComponent = {
  ...placeable,
  id: "part-b",
  slug: "part-b",
  name: "NE555",
  mpn: "NE555",
  symbol_name: "NE555",
};

const noop = () => {};

function renderDetail(
  overrides: Partial<ComponentProps<typeof PartDetailScreen>> = {},
) {
  return render(
    <PartDetailScreen
      componentId="part-a"
      onBack={noop}
      onAuthRequired={noop}
      appendLog={noop}
      {...overrides}
    />,
  );
}

describe("panel detail loading", () => {
  beforeEach(() => {
    vi.mocked(getComponent).mockResolvedValue(placeable);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not treat a slim prefetch as Place-ready while detail is still loading", () => {
    vi.mocked(getComponent).mockImplementation(() => new Promise(() => {}));
    renderDetail({ prefetched: slimPrefetch });
    expect(screen.getByText("LM358")).toBeInTheDocument();
    expect(screen.getByText("Loading details…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Place" })).not.toBeInTheDocument();
  });

  it("returns to login on 401 instead of keeping the skeleton", async () => {
    const onAuthRequired = vi.fn();
    vi.mocked(getComponent).mockRejectedValue(new PanelApiError(401, "Unauthorized"));
    renderDetail({ onAuthRequired });
    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Couldn't load this part")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Place" })).not.toBeInTheDocument();
  });

  it("shows retry and back for a 404", async () => {
    const onBack = vi.fn();
    vi.mocked(getComponent).mockRejectedValue(new PanelApiError(404, "Missing"));
    renderDetail({ onBack });
    expect(await screen.findByText("Part not found")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure instead of pinning the skeleton", async () => {
    vi.mocked(getComponent)
      .mockRejectedValueOnce(new PanelApiError(0, "Network error: failed"))
      .mockResolvedValueOnce(placeable);
    renderDetail();
    expect(await screen.findByText("Couldn't load this part")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByRole("button", { name: "Place" })).toBeEnabled();
    expect(getComponent).toHaveBeenCalledTimes(2);
  });

  it("ignores a late first-part response after switching parts, even if fetch ignores abort", async () => {
    let finishFirst!: (detail: PanelComponent) => void;
    vi.mocked(getComponent).mockImplementation((id) => {
      if (id === "part-a") {
        return new Promise((resolve) => {
          finishFirst = resolve;
        });
      }
      return Promise.resolve(otherPart);
    });
    const view = renderDetail();
    view.rerender(
      <PartDetailScreen
        componentId="part-b"
        onBack={noop}
        onAuthRequired={noop}
        appendLog={noop}
      />,
    );
    expect(await screen.findByRole("button", { name: "Place" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "NE555" })).toBeInTheDocument();
    await act(async () => finishFirst(placeable));
    expect(screen.getByRole("heading", { name: "NE555" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "LM358" })).not.toBeInTheDocument();
  });
});
