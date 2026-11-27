import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogComponent } from "@/types/catalog";
import { createComponent, getComponentRevision } from "./catalog-client";
import { CreateFromButton } from "./library-component-create-from";

vi.mock("./catalog-client");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const released = {
  id: "cmp_10k",
  revision_id: "rev_released",
  released_revision_id: "rev_released",
  revision: 3,
  name: "10k 0603",
  value: "10k",
  manufacturer: "Yageo",
  mpn: "RC0603FR-0710KL",
  description: "Resistor 10k 1% 0603",
  datasheet_url: "https://example.com/rc.pdf",
  category: "Resistors",
  package_name: "0603",
  vendor: "Digi-Key",
  vendor_part_number: "311-10.0KHRCT-ND",
  sap_code: "SAP-10K",
  mass_g: "",
  rqjc_c_w: "",
  rqjc_top_c_w: "",
  temp_min_c: "-55",
  temp_max_c: "155",
  power_dissipation_w: "0.1",
  rate: "",
  extra_fields: { tolerance: "1%" },
  assets: [
    { id: "a_sym", asset_type: "symbol", name: "R.kicad_sym", target_library: "Prism", target_name: "R", content_type: "", required: true },
    { id: "a_fp", asset_type: "footprint", name: "R_0603.kicad_mod", target_library: "Prism", target_name: "R_0603", content_type: "", required: true },
    { id: "a_3d", asset_type: "3dmodel", name: "R_0603.step", target_library: "Prism", target_name: "R_0603.step", content_type: "", required: false },
  ],
  representations: [{ id: "rep1" }],
} as unknown as CatalogComponent;

// The component on screen is an open draft after the release; its metadata must not be used.
const draft = { ...released, revision_id: "rev_draft", revision: 4, description: "draft text" } as CatalogComponent;

beforeEach(() => vi.clearAllMocks());

describe("CreateFromButton", () => {
  it("is disabled until the component has a released revision", () => {
    render(<CreateFromButton component={{ ...draft, released_revision_id: "" }} onCreated={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Create from/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Needs a released revision");
  });

  it("fills the form from the released revision and sends the source with the kept fields", async () => {
    vi.mocked(getComponentRevision).mockResolvedValue(released);
    vi.mocked(createComponent).mockResolvedValue({ ...released, id: "cmp_4k7", name: "4k7 0603", revision: 1 });
    const onCreated = vi.fn();
    render(<CreateFromButton component={draft} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /Create from/ }));
    expect(await screen.findByText("New component from 10k 0603")).toBeTruthy();
    expect(getComponentRevision).toHaveBeenCalledWith("cmp_10k", "rev_released");
    expect((screen.getByLabelText("Description *") as HTMLTextAreaElement).value).toBe("Resistor 10k 1% 0603");
    expect((screen.getByLabelText("Manufacturer part number *") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Datasheet URL *") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Footprint · R_0603")).toBeTruthy();
    expect(screen.getByText("3D model · R_0603.step")).toBeTruthy();
    expect(screen.getByText("Max temperature")).toBeTruthy();
    expect(screen.getByText("tolerance")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Value *"), { target: { value: "4k7" } });
    fireEvent.change(screen.getByLabelText("Manufacturer part number *"), { target: { value: "RC0603FR-074K7L" } });
    fireEvent.change(screen.getByLabelText("Datasheet URL *"), { target: { value: "https://example.com/rc.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: /Create revision/ }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [body] = vi.mocked(createComponent).mock.calls[0];
    expect(body).toMatchObject({
      value: "4k7",
      manufacturer: "Yageo",
      manufacturer_part_number: "RC0603FR-074K7L",
      package_name: "0603",
      vendor: "Digi-Key",
      temp_min_c: "-55",
      temp_max_c: "155",
      power_dissipation_w: "0.1",
      extra_fields: { tolerance: "1%" },
      source: { component_id: "cmp_10k", expected_revision_id: "rev_released" },
    });
    expect(body).not.toHaveProperty("vendor_part_number");
    expect(body).not.toHaveProperty("sap_code");
  });
});
