import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Give `waitFor` and friends a budget that survives a loaded CI runner.
 *
 * Testing Library defaults to one second. That is ample for the work itself —
 * the comparison shell's "reapplies the selected difference" test settles in
 * about 40ms — but it is a wall-clock budget, and wall clock is not what the
 * suite is short of. CI runs 40 test files on a two-core `ubuntu-latest`, so a
 * worker can sit unscheduled for long enough to blow a one-second deadline
 * while the work it is waiting on has barely started.
 *
 * That is what made the comparison-shell test fail intermittently: it never
 * reproduced running that file alone, only under whole-suite parallelism, and
 * the same commit passed on a re-run with no change. A raised ceiling is the
 * fix for starvation; it would be the wrong fix for a dropped event, which is
 * why the isolated runs mattered — a lost event fails on its own too.
 *
 * The cost is paid only by tests that genuinely fail, which then take longer to
 * report. Set centrally so the budget is one decision rather than a timeout
 * argument grafted onto whichever call flaked last.
 */
configure({ asyncUtilTimeout: 5_000 });

/**
 * Unmount every rendered tree between tests.
 *
 * React Testing Library registers this for itself only when vitest runs with
 * `globals: true`, which this project does not. Without it each `render` leaves
 * its DOM behind, so a later test querying by role or text also finds the
 * previous test's elements and fails on an ambiguous match. Every component
 * test was carrying its own `afterEach(cleanup)` to work around that; this is
 * the one place it belongs.
 *
 * `afterEach` is imported rather than read from the global scope for the same
 * reason — there are no vitest globals here.
 */
afterEach(cleanup);
