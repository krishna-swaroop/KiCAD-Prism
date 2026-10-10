// Headless driver for the 3D inset spike page. Usage: node run.mjs <out-prefix> [query]
import puppeteer from "/Users/Swaroop/Personal-Projects/KiCAD-Platform/.worktrees/ecad-viewer-insets/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const out = process.argv[2];
const query = process.argv[3] || "";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 740, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto(`http://127.0.0.1:8017/index.html${query}`);
const gpu = await page.evaluate(async () => Boolean(navigator.gpu && (await navigator.gpu.requestAdapter())));
console.log("webgpu adapter:", gpu);
await page.waitForFunction(() => window.readyFlag || window.viewerError, { timeout: 180000, polling: 500 });
console.log("error:", await page.evaluate(() => window.viewerError || null));
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => window.watchMain());
// Main view before any inset: wait for an idle redraw.
await new Promise((r) => setTimeout(r, 1500));
const before = await page.evaluate(async () => (window.mainHashes.length ? window.hashOf(window.mainHashes.length - 1) : null));
const drawn = await page.evaluate(() => {
  const r = window.drawInsets();
  return JSON.stringify(r);
});
console.log("draw:", drawn);
console.log("probe:", await page.evaluate(() => { const refs = document.getElementById("main").getComponentReferences(); return JSON.stringify({ n: refs.length, first: refs.slice(0, 8), ic1: document.getElementById("main").insetTarget("IC1", null), stats: document.getElementById("main").insetStats() }); }));
if (!JSON.parse(drawn).target) { await page.screenshot({ path: `${out}-fail.png` }); await browser.close(); process.exit(0); }
await new Promise((r) => setTimeout(r, 1500));
console.log("idle baseline ms:", await page.evaluate(() => window.benchIdle(20)));
for (const cull of [false, true, false, true]) console.log("bench:", JSON.stringify(await page.evaluate((c) => window.benchInsets(30, c), cull)));
await new Promise((r) => setTimeout(r, 1500));
// Main view after inset frames: next idle redraw.
const after = await page.evaluate(async () => (window.mainHashes.length ? window.hashOf(window.mainHashes.length - 1) : null));
console.log("main before:", JSON.stringify(before), "after:", JSON.stringify(after), "redraws:", await page.evaluate(() => window.mainHashes.length));
await page.evaluate(() => window.drawInsets());
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${out}.png` });
await browser.close();
