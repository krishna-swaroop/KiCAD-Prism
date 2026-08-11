import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "./svg-dom-schematic-renderer.js";

test("SVG DOM sanitizer URL policy blocks executable and remote refs", () => {
  assert.equal(__test__.isUnsafeUrl("javascript:alert(1)"), true);
  assert.equal(__test__.isUnsafeUrl("data:image/svg+xml;base64,PHN2Zy8+"), true);
  assert.equal(__test__.isUnsafeUrl("https://example.com/foo.svg"), true);
  assert.equal(__test__.isUnsafeUrl("#localGradient"), false);
  assert.equal(__test__.isUnsafeUrl("../images/logo.png"), false);
});

test("SVG DOM sanitizer rewrites local fragment references deterministically", () => {
  const idMap = new Map([
    ["grad-1", "prism-page-grad-1"],
    ["clip 2", "prism-page-clip-2"],
  ]);
  assert.equal(
    __test__.rewriteLocalRefs("fill:url(#grad-1);clip-path:url(#clip 2)", idMap),
    "fill:url(#prism-page-grad-1);clip-path:url(#prism-page-clip-2)",
  );
  assert.equal(__test__.rewriteLocalRefs("#grad-1", idMap), "#prism-page-grad-1");
});

test("SVG DOM fallback feature keys remain instance-scoped", () => {
  const page = { id: "p1", sheetInstancePath: "/root/sensor[2]" };
  const element = {
    dataset: { uuid: "uuid-123", primitive: "wire" },
    id: "wire-node",
    localName: "g",
  };
  assert.equal(
    __test__.stableFallbackKey(element, page),
    "/root/sensor[2]|uuid-123|0|wire|0",
  );
});

test("SVG DOM fallback feature keys distinguish repeated page object ids", () => {
  const element = {
    dataset: { objectId: "sym-42", role: "symbol" },
    id: "symbol-node",
    localName: "g",
  };
  assert.equal(
    __test__.stableFallbackKey(element, { id: "a", sheetInstancePath: "/root/a" }),
    "/root/a|sym-42|0|symbol|0",
  );
  assert.equal(
    __test__.stableFallbackKey(element, { id: "b", sheetInstancePath: "/root/b" }),
    "/root/b|sym-42|0|symbol|0",
  );
});

test("SVG DOM feature normalization preserves explicit stable keys", () => {
  const page = { id: "p1", sheetInstancePath: "/root" };
  const normalized = __test__.normalizeFeature(
    { id: 7, stableKey: "/root|abc|0|pin|0", sourceId: "abc", kind: "pin_body" },
    page,
  );
  assert.equal(normalized.id, 7);
  assert.equal(normalized.stableKey, "/root|abc|0|pin|0");
  assert.equal(normalized.sheetInstancePath, "/root");
});
