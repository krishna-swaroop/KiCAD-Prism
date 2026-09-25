import assert from "node:assert/strict";
import test from "node:test";

import { createReloadOwner, runSemanticViewerReload } from "./semantic-viewer-reload.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function bundleFor(name) {
  return {
    bundle: { readiness: { stage: "semantic-ready", progress: 100 } },
    topology: { name },
    semanticGeometry: { name },
  };
}

function makeController(name, log) {
  return {
    name,
    performance: {},
    disposed: false,
    dispose() {
      this.disposed = true;
      log.push(`dispose:${name}`);
    },
    setWorkspace() {},
    setSelection() {},
  };
}

// Mirrors the custom element's host surface. Loads and mounts are deferred so
// a test can resolve them in any order and observe what the host published.
function makeHost() {
  const log = [];
  const loads = new Map();
  const mounts = new Map();
  const host = {
    isConnected: true,
    content: "",
    controller: null,
    ready: [],
    errors: [],
    log,
    loads,
    mounts,
    renderLoading() {
      host.content = "loading";
      log.push("render:loading");
    },
    renderShell() {
      host.content = "shell";
      log.push("render:shell");
    },
    renderError(error) {
      host.content = `error:${error.message}`;
      log.push(`render:error:${error.message}`);
    },
    mountViewer({ topology, signal }) {
      const pending = deferred();
      mounts.set(topology.name, { ...pending, signal });
      log.push(`mount:${topology.name}`);
      return pending.promise;
    },
    publishController(controller) {
      host.controller?.dispose?.();
      host.controller = controller;
      host.content = `viewer:${controller.name}`;
      log.push(`publish:${controller.name}`);
    },
    emitReady(detail) {
      host.ready.push(detail);
      log.push("emit:ready");
    },
    emitError(error) {
      host.errors.push(error);
      log.push(`emit:error:${error.message}`);
    },
  };
  const loadBundle = (bundleUrl, timings, signal) => {
    const pending = deferred();
    loads.set(bundleUrl, { ...pending, signal });
    log.push(`load:${bundleUrl}`);
    return pending.promise;
  };
  const controllerFor = (name) => makeController(name, log);
  return { host, loadBundle, controllerFor };
}

function startReload(host, loadBundle, owner, bundleUrl) {
  const attempt = owner.begin();
  host.controller?.dispose?.();
  host.controller = null;
  return runSemanticViewerReload(host, attempt, { owner, bundleUrl, loadBundle, now: () => 0 });
}

async function settle() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

test("owner aborts the previous attempt and recognises only the current one", () => {
  const owner = createReloadOwner();
  const first = owner.begin();
  assert.equal(owner.owns(first), true);
  const second = owner.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(owner.owns(first), false);
  assert.equal(owner.owns(second), true);
  owner.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(owner.owns(second), false);
  assert.equal(owner.owns(null), false);
});

test("a stale load that resolves after a newer reload publishes nothing", async () => {
  const { host, loadBundle, controllerFor } = makeHost();
  const owner = createReloadOwner();

  const runA = startReload(host, loadBundle, owner, "a.json");
  const runB = startReload(host, loadBundle, owner, "b.json");
  assert.equal(host.loads.get("a.json").signal.aborted, true, "A's fetch is cancelled by B");

  host.loads.get("b.json").resolve(bundleFor("B"));
  await settle();
  host.mounts.get("B").resolve(controllerFor("B"));
  await runB;

  host.loads.get("a.json").resolve(bundleFor("A"));
  await runA;

  assert.equal(host.content, "viewer:B");
  assert.equal(host.controller.name, "B");
  assert.equal(host.mounts.has("A"), false, "a stale load never mounts");
  assert.equal(host.ready.length, 1);
  assert.equal(host.errors.length, 0);
});

test("a stale mount that resolves after a newer reload is disposed", async () => {
  const { host, loadBundle, controllerFor } = makeHost();
  const owner = createReloadOwner();

  const runA = startReload(host, loadBundle, owner, "a.json");
  host.loads.get("a.json").resolve(bundleFor("A"));
  await settle();
  assert.equal(host.log.at(-1), "mount:A");

  const runB = startReload(host, loadBundle, owner, "b.json");
  host.loads.get("b.json").resolve(bundleFor("B"));
  await settle();

  // A finishes mounting after B has already replaced the shell.
  const controllerA = controllerFor("A");
  host.mounts.get("A").resolve(controllerA);
  await runA;
  assert.equal(controllerA.disposed, true);
  assert.equal(host.controller, null);
  assert.equal(host.content, "shell");

  host.mounts.get("B").resolve(controllerFor("B"));
  await runB;

  assert.equal(host.content, "viewer:B");
  assert.equal(host.controller.name, "B");
  assert.equal(host.controller.disposed, false);
  assert.equal(host.ready.length, 1);
  assert.deepEqual(host.log.filter((entry) => entry.startsWith("publish:")), ["publish:B"]);
});

