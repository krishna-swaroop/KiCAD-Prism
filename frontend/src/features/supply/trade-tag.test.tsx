import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./supply-api")>()), setTradeMark: vi.fn(), clearTradeMark: vi.fn() }));

import * as api from "./supply-api";
import { TradeTag } from "./trade-tag";

afterEach(cleanup);

const stated = { control: "controlled" as const, eccn: ["3A991"], stated: "controlled", stated_eccn: ["3A991"], mark: null };

describe("the export control tag", () => {
  it("names the class when distributors give one, and the dispute when they differ", () => {
    const { rerender } = render(<TradeTag partId="p1" trade={stated} canEdit={false} onChanged={vi.fn()} />);
    expect(screen.getByText("Export controlled 3A991")).toBeTruthy();
    rerender(<TradeTag partId="p1" trade={{ ...stated, control: "disputed", eccn: ["3A991", "EAR99"] }} canEdit={false} onChanged={vi.fn()} />);
    expect(screen.getByText("ECCN disputed")).toBeTruthy();
    rerender(<TradeTag partId="p1" trade={{ control: "none", eccn: ["EAR99"], stated: "none", stated_eccn: ["EAR99"], mark: null }} canEdit={false} onChanged={vi.fn()} />);
    expect(screen.queryByText(/Export controlled/)).toBeNull();
  });

  it("lets a person set it by hand", async () => {
    vi.mocked(api.setTradeMark).mockResolvedValue(undefined);
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<TradeTag partId="p1" trade={{ control: "unknown", eccn: [], stated: "unknown", stated_eccn: [], mark: null }} canEdit onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Set export control" }));
    fireEvent.click(screen.getByRole("radio", { name: "Export controlled" }));
    fireEvent.change(screen.getByLabelText("Class (ECCN)"), { target: { value: "5A002" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.setTradeMark).toHaveBeenCalledWith("p1", "controlled", "5A002"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("boxes the button so it can be seen", () => {
    render(<TradeTag show="button" partId="p1" trade={stated} canEdit onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Set export control" }).className).toContain("border");
  });

  it("can show only the tag or only the button, so the two can stand apart", () => {
    const { rerender } = render(<TradeTag show="tag" partId="p1" trade={stated} canEdit onChanged={vi.fn()} />);
    expect(screen.getByText("Export controlled 3A991")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set export control" })).toBeNull();
    rerender(<TradeTag show="button" partId="p1" trade={stated} canEdit onChanged={vi.fn()} />);
    expect(screen.queryByText("Export controlled 3A991")).toBeNull();
    expect(screen.getByRole("button", { name: "Set export control" })).toBeTruthy();
  });
});
