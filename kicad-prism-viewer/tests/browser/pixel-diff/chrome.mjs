// Headless Chrome over the DevTools protocol, with no dependencies (Node 22's
// WebSocket). Only what the pixel-diff runner needs: isolated pages, evaluate,
// viewport, and an in-flight request count.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// `unthrottled` lifts the frame-rate cap, so frame intervals measure throughput.
export async function launchChrome({ executable = process.env.CHROME || DEFAULT_CHROME, headless = true, unthrottled = false } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "vt-pixel-diff-"));
  const args = [
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
    "--enable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--hide-scrollbars",
    "about:blank",
  ];
  if (headless) args.unshift("--headless=new");
  if (unthrottled) args.unshift("--disable-gpu-vsync", "--disable-frame-rate-limit");
  const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buffered = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not print a DevTools URL within 20 s")), 20000);
    child.stderr.on("data", (chunk) => {
      buffered += chunk;
      const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited (${code}) before DevTools was ready`)));
  });
  const connection = await Connection.open(wsUrl);
  return {
    connection,
    newPage: (options) => Page.create(connection, options),
    async close() {
      try { await connection.send("Browser.close"); } catch { /* already gone */ }
      connection.close();
      await new Promise((resolve) => (child.exitCode === null ? child.once("exit", resolve) : resolve()));
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

class Connection {
  static open(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new Connection(socket)));
      socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)));
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket.close();
  }
}

// One page in its own browser context, so storage (OPFS asset cache, IndexedDB)
// starts empty and every load comes from the network.
class Page {
  static async create(connection, { width = 1280, height = 800, deviceScaleFactor = 1 } = {}) {
    const { browserContextId } = await connection.send("Target.createBrowserContext", { disposeOnDetach: true });
    const { targetId } = await connection.send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(connection, { browserContextId, targetId, sessionId });
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });
    return page;
  }

  constructor(connection, ids) {
    Object.assign(this, ids);
    this.connection = connection;
    this.inflight = new Set();
    this.lastNetworkAt = Date.now();
    this.errors = [];
    this.listener = (message) => {
      if (message.sessionId !== this.sessionId) return;
      const { method, params } = message;
      if (method === "Network.requestWillBeSent") {
        this.inflight.add(params.requestId);
        this.lastNetworkAt = Date.now();
      } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        this.inflight.delete(params.requestId);
        this.lastNetworkAt = Date.now();
        if (method === "Network.loadingFailed" && !params.canceled) this.errors.push(`request failed: ${params.errorText}`);
      } else if (method === "Runtime.exceptionThrown") {
        this.errors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text);
      } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
        this.errors.push(params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
      }
    };
    connection.listeners.add(this.listener);
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async goto(url) {
    const loaded = new Promise((resolve) => {
      const onLoad = (message) => {
        if (message.sessionId === this.sessionId && message.method === "Page.loadEventFired") {
          this.connection.listeners.delete(onLoad);
          resolve();
        }
      };
      this.connection.listeners.add(onLoad);
    });
    await this.send("Page.navigate", { url });
    await loaded;
  }

  // Evaluate an expression (awaiting a promise) and return its JSON value.
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text);
    }
    return result.result.value;
  }

  // True once no request has been in flight for `quietMs`.
  networkIdle(quietMs) {
    return this.inflight.size === 0 && Date.now() - this.lastNetworkAt >= quietMs;
  }

  async close() {
    this.connection.listeners.delete(this.listener);
    await this.connection.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
    await this.connection.send("Target.disposeBrowserContext", { browserContextId: this.browserContextId }).catch(() => {});
  }
}
