import { describe, expect, it } from "vitest";

import {
  assetMutationRevisionId,
  releaseRetainedRevisionOnConflict,
} from "./library-asset-mutation";

describe("assetMutationRevisionId", () => {
  it("keeps the first selection_required revision after the loaded component moves on", () => {
    expect(assetMutationRevisionId("rev-later", "rev-first")).toBe("rev-first");
  });

  it("uses the loaded revision when there is no retained picker state", () => {
    expect(assetMutationRevisionId("rev-current")).toBe("rev-current");
    expect(assetMutationRevisionId("rev-current", "")).toBe("rev-current");
  });

  it("releases the retained revision after a 409 so a refresh can retry", () => {
    const selection = {
      file: {} as File,
      targetLibrary: "Lib",
      options: ["A", "B"],
      selected: "B",
      expectedRevisionId: "rev-1",
    };
    const afterConflict = releaseRetainedRevisionOnConflict(selection, 409, "revision_conflict");
    expect(afterConflict?.expectedRevisionId).toBe("");
    expect(afterConflict?.selected).toBe("B");
    expect(assetMutationRevisionId("rev-2", afterConflict?.expectedRevisionId)).toBe("rev-2");
    expect(releaseRetainedRevisionOnConflict(selection, 400)).toEqual(selection);
    expect(releaseRetainedRevisionOnConflict(selection, 409)?.expectedRevisionId).toBe("");
    expect(releaseRetainedRevisionOnConflict(selection, 409, "asset_referenced")).toEqual(selection);
    expect(releaseRetainedRevisionOnConflict(selection, 409, "manifest_conflict")).toEqual(selection);
  });
});
