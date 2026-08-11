import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "./escape-html.js";

test("escapes imported layer names before they are rendered as HTML", () => {
  assert.equal(
    escapeHtml(`F.Cu <img src=x onerror=alert(1)> & \"quoted\" 'single'`),
    "F.Cu &lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot; &#39;single&#39;",
  );
});

test("normalizes nullish display values without exposing them as markup", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
