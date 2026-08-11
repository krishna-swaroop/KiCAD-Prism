import { WebIO } from "@gltf-transform/core";
import {
  EXTMeshFeatures,
  EXTMeshoptCompression,
  KHRMeshQuantization,
} from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const io = new WebIO()
  .registerExtensions([EXTMeshFeatures, EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

export async function loadGltf(url, options = {}) {
  await MeshoptDecoder.ready;
  const response = await fetch(url, { cache: options.fetchCache || "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const document = await io.readBinary(bytes);
  const primitives = [];
  const componentFeatures = options.componentFeatures || new Map();

  function visit(node, inheritedDesignator = "") {
    const designator = componentFeatures.has(node.getName()) ? node.getName() : inheritedDesignator;
    const mesh = node.getMesh();
    if (mesh) {
      const matrix = node.getWorldMatrix();
      for (const primitive of mesh.listPrimitives()) {
        const positionAccessor = primitive.getAttribute("POSITION");
        const normalAccessor = primitive.getAttribute("NORMAL");
        const netAccessor = primitive.getAttribute("_FEATURE_ID_0");
        const objectAccessor = primitive.getAttribute("_FEATURE_ID_1");
        const indices = primitive.getIndices()?.getArray();
        if (!positionAccessor || !indices) continue;
        const count = positionAccessor.getCount();
        const position = new Float32Array(count * 3);
        const normal = new Float32Array(count * 3);
        const netId = new Uint32Array(count);
        const objectFeatureId = new Uint32Array(count);
        const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        const value = [];
        const featureId = componentFeatures.get(designator)?.featureId || options.defaultFeatureId || 0;
        for (let index = 0; index < count; index += 1) {
          positionAccessor.getElement(index, value);
          transformPoint(position, index * 3, value, matrix);
          bounds[0] = Math.min(bounds[0], position[index * 3]);
          bounds[1] = Math.min(bounds[1], position[index * 3 + 1]);
          bounds[2] = Math.min(bounds[2], position[index * 3 + 2]);
          bounds[3] = Math.max(bounds[3], position[index * 3]);
          bounds[4] = Math.max(bounds[4], position[index * 3 + 1]);
          bounds[5] = Math.max(bounds[5], position[index * 3 + 2]);
          if (normalAccessor) {
            normalAccessor.getElement(index, value);
            transformNormal(normal, index * 3, value, matrix);
          } else {
            normal.set([0, 0, 1], index * 3);
          }
          netId[index] = Number(netAccessor?.getScalar(index) || 0);
          objectFeatureId[index] = objectAccessor
            ? Number(objectAccessor.getScalar(index) || 0)
            : Number(featureId);
        }
        const material = primitive.getMaterial();
        primitives.push({
          position,
          normal,
          netId,
          objectFeatureId,
          indices,
          designator,
          nodeName: node.getName(),
          meshName: mesh.getName(),
          bounds,
          material: material
            ? {
                name: material.getName(),
                baseColor: material.getBaseColorFactor(),
                metallic: material.getMetallicFactor(),
                roughness: material.getRoughnessFactor(),
                emissive: material.getEmissiveFactor(),
              }
            : { baseColor: options.baseColor || [0.55, 0.58, 0.64, 1], metallic: 0.05, roughness: 0.72, emissive: [0, 0, 0] },
        });
      }
    }
    for (const child of node.listChildren()) visit(child, designator);
  }

  for (const scene of document.getRoot().listScenes()) {
    for (const child of scene.listChildren()) visit(child);
  }
  return { byteLength: bytes.byteLength, primitives };
}

function transformPoint(output, offset, point, matrix) {
  const x = matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12];
  const y = matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13];
  const z = matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14];
  output[offset] = x;
  output[offset + 1] = -z;
  output[offset + 2] = y;
}

function transformNormal(output, offset, normal, matrix) {
  const x = matrix[0] * normal[0] + matrix[4] * normal[1] + matrix[8] * normal[2];
  const y = matrix[1] * normal[0] + matrix[5] * normal[1] + matrix[9] * normal[2];
  const z = matrix[2] * normal[0] + matrix[6] * normal[1] + matrix[10] * normal[2];
  const size = Math.hypot(x, y, z) || 1;
  output[offset] = x / size;
  output[offset + 1] = -z / size;
  output[offset + 2] = y / size;
}
