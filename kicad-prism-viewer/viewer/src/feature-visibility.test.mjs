// VAR-17: packing and capacity rules for the GPU feature-visibility mask.
// The renderer cannot be unit-tested without WebGPU, so everything the
// renderer must not get wrong (normalization, bounds, grow-only capacity,
// stale-mask clearing) lives here and is pinned by these tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    FEATURE_MASK_WGSL,
    HIDDEN_MASK_VALUE,
    MIN_FEATURE_MASK_CAPACITY,
    VISIBLE_MASK_VALUE,
    featureMaskCapacityFor,
    normalizeHiddenFeatureIds,
    packFeatureVisibility,
} from "./feature-visibility.js";

describe("normalizeHiddenFeatureIds", () => {
    it("keeps only positive 32-bit integer feature ids", () => {
        const normalized = normalizeHiddenFeatureIds([
            7,
            "7",
            0,
            -3,
            2.5,
            Number.NaN,
            "abc",
            null,
            undefined,
            0x1_0000_0000,
            12,
        ]);
        assert.deepEqual([...normalized].sort((a, b) => a - b), [7, 12]);
    });

    it("treats null and undefined as an empty set", () => {
        assert.equal(normalizeHiddenFeatureIds(null).size, 0);
        assert.equal(normalizeHiddenFeatureIds(undefined).size, 0);
    });
});

describe("featureMaskCapacityFor", () => {
    it("keeps the minimum capacity for no features", () => {
        assert.equal(featureMaskCapacityFor([]), MIN_FEATURE_MASK_CAPACITY);
        assert.equal(featureMaskCapacityFor(null, 0), MIN_FEATURE_MASK_CAPACITY);
    });

    it("rounds up to the next power of two past the largest id", () => {
        assert.equal(featureMaskCapacityFor([63]), 64);
        assert.equal(featureMaskCapacityFor([64]), 128);
        assert.equal(featureMaskCapacityFor([1000]), 1024);
        assert.equal(featureMaskCapacityFor([1024]), 2048);
    });

    it("never shrinks past the current capacity", () => {
        assert.equal(featureMaskCapacityFor([2], 512), 512);
        assert.equal(featureMaskCapacityFor([600], 512), 1024);
    });

    it("ignores invalid ids when sizing", () => {
        assert.equal(
            featureMaskCapacityFor([0, -1, 3.2, "x"]),
            MIN_FEATURE_MASK_CAPACITY,
        );
    });
});

describe("packFeatureVisibility", () => {
    it("defaults every slot to visible for an empty mask", () => {
        const data = packFeatureVisibility([], MIN_FEATURE_MASK_CAPACITY);
        assert.equal(data.length, MIN_FEATURE_MASK_CAPACITY);
        assert.ok(data.every((value) => value === VISIBLE_MASK_VALUE));
    });

    it("marks exactly the hidden ids and nothing else", () => {
        const data = packFeatureVisibility([3, 70], MIN_FEATURE_MASK_CAPACITY);
        assert.equal(data[3], HIDDEN_MASK_VALUE);
        assert.equal(data[0], VISIBLE_MASK_VALUE);
        assert.equal(data[2], VISIBLE_MASK_VALUE);
        assert.equal(data[4], VISIBLE_MASK_VALUE);
    });

    it("clears an older mask when the hidden set shrinks", () => {
        const first = packFeatureVisibility([5, 9], MIN_FEATURE_MASK_CAPACITY);
        assert.equal(first[5], HIDDEN_MASK_VALUE);
        const second = packFeatureVisibility([9], MIN_FEATURE_MASK_CAPACITY);
        assert.equal(second[5], VISIBLE_MASK_VALUE);
        assert.equal(second[9], HIDDEN_MASK_VALUE);
    });

    it("drops ids past the uploaded capacity instead of overrunning", () => {
        const data = packFeatureVisibility([1000], MIN_FEATURE_MASK_CAPACITY);
        assert.equal(data.length, MIN_FEATURE_MASK_CAPACITY);
        assert.ok(data.every((value) => value === VISIBLE_MASK_VALUE));
    });

    it("sizes the buffer for the given capacity", () => {
        const data = packFeatureVisibility([300], 512);
        assert.equal(data.length, 512);
        assert.equal(data[300], HIDDEN_MASK_VALUE);
    });
});

describe("shader guard", () => {
    it("bounds-checks the mask and discards hidden fragments", () => {
        assert.match(FEATURE_MASK_WGSL, /arrayLength\(&hiddenMask\)/);
        assert.match(FEATURE_MASK_WGSL, /hiddenMask\[id\] == 0u/);
    });
});
