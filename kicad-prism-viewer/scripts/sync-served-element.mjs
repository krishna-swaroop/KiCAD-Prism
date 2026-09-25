import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "..");
const builtPath = path.join(packageRoot, "dist", "prism-semantic-viewer.js");
const servedPath = path.join(repositoryRoot, "frontend", "public", "prism-semantic-viewer.js");
const indexPath = path.join(repositoryRoot, "frontend", "index.html");

const bundle = await readFile(builtPath);
const digest = createHash("sha256").update(bundle).digest("hex");
const scriptPattern = /\/prism-semantic-viewer\.js\?v=[^"<]+/;

const exists = async (candidate) => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

const [servedExists, indexExists] = await Promise.all([
  exists(servedPath),
  exists(indexPath),
]);

if (servedExists !== indexExists) {
  throw new Error(
    `Incomplete frontend checkout: expected both ${servedPath} and ${indexPath}`,
  );
}

if (servedExists) {
  const index = await readFile(indexPath, "utf8");
  if (!scriptPattern.test(index)) {
    throw new Error(`Could not find the semantic viewer cache key in ${indexPath}`);
  }

  await writeFile(servedPath, bundle);
  await writeFile(
    indexPath,
    index.replace(scriptPattern, `/prism-semantic-viewer.js?v=${digest}`),
  );
  console.log(`Synchronized served semantic viewer sha256:${digest}`);
} else {
  console.log(`Built semantic viewer sha256:${digest}; frontend sync not available`);
}
