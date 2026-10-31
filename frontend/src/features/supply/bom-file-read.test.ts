import { beforeEach, describe, expect, it, vi } from "vitest";

import { readTableFile } from "./bom-file-read";
import { readBomSheet } from "./supply-api";

vi.mock("./supply-api", () => ({ readBomSheet: vi.fn() }));

function fileOf(bytes: BlobPart, name: string): File {
  const file = new File([bytes], name);
  // jsdom's File has no arrayBuffer or text.
  Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(bytes instanceof Uint8Array ? bytes.buffer : new ArrayBuffer(0)) });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(String(bytes)) });
  return file;
}

describe("reading a BOM file", () => {
  beforeEach(() => vi.mocked(readBomSheet).mockReset());

  for (const extension of ["xlsx", "xlsm"]) {
    it(`sends an .${extension} file to the server as base64 and returns its rows`, async () => {
      const rows = [["Manufacturer", "MPN", "Qty"], ["Acme", "R-10K", "2"]];
      vi.mocked(readBomSheet).mockResolvedValue(rows);
      expect(await readTableFile(fileOf(new Uint8Array([80, 75, 3, 4]), `bom.${extension}`))).toEqual(rows);
      expect(readBomSheet).toHaveBeenCalledWith("UEsDBA==");
    });
  }

  it("reads delimited text in the browser", async () => {
    expect(await readTableFile(fileOf("a;b\n1;2\n", "bom.csv"))).toEqual([["a", "b"], ["1", "2"]]);
    expect(readBomSheet).not.toHaveBeenCalled();
  });
});
