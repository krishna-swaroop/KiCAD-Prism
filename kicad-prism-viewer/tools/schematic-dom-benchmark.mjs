import fs from "node:fs";
import path from "node:path";

const DEFAULT_SAMPLES = [
  "samples/usb-pd-trigger-board",
  "samples/jtyu-obc-gltf",
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fileBytes(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function summarizeSample(sampleDir) {
  const manifestPath = path.join(sampleDir, "schematic-vector", "schematic.vector.manifest.json");
  const featuresPath = path.join(sampleDir, "schematic-vector", "features.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(featuresPath)) {
    throw new Error(`${sampleDir} does not contain schematic-vector assets`);
  }
  const manifest = readJson(manifestPath);
  const featurePayload = readJson(featuresPath);
  const featureById = new Map((featurePayload.features || []).map((feature) => [Number(feature.id || 0), feature]));
  const pageFeaturePayload = featurePayload.pages || featurePayload;
  const featuresForPage = (pageId) => {
    const items = pageFeaturePayload[pageId] || [];
    return items.map((item) => typeof item === "number" ? featureById.get(item) : item).filter(Boolean);
  };
  const pages = manifest.pages || [];
  const pageRows = pages.map((page) => {
    const svgPath = path.join(sampleDir, "schematic-vector", page.svg || page.thumbnail?.path || "");
    const features = featuresForPage(page.id);
    const netFeatures = features.filter((feature) => feature.netUid);
    return {
      id: page.id,
      name: page.name,
      svgBytes: fileBytes(svgPath),
      features: features.length,
      netFeatures: netFeatures.length,
      nets: new Set(netFeatures.map((feature) => feature.netUid)).size,
    };
  });
  const totals = pageRows.reduce((acc, row) => {
    acc.svgBytes += row.svgBytes;
    acc.features += row.features;
    acc.netFeatures += row.netFeatures;
    acc.nets += row.nets;
    return acc;
  }, { svgBytes: 0, features: 0, netFeatures: 0, nets: 0 });
  const heaviest = [...pageRows].sort((a, b) => b.svgBytes - a.svgBytes).slice(0, 5);
  return {
    sample: sampleDir,
    schema: manifest.schema,
    pages: pages.length,
    edges: (manifest.edges || []).length,
    totalSvgMb: totals.svgBytes / 1048576,
    totalFeatures: featurePayload.features?.length || totals.features,
    netFeatureCoverage: totals.features ? totals.netFeatures / totals.features : 0,
    maxSingleSvgMb: heaviest[0]?.svgBytes ? heaviest[0].svgBytes / 1048576 : 0,
    heaviest,
  };
}

function printSummary(summary) {
  console.log(`\n${summary.sample}`);
  console.log(`  schema: ${summary.schema}`);
  console.log(`  pages: ${summary.pages}`);
  console.log(`  hierarchy edges: ${summary.edges}`);
  console.log(`  total SVG: ${summary.totalSvgMb.toFixed(2)} MB`);
  console.log(`  max SVG page: ${summary.maxSingleSvgMb.toFixed(2)} MB`);
  console.log(`  features: ${summary.totalFeatures.toLocaleString()}`);
  console.log(`  net feature coverage: ${(summary.netFeatureCoverage * 100).toFixed(1)}%`);
  console.log("  heaviest pages:");
  for (const page of summary.heaviest) {
    console.log(`    ${page.id} ${page.name}: ${(page.svgBytes / 1048576).toFixed(2)} MB, ${page.features.toLocaleString()} features, ${page.nets} nets`);
  }
}

const samples = process.argv.slice(2);
for (const sample of samples.length ? samples : DEFAULT_SAMPLES) {
  printSummary(summarizeSample(sample));
}
