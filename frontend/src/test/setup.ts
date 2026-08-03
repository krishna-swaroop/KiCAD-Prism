import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

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
