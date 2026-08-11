import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

test("writes tiled GLB with net and object feature IDs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  const metricsPath = path.join(root, "metrics.json");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "fixture",
      tileSizeMm: 20,
      layers: [{ id: 1, name: "F.Cu" }],
      nets: [{ id: 7, name: "VBUS", netClass: "Power" }],
      objectFeatures: [{ id: 11, sourceUid: "track-1", netId: 7 }],
      objects: [
        {
          layerId: 1,
          layerName: "F.Cu",
          zMm: 0.8,
          thicknessMm: 0.035,
          netId: 7,
          objectFeatureId: 11,
          polygons: [{ outer: [[0, 0], [25, 0], [25, 5], [0, 5]], holes: [] }],
        },
      ],
    }),
  );
  await run(process.execPath, [
    path.resolve("tools/semantic-gltf/build.mjs"),
    inputPath,
    outputDir,
  ]);
  const manifest = JSON.parse(
    await fs.readFile(path.join(outputDir, "scene.manifest.json"), "utf8"),
  );
  assert.equal(manifest.schema, "prism.semantic_gltf_a0");
  assert.equal(manifest.tiles.length, 2);
  assert.deepEqual(manifest.netToTiles["7"], ["1:0:0", "1:1:0"]);
  for (const tile of manifest.tiles) {
    const bytes = await fs.readFile(path.join(outputDir, tile.path));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF");
  }
});

test("writes single-tile polygons without requiring clipping", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-single-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  const metricsPath = path.join(root, "metrics.json");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "single-fixture",
      tileSizeMm: 20,
      meshoptLevel: "low",
      layers: [{ id: 2, name: "B.Cu" }],
      nets: [{ id: 3, name: "GND", netClass: "Power" }],
      objectFeatures: [{ id: 5, sourceUid: "zone-1", netId: 3 }],
      objects: [
        {
          layerId: 2,
          layerName: "B.Cu",
          zMm: -0.8,
          thicknessMm: 0.035,
          netId: 3,
          objectFeatureId: 5,
          polygons: [{ outer: [[1, 1], [10, 1], [10, 10], [1, 10]], holes: [] }],
        },
      ],
    }),
  );
  await run(process.execPath, [
    path.resolve("tools/semantic-gltf/build.mjs"),
    inputPath,
    outputDir,
  ], {
    PRISM_SEMANTIC_GLTF_WORKERS: "1",
    PRISM_SEMANTIC_GLTF_METRICS_PATH: metricsPath,
  });
  const manifest = JSON.parse(
    await fs.readFile(path.join(outputDir, "scene.manifest.json"), "utf8"),
  );
  assert.equal(manifest.tiles.length, 1);
  assert.equal(manifest.tiles[0].id, "2:0:0");
  assert.deepEqual(manifest.netToTiles["3"], ["2:0:0"]);
  const metrics = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.equal(metrics.schema, "prism.semantic_gltf_metrics_a0");
  assert.equal(metrics.context.backend, "js");
  assert.equal(metrics.geometry_stats.tile_count, 1);
  assert.ok(metrics.total_ms >= 0);
});

