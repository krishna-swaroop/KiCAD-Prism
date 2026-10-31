import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplyCompliance } from "@/types/supply";
import { complianceBadge } from "./compliance-model";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getPartCompliance: vi.fn(),
  declareSubstance: vi.fn(),
  undeclareSubstance: vi.fn(),
  getSvhcList: vi.fn(),
  loadSvhcList: vi.fn(),
  loadSvhcListXlsx: vi.fn(),
}));

import { ComplianceSection } from "./compliance-section";
import * as api from "./supply-api";
import { SvhcListUpload } from "./svhc-list-upload";

const mocked = vi.mocked(api);

const data: SupplyCompliance = {
  rohs: { state: "compliant", reason: "Distributors list the part as RoHS compliant." },
  reach: { state: "affected", reason: "A declared substance is on the Candidate List: Lead." },
  substances: [{ cas: "7439-92-1", note: "solder", declared_by: "a@example.com", declared_at: "2026-03-01T00:00:00+00:00", listed_as: "Lead", from_distributor: false }],
  exemptions: [],
  facts: [],
  list: { loaded: true, substances: 233, loaded_at: "2026-03-01T00:00:00+00:00", loaded_by: "admin@example.com", source_name: "list.csv" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getPartCompliance.mockResolvedValue(data);
  mocked.declareSubstance.mockResolvedValue();
  mocked.undeclareSubstance.mockResolvedValue();
  mocked.getSvhcList.mockResolvedValue(data.list);
  mocked.loadSvhcList.mockResolvedValue(data.list);
});
afterEach(cleanup);

async function openSection() {
  fireEvent.click(await screen.findByRole("button", { name: "Compliance" }));
}

describe("the compliance section", () => {
  it("shows RoHS and REACH with their reasons and the declared substances", async () => {
    render(<ComplianceSection partId="p1" canEdit={false} />);
    await openSection();
    expect(await screen.findByText("A declared substance is on the Candidate List: Lead.")).toBeTruthy();
    expect(screen.getByText("Compliant")).toBeTruthy();
    expect(screen.getByText("Affected")).toBeTruthy();
    expect(screen.getByText("On the Candidate List: Lead")).toBeTruthy();
    expect(screen.queryByLabelText("Declared substance (CAS number)")).toBeNull();
  });

  it("lets a writer declare and remove a substance", async () => {
    render(<ComplianceSection partId="p1" canEdit />);
    await openSection();
    fireEvent.change(await screen.findByLabelText("Declared substance (CAS number)"), { target: { value: "7440-43-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Declare" }));
    await waitFor(() => expect(mocked.declareSubstance).toHaveBeenCalledWith("p1", "7440-43-9", ""));
    fireEvent.click(screen.getByRole("button", { name: "Remove 7439-92-1" }));
    await waitFor(() => expect(mocked.undeclareSubstance).toHaveBeenCalledWith("p1", "7439-92-1"));
  });

  it("shows what each distributor states, flags disagreement, and keeps a distributor's substance out of a writer's hands", async () => {
    mocked.getPartCompliance.mockResolvedValue({
      ...data,
      substances: [{ ...data.substances[0], declared_by: "Mouser", from_distributor: true }],
      facts: [
        { name: "rohs_status", label: "RoHS", disagree: true, sources: [
          { provider: "digikey", source: "DigiKey", value: "ROHS3 Compliant", observed_at: "2026-10-12T10:00:00+00:00" },
          { provider: "mouser", source: "Mouser", value: "RoHS non-compliant", observed_at: "2026-10-12T10:00:00+00:00" },
        ] },
        { name: "hts_eu", label: "Tariff code, European Union (TARIC)", disagree: false, sources: [
          { provider: "mouser", source: "Mouser", value: "8542339000", observed_at: "2026-10-12T10:00:00+00:00" },
        ] },
      ],
    });
    render(<ComplianceSection partId="p1" canEdit />);
    await openSection();
    expect(await screen.findByText("ROHS3 Compliant")).toBeTruthy();
    expect(screen.getByText("RoHS non-compliant")).toBeTruthy();
    expect(screen.getByText("Sources disagree")).toBeTruthy();
    expect(screen.getByText("8542339000")).toBeTruthy();
    expect(screen.getByText("listed by Mouser")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove 7439-92-1" })).toBeNull();
  });

  it("says when the Candidate List is not loaded", async () => {
    mocked.getPartCompliance.mockResolvedValue({ ...data, list: { ...data.list, loaded: false } });
    render(<ComplianceSection partId="p1" canEdit={false} />);
    await openSection();
    expect(await screen.findByText(/Candidate List is not loaded/)).toBeTruthy();
  });

  it("never shows an unknown state as clear", () => {
    expect(complianceBadge("unknown").label).toBe("Unknown");
    expect(complianceBadge("whatever").label).toBe("Unknown");
    expect(complianceBadge("clear").label).toBe("Not affected");
  });
});

describe("the Candidate List upload", () => {
  it("reads the chosen file and sends it", async () => {
    render(<SvhcListUpload />);
    expect(await screen.findByText(/233 substances, from list\.csv/)).toBeTruthy();
    const file = new File(["Name,CAS\nLead,7439-92-1\n"], "echa.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve("Name,CAS\nLead,7439-92-1\n") });
    fireEvent.change(screen.getByLabelText("Candidate List file"), { target: { files: [file] } });
    await waitFor(() => expect(mocked.loadSvhcList).toHaveBeenCalledWith("Name,CAS\nLead,7439-92-1\n", "echa.csv"));
  });

  it("sends an Excel file as base64", async () => {
    mocked.loadSvhcListXlsx.mockResolvedValue(data.list);
    render(<SvhcListUpload />);
    await screen.findByText(/233 substances/);
    const file = new File([new Uint8Array([80, 75, 3, 4])], "echa.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(new Uint8Array([80, 75, 3, 4]).buffer) });
    fireEvent.change(screen.getByLabelText("Candidate List file"), { target: { files: [file] } });
    await waitFor(() => expect(mocked.loadSvhcListXlsx).toHaveBeenCalledWith("UEsDBA==", "echa.xlsx"));
    expect(mocked.loadSvhcList).not.toHaveBeenCalled();
  });
});
