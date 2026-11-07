import assert from "node:assert/strict";
import test from "node:test";

import { AssetCache, CACHE_MAX_AGE_MS, CACHE_UNLISTED_GRACE_MS, assetCacheKey, fileNameFor, mergeEntries, planPrune, planUnlisted } from "./asset-cache.js";

const ASSET = "http://localhost:5191/api/projects/prj_0cf4/webgpu-3d/assets/c8c3abc7/kicad-build_3181d3fa";

test("only bundle assets have cache keys, named by bundle fingerprints and file", () => {
  assert.equal(assetCacheKey(`${ASSET}/tiles/f-cu/0_0.glb`), "prj_0cf4/c8c3abc7/kicad-build_3181d3fa/tiles/f-cu/0_0.glb");
  assert.equal(assetCacheKey(`${ASSET}/bundle.json?viewer=v7`), "prj_0cf4/c8c3abc7/kicad-build_3181d3fa/bundle.json?viewer=v7");
  assert.equal(assetCacheKey("/api/projects/prj_0cf4/webgpu-3d/assets/a/b/board.glb"), "prj_0cf4/a/b/board.glb");
  assert.equal(assetCacheKey("http://localhost/api/projects/prj_0cf4/webgpu-3d/status"), null);
  assert.equal(assetCacheKey("http://localhost/api/jobs/job_1/artifact"), null);
  assert.equal(assetCacheKey(`${ASSET}/../escape.glb`), null, "URL parsing resolves dot segments out of the asset path");
  assert.equal(assetCacheKey("not a url \u0000"), null);
});

test("file names are flat and safe", () => {
  const name = fileNameFor("prj_0cf4/c8c3/build/tiles/f-cu/0_0.glb?viewer=v7");
  assert.doesNotMatch(name, /[/\\]/);
  assert.notEqual(name, ".");
  assert.notEqual(name, "..");
});

test("pruning drops entries unused for 30 days, then the least recently used over the cap", () => {
  const now = 1_800_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  const entries = {
    stale: { bytes: 10, lastUsed: now - CACHE_MAX_AGE_MS - 1 },
    old: { bytes: 40, lastUsed: now - 20 * day },
    mid: { bytes: 40, lastUsed: now - 2 * day },
    fresh: { bytes: 40, lastUsed: now },
    undated: { bytes: 1 },
  };
  assert.deepEqual(planPrune(entries, now, { maxBytes: 1000 }).sort(), ["stale", "undated"]);
  assert.deepEqual(planPrune(entries, now, { maxBytes: 85 }).sort(), ["old", "stale", "undated"]);
  assert.deepEqual(planPrune({}, now), []);
});

test("the manifest merge keeps both tabs' entries, the most recently used entry winning", () => {
  const local = { a: { bytes: 1, lastUsed: 200 }, b: { bytes: 2, lastUsed: 50 } };
  const disk = { b: { bytes: 2, lastUsed: 100 }, c: { bytes: 3, lastUsed: 10 } };
  assert.deepEqual(mergeEntries(local, disk), {
    a: { bytes: 1, lastUsed: 200 },
    b: { bytes: 2, lastUsed: 100 },
    c: { bytes: 3, lastUsed: 10 },
  });
  assert.deepEqual(mergeEntries({}, disk), disk);
  assert.deepEqual(mergeEntries(local, {}), local);
  assert.deepEqual(
    mergeEntries({ a: { bytes: 1, lastUsed: 100 } }, { a: { bytes: 9, lastUsed: 100 } }),
    { a: { bytes: 1, lastUsed: 100 } },
    "a tie keeps this tab's entry",
  );
});

test("a key this tab pruned stays pruned when the disk manifest still lists it", () => {
  const removed = { pruned: 1_800_000_000_000 };
  const disk = { pruned: { bytes: 4, lastUsed: removed.pruned - 1 } };
  assert.deepEqual(mergeEntries({}, disk, removed), {});
  assert.deepEqual(
    mergeEntries({}, { pruned: { bytes: 4, lastUsed: removed.pruned } }, removed),
    {},
    "an entry used at the moment of removal is not newer than it",
  );
  assert.deepEqual(
    mergeEntries({}, { kept: { bytes: 2, lastUsed: removed.pruned - 1 } }, removed),
    { kept: { bytes: 2, lastUsed: removed.pruned - 1 } },
    "other keys are untouched",
  );
});

test("a disk entry newer than this tab's removal survives the tombstone", () => {
  const removed = { refetched: 1_800_000_000_000 };
  const disk = { refetched: { bytes: 4, lastUsed: removed.refetched + 1 } };
  assert.deepEqual(mergeEntries({}, disk, removed), disk);
  // A flush merges the same way, so the newer entry is written, not dropped.
  assert.deepEqual(mergeEntries({}, { refetched: { bytes: 9, lastUsed: removed.refetched + 2 } }, removed).refetched.bytes, 9);
});

test("prune spares unlisted files inside the grace period and removes older ones", () => {
  const now = 1_800_000_000_000;
  const minute = 60 * 1000;
  const listed = new Set(["a_kept"]);
  const files = [
    { name: "a_kept", lastModified: now - 60 * minute },
    { name: "a_fresh", lastModified: now - minute },
    { name: "a_old", lastModified: now - CACHE_UNLISTED_GRACE_MS - 1 },
    { name: "a_undated" },
  ];
  assert.deepEqual(planUnlisted(files, listed, now).sort(), ["a_old", "a_undated"]);
  assert.deepEqual(planUnlisted(files, listed, now, 0).sort(), ["a_fresh", "a_old", "a_undated"]);
});

test("without OPFS the cache passes through to the network", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ schema: "x" }), { status: 200 });
  };
  try {
    const cache = new AssetCache();
    assert.equal(await cache.ready, null);
    assert.equal(cache.enabled, false);
    assert.deepEqual(await cache.fetchJson(`${ASSET}/bundle.json`), { schema: "x" });
    assert.equal(await cache.peekJson(`${ASSET}/bundle.json`), null);
    assert.equal(calls, 1);
    assert.equal(cache.summary().misses + cache.summary().bypassed, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