test("clipper2 mode consumes pre-clipped tile geometry", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-clipper2-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "clipper2-fixture",
      sourceGeometryRevision: "source-fixture",
      tileSizeMm: 20,
      meshoptLevel: "low",
      layers: [{ id: 1, name: "F.Cu" }],
      nets: [{ id: 9, name: "SIG", netClass: "Default" }],
      objectFeatures: [{ id: 13, sourceUid: "zone-1", netId: 9 }],
      objects: [
        {
          layerId: 1,
          layerName: "F.Cu",
          zMm: 0.1,
          thicknessMm: 0.035,
          netId: 9,
          objectFeatureId: 13,
          polygons: [
            {
              sourcePolygonRecordId: 101,
              outer: [[0, 0], [25, 0], [25, 5], [0, 5]],
              holes: [],
            },
          ],
        },
      ],
      clipperResponse: {
        schema: "prism.semantic_clipper_response_a1",
        protocolVersion: 1,
        sourceGeometryRevision: "source-fixture",
        tileSizeMm: 20,
        precisionDecimalPlaces: 6,
        native: { version: "2026.6.10", abi: 20260610, backend: "clipper2", protocol: "a2", batchSymbol: "prism_clipper2_batch_a2_bytes", libraryPath: "fixture", librarySha256: "fixture-sha" },
        clippedTiles: [
          {
            sourcePolygonRecordId: 101,
            tile: [0, 0],
            regions: [{ outer: [[0, 0], [20, 0], [20, 5], [0, 5]], holes: [] }],
          },
          {
            sourcePolygonRecordId: 101,
            tile: [1, 0],
            regions: [{ outer: [[20, 0], [25, 0], [25, 5], [20, 5]], holes: [] }],
          },
        ],
      },
    }),
  );
  await run(process.execPath, [
    path.resolve("tools/semantic-gltf/build.mjs"),
    inputPath,
    outputDir,
  ], {
    PRISM_SEMANTIC_CLIPPER: "clipper2",
    PRISM_SEMANTIC_GLTF_WORKERS: "1",
  });
  const manifest = JSON.parse(
    await fs.readFile(path.join(outputDir, "scene.manifest.json"), "utf8"),
  );
  assert.equal(manifest.clipper.backend, "clipper2");
  assert.equal(manifest.tiles.length, 2);
  assert.deepEqual(manifest.netToTiles["9"], ["1:0:0", "1:1:0"]);
});

test("clipper2 mode fails clearly without pre-clipped input", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-clipper2-missing-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "missing-clipper2-fixture",
      tileSizeMm: 20,
      layers: [{ id: 1, name: "F.Cu" }],
      objects: [],
    }),
  );
  await assert.rejects(
    run(process.execPath, [
      path.resolve("tools/semantic-gltf/build.mjs"),
      inputPath,
      outputDir,
    ], {
      PRISM_SEMANTIC_CLIPPER: "clipper2",
    }),
    /exited with 1/,
  );
});

test("verify mode compares pre-clipped geometry with JS clipping", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-verify-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "verify-fixture",
      tileSizeMm: 20,
      meshoptLevel: "low",
      layers: [{ id: 1, name: "F.Cu" }],
      nets: [{ id: 2, name: "N", netClass: "Default" }],
      objectFeatures: [{ id: 3, sourceUid: "rect", netId: 2 }],
      objects: [
        {
          layerId: 1,
          layerName: "F.Cu",
          zMm: 0,
          thicknessMm: 0.035,
          netId: 2,
          objectFeatureId: 3,
          polygons: [
            {
              sourcePolygonRecordId: "rect-1",
              outer: [[0, 0], [25, 0], [25, 5], [0, 5]],
              holes: [],
            },
          ],
        },
      ],
      clipperResponse: {
        schema: "prism.semantic_clipper_response_a1",
        protocolVersion: 1,
        tileSizeMm: 20,
        precisionDecimalPlaces: 6,
        native: {
          version: "2026.7.8",
          abi: 20260708,
          backend: "clipper2",
          protocol: "a2",
          batchSymbol: "prism_clipper2_batch_a2_bytes",
          libraryPath: "fixture",
          librarySha256: "fixture-sha",
        },
        clippedTiles: [
          {
            sourcePolygonRecordId: "rect-1",
            tile: [0, 0],
            regions: [{ outer: [[0, 0], [20, 0], [20, 5], [0, 5]], holes: [] }],
          },
          {
            sourcePolygonRecordId: "rect-1",
            tile: [1, 0],
            regions: [{ outer: [[20, 0], [25, 0], [25, 5], [20, 5]], holes: [] }],
          },
        ],
      },
    }),
  );
  await run(process.execPath, [
    path.resolve("tools/semantic-gltf/build.mjs"),
    inputPath,
    outputDir,
  ], {
    PRISM_SEMANTIC_CLIPPER: "verify",
    PRISM_SEMANTIC_GLTF_WORKERS: "1",
  });
  const manifest = JSON.parse(
    await fs.readFile(path.join(outputDir, "scene.manifest.json"), "utf8"),
  );
  assert.equal(manifest.clipper.backend, "clipper2");
  assert.equal(manifest.tiles.length, 2);
});

