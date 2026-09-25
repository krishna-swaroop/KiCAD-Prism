// VAR-18: the reference -> feature-id translation and its ambiguity rules.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildComponentFeatureGroups,
    isComponentHidden,
    planComponentVisibility,
} from "./component-visibility.js";

const manifest = [
    { designator: "R1", featureId: 101 },
    { designator: "R2", featureId: 102 },
    { designator: "Q1", featureId: 103 },
    { designator: "Q1", featureId: 104 },
];

describe("buildComponentFeatureGroups", () => {
    it("maps each reference to its feature ids", () => {
        const groups = buildComponentFeatureGroups(manifest);
        assert.deepEqual(groups.get("R1"), {
            reference: "R1",
            featureIds: [101],
            ambiguous: false,
        });
    });

    it("marks duplicate manifest entries ambiguous without collapsing them", () => {
        const groups = buildComponentFeatureGroups(manifest);
        const q1 = groups.get("Q1");
        assert.equal(q1.ambiguous, true);
        assert.deepEqual(q1.featureIds, [103, 104]);
    });

    it("marks repeated GLB model nodes ambiguous", () => {
        const groups = buildComponentFeatureGroups(
            [{ designator: "R1", featureId: 101 }],
            new Map([["R1", 2]]),
        );
        assert.equal(groups.get("R1").ambiguous, true);
        assert.deepEqual(groups.get("R1").featureIds, [101]);
    });

    it("skips blank designators and non-positive feature ids", () => {
        const groups = buildComponentFeatureGroups([
            { designator: "", featureId: 7 },
            { designator: "R9", featureId: 0 },
        ]);
        assert.equal(groups.has(""), false);
        assert.deepEqual(groups.get("R9").featureIds, []);
        assert.equal(groups.get("R9").ambiguous, false);
    });
});

describe("planComponentVisibility", () => {
    const groups = buildComponentFeatureGroups(manifest);

    it("hides unambiguous references and reports the rest", () => {
        const plan = planComponentVisibility(
            ["R1", "Q1", "Nope", "R1"],
            groups,
        );
        assert.deepEqual(plan.requested, ["R1", "Q1", "Nope"]);
        assert.deepEqual(plan.applied, ["R1"]);
        assert.deepEqual(plan.ambiguous, ["Q1"]);
        assert.deepEqual(plan.unknown, ["Nope"]);
        assert.deepEqual([...plan.hiddenFeatureIds], [101]);
        assert.deepEqual([...plan.hiddenReferences], ["R1"]);
    });

    it("replaces the previous set instead of accumulating", () => {
        const first = planComponentVisibility(["R1"], groups);
        const second = planComponentVisibility(["R2"], groups);
        assert.deepEqual([...first.hiddenFeatureIds], [101]);
        assert.deepEqual([...second.hiddenFeatureIds], [102]);
        assert.equal(second.hiddenReferences.has("R1"), false);
    });

    it("treats missing input as clearing everything", () => {
        const plan = planComponentVisibility(null, groups);
        assert.deepEqual(plan.requested, []);
        assert.equal(plan.hiddenFeatureIds.size, 0);
    });

    it("never hides board or copper features", () => {
        const plan = planComponentVisibility(["R1", "R2"], groups);
        for (const featureId of plan.hiddenFeatureIds) {
            assert.ok([101, 102].includes(featureId));
        }
    });
});

describe("isComponentHidden", () => {
    it("matches only the hidden reference set", () => {
        const { hiddenReferences } = planComponentVisibility(
            ["R1"],
            buildComponentFeatureGroups(manifest),
        );
        assert.equal(isComponentHidden("R1", hiddenReferences), true);
        assert.equal(isComponentHidden("R2", hiddenReferences), false);
        assert.equal(isComponentHidden("", hiddenReferences), false);
    });
});