test("a stale mount that resolves before the newer one leaves the newer viewer live", async () => {
  const { host, loadBundle, controllerFor } = makeHost();
  const owner = createReloadOwner();

  const runA = startReload(host, loadBundle, owner, "a.json");
  host.loads.get("a.json").resolve(bundleFor("A"));
  await settle();
  const runB = startReload(host, loadBundle, owner, "b.json");
  host.loads.get("b.json").resolve(bundleFor("B"));
  await settle();

  // B is still mounting when A resolves; then B completes.
  const controllerA = controllerFor("A");
  host.mounts.get("A").resolve(controllerA);
  await runA;
  host.mounts.get("B").resolve(controllerFor("B"));
  await runB;

  assert.equal(controllerA.disposed, true);
  assert.equal(host.controller.name, "B");
  assert.equal(host.controller.disposed, false);
  assert.equal(host.ready.length, 1);
});

test("a stale load failure does not replace the newer viewer with error UI", async () => {
  const { host, loadBundle, controllerFor } = makeHost();
  const owner = createReloadOwner();

  const runA = startReload(host, loadBundle, owner, "a.json");
  const runB = startReload(host, loadBundle, owner, "b.json");
  host.loads.get("b.json").resolve(bundleFor("B"));
  await settle();
  host.mounts.get("B").resolve(controllerFor("B"));
  await runB;

  host.loads.get("a.json").reject(new Error("aborted"));
  await runA;

  assert.equal(host.content, "viewer:B");
  assert.equal(host.errors.length, 0);
});

test("the current attempt still reports a load failure", async () => {
  const { host, loadBundle } = makeHost();
  const owner = createReloadOwner();

  const run = startReload(host, loadBundle, owner, "a.json");
  host.loads.get("a.json").reject(new Error("boom"));
  await run;

  assert.equal(host.content, "error:boom");
  assert.equal(host.errors.length, 1);
  assert.equal(host.ready.length, 0);
});

test("disconnecting during load emits no late ready or error event", async () => {
  const { host, loadBundle } = makeHost();
  const owner = createReloadOwner();

  const run = startReload(host, loadBundle, owner, "a.json");
  host.isConnected = false;
  owner.cancel();
  assert.equal(host.loads.get("a.json").signal.aborted, true);

  host.loads.get("a.json").resolve(bundleFor("A"));
  await run;

  assert.equal(host.mounts.has("A"), false);
  assert.equal(host.controller, null);
  assert.equal(host.ready.length, 0);
  assert.equal(host.errors.length, 0);
});

test("disconnecting during mount disposes the late controller silently", async () => {
  const { host, loadBundle, controllerFor } = makeHost();
  const owner = createReloadOwner();

  const run = startReload(host, loadBundle, owner, "a.json");
  host.loads.get("a.json").resolve(bundleFor("A"));
  await settle();
  assert.equal(host.log.at(-1), "mount:A");

  host.isConnected = false;
  owner.cancel();
  const controllerA = controllerFor("A");
  host.mounts.get("A").resolve(controllerA);
  await run;

  assert.equal(controllerA.disposed, true);
  assert.equal(host.controller, null);
  assert.equal(host.ready.length, 0);
  assert.equal(host.errors.length, 0);
});

test("a disconnected host that is no longer current suppresses mount errors", async () => {
  const { host, loadBundle } = makeHost();
  const owner = createReloadOwner();

  const run = startReload(host, loadBundle, owner, "a.json");
  host.loads.get("a.json").resolve(bundleFor("A"));
  await settle();
  host.isConnected = false;
  owner.cancel();
  host.mounts.get("A").reject(new Error("shell missing"));
  await run;

  assert.equal(host.errors.length, 0);
  assert.equal(host.content, "shell");
});

test("a successful current reload publishes once with performance timings", async () => {
  const { host, loadBundle, controllerFor } = makeHost();
  const owner = createReloadOwner();

  const run = startReload(host, loadBundle, owner, "a.json");
  host.loads.get("a.json").resolve(bundleFor("A"));
  await settle();
  const controller = controllerFor("A");
  controller.performance = { first_frame_ms: 12 };
  host.mounts.get("A").resolve(controller);
  await run;

  assert.equal(host.controller, controller);
  assert.equal(host.ready.length, 1);
  const detail = host.ready[0];
  assert.equal(detail.schema, "prism.semantic_viewer_performance.a0");
  assert.equal(detail.milestone, "board-visible");
  assert.equal(detail.readiness_stage, "semantic-ready");
  assert.equal(detail.readiness_progress, 100);
  assert.equal(detail.timings.first_frame_ms, 12);
  assert.ok("bundle_group_total_ms" in detail.timings);
  assert.ok("mount_and_first_frame_ms" in detail.timings);
  assert.ok("reload_to_visible_ms" in detail.timings);
  assert.deepEqual(host.log, ["render:loading", "load:a.json", "render:shell", "mount:A", "publish:A", "emit:ready"]);
});
