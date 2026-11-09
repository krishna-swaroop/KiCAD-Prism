import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "@/lib/api";
import { clearSupplyCsv, CsvRejectedError, uploadSupplyCsv } from "./supply-api";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("uploadSupplyCsv", () => {
  const file = new File(["sku,mpn,manufacturer,stock\n"], "stock list.csv", { type: "text/csv" });

  it("sends the file as the raw body with its name in the query", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { filename: "stock list.csv", row_count: 1, ignored_columns: [] }));
    const result = await uploadSupplyCsv("c 1", file);
    expect(result.row_count).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/supply/connectors/c%201/csv?filename=stock+list.csv");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get("Content-Type")).toBe("text/csv");
  });

  it("turns a refused file into an error that carries the rows to fix", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, {
      code: "csv_rejected",
      detail: "The file was not imported. 2 problem(s) found.",
      error_count: 2,
      errors: [{ line: 3, column: "stock", message: "Required." }],
    }));
    const error = await uploadSupplyCsv("c1", file).catch((caught) => caught);
    expect(error).toBeInstanceOf(CsvRejectedError);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.message).toBe("The file was not imported. 2 problem(s) found.");
    expect(error.errors).toEqual([{ line: 3, column: "stock", message: "Required." }]);
    expect(error.errorCount).toBe(2);
  });

  it("names the size limit on a 413", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 413 }));
    const error = await uploadSupplyCsv("c1", file).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.status).toBe(413);
    expect(error.message).toMatch(/5 MB/);
  });

  it("passes other server errors through with their message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { code: "not_csv", detail: "Only a CSV connector takes an offers file." }));
    const error = await uploadSupplyCsv("c1", file).catch((caught) => caught);
    expect(error).not.toBeInstanceOf(CsvRejectedError);
    expect(error.message).toBe("Only a CSV connector takes an offers file.");
  });

  it("copes with an error body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const error = await uploadSupplyCsv("c1", file).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.status).toBe(502);
    expect(error.message).toBe("Could not upload the file");
  });
});

describe("clearSupplyCsv", () => {
  it("deletes and resolves on 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(clearSupplyCsv("c1")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/supply/connectors/c1/csv");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throws the server's reason", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: "Connector not found" }));
    await expect(clearSupplyCsv("c1")).rejects.toThrow("Connector not found");
  });
});