test("verify mode uses JS-owned direct path for JTYU 4:7:2 single-tile fixture", async () => {
  const fixture = JSON.parse(
    await fs.readFile(path.resolve("tests/fixtures/semantic_clip_jtyu_tile_4_7_2.json"), "utf8"),
  );
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-jtyu-direct-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  const source = fixture.source;
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "jtyu-direct-fixture",
      sourceGeometryRevision: "jtyu-direct-source",
      tileSizeMm: 20,
      meshoptLevel: "low",
      layers: [{ id: source.layerId, name: source.layerName }],
      nets: [{ id: source.netId, name: "fixture-net", netClass: "" }],
      objectFeatures: [{ id: source.objectFeatureId, sourceUid: "fixture", netId: source.netId }],
      objects: [
        {
          layerId: source.layerId,
          layerName: source.layerName,
          zMm: 0,
          thicknessMm: 0.035,
          netId: source.netId,
          objectFeatureId: source.objectFeatureId,
          polygons: [source.polygon],
        },
      ],
      clipperResponse: {
        schema: "prism.semantic_clipper_response_a1",
        protocolVersion: 1,
        sourceGeometryRevision: "jtyu-direct-source",
        tileSizeMm: 20,
        precisionDecimalPlaces: 6,
        native: { version: "2026.7.8", abi: 20260708, backend: "clipper2", protocol: "a2", batchSymbol: "prism_clipper2_batch_a2_bytes", libraryPath: "fixture", librarySha256: "fixture-sha" },
        clippedTiles: [],
      },
    }),
  );
  await run(process.execPath, [
    path.resolve("tools/semantic-gltf/build.mjs"),
    inputPath,
    outputDir,
  ], {
    PRISM_SEMANTIC_CLIPPER: "verify",
    PRISM_SEMANTIC_GLTF_WORKERS: "1",
  });
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "scene.manifest.json"), "utf8"));
  assert.equal(manifest.tiles.length, 1);
  assert.equal(manifest.tiles[0].id, "4:7:2");
  assert.deepEqual(manifest.netToTiles[String(source.netId)], ["4:7:2"]);
});

