// IS-14: a failed components GLB is retried with bounded backoff, never every
// tier check, and stays failed after the cap.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    COMPONENT_MAX_FAILURES,
    componentRetryDelayMs,
    componentRetryDue,
    noteComponentFailure,
} from "./component-retry.js";

describe("componentRetryDelayMs", () => {
    it("backs off 2 s, 8 s, 32 s", () => {
        assert.equal(componentRetryDelayMs(1), 2000);
        assert.equal(componentRetryDelayMs(2), 8000);
        assert.equal(componentRetryDelayMs(3), 32000);
    });
});

describe("noteComponentFailure", () => {
    it("counts a first failure and schedules the first retry", () => {
        assert.deepEqual(noteComponentFailure(0, 1000), {
            failures: 1,
            retryAt: 3000,
        });
    });

    it("counts successive failures with growing backoff", () => {
        assert.deepEqual(noteComponentFailure(1, 1000), {
            failures: 2,
            retryAt: 9000,
        });
        assert.deepEqual(noteComponentFailure(2, 1000), {
            failures: 3,
            retryAt: 33000,
        });
    });
});

describe("componentRetryDue", () => {
    it("waits for the backoff to elapse", () => {
        assert.equal(componentRetryDue(2999, 1, 3000), false);
        assert.equal(componentRetryDue(3000, 1, 3000), true);
    });

    it("stays ineligible at and beyond the failure cap", () => {
        assert.equal(
            componentRetryDue(100000, COMPONENT_MAX_FAILURES, 33000),
            false,
        );
    });

    it("contains no retry before the first failure is recorded", () => {
        assert.equal(componentRetryDue(1000, 0, 0), true);
    });
});
