// Packing, capacity and resolution rules for the GPU net-emphasis mask. The
// renderer needs WebGPU, so everything it must not get wrong lives here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    MIN_NET_MASK_CAPACITY,
    NET_EMPHASIS_OFF,
    NET_EMPHASIS_ON,
    NET_MASK_WGSL,
    findNetByName,
    netMaskCapacityFor,
    normalizeNetIds,
    packNetEmphasis,
    resolveNetIds,
} from "./net-emphasis.js";

describe("normalizeNetIds", () => {
    it("keeps only positive 32-bit integer ids", () => {
        const ids = normalizeNetIds([3, "3", 0, -1, 1.5, Number.NaN, null, 0x1_0000_0000, 9]);
        assert.deepEqual([...ids].sort((a, b) => a - b), [3, 9]);
    });
    it("tolerates a missing set", () => {
        assert.equal(normalizeNetIds(null).size, 0);
    });
});

describe("netMaskCapacityFor", () => {
    it("has a floor and grows to the next power of two past the largest id", () => {
        assert.equal(netMaskCapacityFor([]), MIN_NET_MASK_CAPACITY);
        assert.equal(netMaskCapacityFor([63]), 64);
        assert.equal(netMaskCapacityFor([64]), 128);
        assert.equal(netMaskCapacityFor([1000]), 1024);
    });
    it("never shrinks below the current capacity", () => {
        assert.equal(netMaskCapacityFor([2], 512), 512);
    });
});

describe("packNetEmphasis", () => {
    it("marks exactly the given ids and leaves id 0 off", () => {
        const data = packNetEmphasis([2, 5, 0], 64);
        assert.equal(data.length, 64);
        assert.equal(data[0], NET_EMPHASIS_OFF);
        assert.equal(data[2], NET_EMPHASIS_ON);
        assert.equal(data[5], NET_EMPHASIS_ON);
        assert.equal(data.filter((v) => v === NET_EMPHASIS_ON).length, 2);
    });
    it("is rebuilt from scratch so a smaller set carries no stale bits", () => {
        const first = packNetEmphasis([7], 64);
        const second = packNetEmphasis([], 64);
        assert.equal(first[7], NET_EMPHASIS_ON);
        assert.equal(second[7], NET_EMPHASIS_OFF);
    });
    it("ignores ids past the capacity instead of throwing", () => {
        assert.doesNotThrow(() => packNetEmphasis([5000], 64));
    });
});

describe("resolveNetIds", () => {
    const nets = [
        { id: 1, uid: "net-a", name: "NET_A" },
        { id: 2, uid: "net-b", name: "NET_B" },
    ];
    it("matches by uid first, then by exact name, and drops the rest", () => {
        const ids = resolveNetIds(nets, [
            { netUid: "net-b", netName: "NET_A" },
            { netName: "NET_A" },
            { netName: "net_a" },
            { netName: "NOPE" },
            null,
        ]);
        assert.deepEqual([...ids].sort(), [1, 2]);
    });
    it("is empty without a scene", () => {
        assert.equal(resolveNetIds(undefined, [{ netName: "NET_A" }]).size, 0);
    });
    it("resolves the board's name for a net the netlist calls differently", () => {
        const scene = [
            { id: 1, uid: "a", name: "/Port/MGMT.D0_P", aliases: ["/MGMT.D0_P", "/SOM/MGMT.D0_P"] },
            { id: 2, uid: "b", name: "/SOM/MGMT.D0_P", aliases: ["/MGMT.D0_P"] },
        ];
        const ids = resolveNetIds(scene, [{ netName: "/MGMT.D0_P" }, { netName: "/SOM/MGMT.D0_P" }]);
        assert.deepEqual([...ids], [1]);
    });
});

describe("findNetByName", () => {
    const scene = [
        { id: 1, name: "/Port/SIG", aliases: ["/SIG", "/SOM/SIG"] },
        { id: 2, name: "/SOM/SIG", aliases: ["/SIG"] },
        { id: 3, name: "/SIG_2" },
    ];
    it("prefers the record that owns the copper over the ones it absorbed", () => {
        assert.equal(findNetByName(scene, "/SOM/SIG").id, 1);
        assert.equal(findNetByName(scene, "/SIG").id, 1);
        assert.equal(findNetByName(scene, "/SIG_2").id, 3);
    });
    it("is null for an unknown or empty name", () => {
        assert.equal(findNetByName(scene, "/NOPE"), null);
        assert.equal(findNetByName(scene, ""), null);
        assert.equal(findNetByName(null, "/SIG"), null);
    });
});

describe("NET_MASK_WGSL", () => {
    it("guards id 0 and the array bounds", () => {
        assert.match(NET_MASK_WGSL, /id != 0u/);
        assert.match(NET_MASK_WGSL, /arrayLength\(&netMask\)/);
    });
});