test("clipper2 mode combines JS direct single-tile polygons with native multi-tile jobs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-direct-native-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  const input = {
    geometryRevision: "mixed-fixture",
    sourceGeometryRevision: "mixed-source",
    tileSizeMm: 20,
    meshoptLevel: "low",
    layers: [{ id: 1, name: "F.Cu" }],
    nets: [{ id: 3, name: "GND", netClass: "" }, { id: 4, name: "SIG", netClass: "" }],
    objectFeatures: [
      { id: 5, sourceUid: "single", netId: 3 },
      { id: 6, sourceUid: "multi", netId: 4 },
    ],
    objects: [
      {
        layerId: 1,
        layerName: "F.Cu",
        zMm: 0,
        thicknessMm: 0.035,
        netId: 3,
        objectFeatureId: 5,
        polygons: [
          {
            sourcePolygonRecordId: "single",
            sourceOrder: 1,
            outer: [[1, 1], [5, 1], [5, 5], [1, 5]],
            holes: [],
          },
        ],
      },
      {
        layerId: 1,
        layerName: "F.Cu",
        zMm: 0,
        thicknessMm: 0.035,
        netId: 4,
        objectFeatureId: 6,
        polygons: [
          {
            sourcePolygonRecordId: "multi",
            sourceOrder: 2,
            outer: [[0, 10], [25, 10], [25, 15], [0, 15]],
            holes: [],
          },
        ],
      },
    ],
    clipperResponse: {
      schema: "prism.semantic_clipper_response_a1",
      protocolVersion: 1,
      sourceGeometryRevision: "mixed-source",
      tileSizeMm: 20,
      precisionDecimalPlaces: 6,
      native: { version: "2026.7.8", abi: 20260708, backend: "clipper2", protocol: "a2", batchSymbol: "prism_clipper2_batch_a2_bytes", libraryPath: "fixture", librarySha256: "fixture-sha" },
      clippedTiles: [
        {
          jobId: "multi:0:0",
          sourcePolygonRecordId: "multi",
          sourceOrder: 2,
          tile: [0, 0],
          regions: [{ outer: [[0, 10], [20, 10], [20, 15], [0, 15]], holes: [] }],
        },
        {
          jobId: "multi:1:0",
          sourcePolygonRecordId: "multi",
          sourceOrder: 2,
          tile: [1, 0],
          regions: [{ outer: [[20, 10], [25, 10], [25, 15], [20, 15]], holes: [] }],
        },
      ],
    },
  };
  await fs.writeFile(inputPath, JSON.stringify(input));
  await run(process.execPath, [
    path.resolve("tools/semantic-gltf/build.mjs"),
    inputPath,
    outputDir,
  ], {
    PRISM_SEMANTIC_CLIPPER: "verify",
    PRISM_SEMANTIC_GLTF_WORKERS: "1",
  });
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "scene.manifest.json"), "utf8"));
  assert.equal(manifest.tiles.length, 2);
  assert.deepEqual(manifest.netToTiles["3"], ["1:0:0"]);
  assert.deepEqual(manifest.netToTiles["4"], ["1:0:0", "1:1:0"]);
});

test("clipper2 mode rejects native duplicate of JS-owned single-tile direct record", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-gltf-direct-duplicate-"));
  const inputPath = path.join(root, "input.json");
  const outputDir = path.join(root, "scene");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      geometryRevision: "duplicate-direct-fixture",
      sourceGeometryRevision: "duplicate-direct-source",
      tileSizeMm: 20,
      layers: [{ id: 1, name: "F.Cu" }],
      objects: [
        {
          layerId: 1,
          layerName: "F.Cu",
          zMm: 0,
          thicknessMm: 0.035,
          netId: 1,
          objectFeatureId: 2,
          polygons: [
            {
              sourcePolygonRecordId: "single",
              sourceOrder: 4,
              outer: [[1, 1], [5, 1], [5, 5], [1, 5]],
              holes: [],
            },
          ],
        },
      ],
      clipperResponse: {
        schema: "prism.semantic_clipper_response_a1",
        protocolVersion: 1,
        sourceGeometryRevision: "duplicate-direct-source",
        tileSizeMm: 20,
        precisionDecimalPlaces: 6,
        native: { version: "2026.7.8", abi: 20260708, backend: "clipper2", protocol: "a2", batchSymbol: "prism_clipper2_batch_a2_bytes", libraryPath: "fixture", librarySha256: "fixture-sha" },
        clippedTiles: [
          {
            jobId: "direct:single:0:0",
            sourcePolygonRecordId: "single",
            sourceOrder: 4,
            tile: [0, 0],
            regions: [{ outer: [[1, 1], [5, 1], [5, 5], [1, 5]], holes: [] }],
          },
        ],
      },
    }),
  );
  await assert.rejects(
    run(process.execPath, [
      path.resolve("tools/semantic-gltf/build.mjs"),
      inputPath,
      outputDir,
    ], {
      PRISM_SEMANTIC_CLIPPER: "clipper2",
      PRISM_SEMANTIC_GLTF_WORKERS: "1",
    }),
    /exited with 1/,
  );
});

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
