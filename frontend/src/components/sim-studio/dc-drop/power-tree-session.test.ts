import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
    readSemanticIndex: vi.fn(),
    readPowerTree: vi.fn(),
}));

import * as api from "../api";

import { boardIndex, candidatesFor, forgetSimStudioCaches, semanticIndexFor } from "./power-tree-session";

const index = {
    schema: "prism.semantic_index.a2",
    designKey: "design",
    components: [],
    nets: [],
    terminals: [],
    indexes: {},
};

beforeEach(() => {
    vi.clearAllMocks();
    forgetSimStudioCaches();
    vi.mocked(api.readSemanticIndex).mockResolvedValue(index as never);
    vi.mocked(api.readPowerTree).mockResolvedValue({} as never);
});

describe("simulation studio revision caches", () => {
    it("reads a board revision once, and reads it again after the head moves", async () => {
        await semanticIndexFor("p1", "sha-one");
        await semanticIndexFor("p1", "sha-one");
        expect(api.readSemanticIndex).toHaveBeenCalledTimes(1);

        await semanticIndexFor("p1", "sha-two");
        expect(api.readSemanticIndex).toHaveBeenCalledTimes(2);
        expect(api.readSemanticIndex).toHaveBeenLastCalledWith("p1", "sha-two");
    });

    it("forgets cached board reads, so a later account starts over", async () => {
        await boardIndex("p1", "sha-one");
        await candidatesFor("p1", "sha-one");

        forgetSimStudioCaches();

        await boardIndex("p1", "sha-one");
        await candidatesFor("p1", "sha-one");
        expect(api.readSemanticIndex).toHaveBeenCalledTimes(2);
        expect(api.readPowerTree).toHaveBeenCalledTimes(2);
    });
});
