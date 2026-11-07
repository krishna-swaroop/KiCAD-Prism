// Browser cache for 3D bundle assets (System Builder SB2-26).
//
// Bundle files live under /api/projects/{project}/webgpu-3d/assets/{source}/{build}/…,
// where source and build are content fingerprints: a file at that path never
// changes once the bundle is final. The cache stores those files in the origin
// private file system (OPFS) so a warm reload, or a second copy of a board in a
// system scene, makes no network calls. A manifest records each file's size and
// last use; entries unused for 30 days are pruned, and a size cap evicts the
// least recently used. Without OPFS writes (Safari before createWritable) every
// call falls through to the network, as before.

const ASSET_PATH = /\/api\/projects\/([^/]+)\/webgpu-3d\/assets\/([^/]+)\/([^/]+)\/(.+)$/;
const DIRECTORY = "prism-bundle-cache-a0";
/** The OPFS directory the cache keeps its files in (workers write into it too; see `adopt`). */
export const ASSET_CACHE_DIRECTORY = DIRECTORY;
const MANIFEST = "manifest.json";
const MANIFEST_SCHEMA = "prism.bundle_cache_manifest.a0";
/** The Web Lock that serialises merge-then-write between tabs. */
const MANIFEST_LOCK = "prism-asset-cache";
/** An unlisted file younger than this may be another tab's write not yet read; leave it. */
export const CACHE_UNLISTED_GRACE_MS = 10 * 60 * 1000;
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * The cache key of a bundle asset URL, or null for anything else. The key names
 * the bundle (project, source and build fingerprints) and the file; the
 * `viewer` query parameter, the host's cache-busting key, is part of it.
 */
export function assetCacheKey(url) {
  let parsed;
  try {
    parsed = new URL(url, "http://cache.invalid/");
  } catch {
    return null;
  }
  const match = ASSET_PATH.exec(parsed.pathname);
  if (!match) return null;
  const [, project, source, build, path] = match.map(decodeURIComponent);
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  const viewer = parsed.searchParams.get("viewer") || "";
  return `${project}/${source}/${build}/${path}${viewer ? `?viewer=${viewer}` : ""}`;
}

/** An OPFS file name for a key: no separators, never "." or "..". */
export function fileNameFor(key) {
  return `a_${encodeURIComponent(key)}`;
}

/** The cache key an OPFS file name stands for, or null when it is not one. */
function keyForFileName(name) {
  if (!name.startsWith("a_")) return null;
  try {
    return decodeURIComponent(name.slice(2));
  } catch {
    return null;
  }
}

/**
 * Which entries to delete: those unused for `maxAgeMs`, then the least recently
 * used until the rest fit in `maxBytes`. `entries` maps key → { bytes, lastUsed }.
 */
export function planPrune(entries, now, { maxAgeMs = CACHE_MAX_AGE_MS, maxBytes = CACHE_MAX_BYTES } = {}) {
  const drop = new Set();
  const live = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!(now - Number(entry.lastUsed || 0) <= maxAgeMs)) drop.add(key);
    else live.push([key, entry]);
  }
  live.sort((a, b) => Number(b[1].lastUsed) - Number(a[1].lastUsed));
  let total = 0;
  for (const [key, entry] of live) {
    total += Number(entry.bytes || 0);
    if (total > maxBytes) drop.add(key);
  }
  return [...drop];
}

/**
 * Whether `removed` (key → removal time) makes `entry` stale: this tab deleted
 * the key and no writer has used it since. A newer entry supersedes the
 * removal, so a later download of the same key is kept.
 */
function tombstoned(removed, key, entry) {
  const removedAt = Number(removed?.[key] || 0);
  return removedAt > 0 && Number(entry?.lastUsed || 0) <= removedAt;
}

/**
 * Both tabs' view of the manifest: every key from either side, the more
 * recently used entry winning, except keys this tab removed (`removed`, key →
 * removedAt). A tab whose in-memory entries predate another tab's write still
 * keeps that write when it flushes, and a tab that pruned a key keeps it gone
 * when another tab's stale manifest still lists it.
 */
export function mergeEntries(local = {}, disk = {}, removed = {}) {
  const merged = {};
  for (const [key, entry] of Object.entries(disk)) {
    if (!tombstoned(removed, key, entry)) merged[key] = entry;
  }
  for (const [key, entry] of Object.entries(local)) {
    if (tombstoned(removed, key, entry)) continue;
    if (Number(entry?.lastUsed || 0) >= Number(merged[key]?.lastUsed || 0)) merged[key] = entry;
  }
  return merged;
}

/**
 * Unlisted files to delete: those older than `graceMs`. A younger file may be
 * another tab's write (or a worker's) that this tab's manifest has not read
 * yet; the next prune removes it if it is still unlisted.
 */
export function planUnlisted(files, listed, now, graceMs = CACHE_UNLISTED_GRACE_MS) {
  return files
    .filter((file) => !listed.has(file.name) && !(now - Number(file.lastModified || 0) <= graceMs))
    .map((file) => file.name);
}

export class AssetCache {
  /** The page's cache, or a pass-through when OPFS writes are unavailable. */
  static open(options = {}) {
    if (!AssetCache.shared) AssetCache.shared = new AssetCache(options);
    return AssetCache.shared;
  }

  constructor({ maxAgeMs = CACHE_MAX_AGE_MS, maxBytes = CACHE_MAX_BYTES } = {}) {
    this.maxAgeMs = maxAgeMs;
    this.maxBytes = maxBytes;
    this.stats = { hits: 0, misses: 0, bypassed: 0, cachedBytes: 0, networkBytes: 0, writeErrors: 0 };
    /** Keys this tab removed (key → removedAt); the merge drops older disk entries for them. */
    this.removed = {};
    this.ready = this.init();
    this.flushTimer = null;
  }

  async init() {
    try {
      const storage = globalThis.navigator?.storage;
      if (!storage?.getDirectory) return null;
      const root = await storage.getDirectory();
      const directory = await root.getDirectoryHandle(DIRECTORY, { create: true });
      const probe = await directory.getFileHandle(MANIFEST, { create: true });
      if (typeof probe.createWritable !== "function") return null;
      this.directory = directory;
      this.entries = await this.#readManifest();
      await this.prune();
      globalThis.addEventListener?.("pagehide", () => void this.flush());
      return directory;
    } catch {
      return null;
    }
  }

  get enabled() {
    return Boolean(this.directory);
  }

  /** Bytes of a bundle asset: from the cache, else the network (then cached when `store`). */
  async fetchBytes(url, { store = true, signal } = {}) {
    const key = assetCacheKey(url);
    await this.ready;
    if (key && this.directory) {
      const cached = await this.read(key);
      if (cached) {
        this.stats.hits += 1;
        this.stats.cachedBytes += cached.byteLength;
        return cached;
      }
      this.stats.misses += 1;
    } else {
      this.stats.bypassed += 1;
    }
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const expected = Number(response.headers.get("content-length") || 0);
    this.stats.networkBytes += bytes.byteLength;
    // Only a complete, successful download is stored (content-length checked when sent).
    if (store && key && this.directory && (!expected || expected === bytes.byteLength)) {
      void this.write(key, bytes);
    }
    return bytes;
  }

  async fetchJson(url, options = {}) {
    const bytes = await this.fetchBytes(url, options);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /** A cached value without touching the network, or null. */
  async peekJson(url) {
    const key = assetCacheKey(url);
    await this.ready;
    if (!key || !this.directory) return null;
    const bytes = await this.read(key);
    if (!bytes) return null;
    this.stats.hits += 1;
    this.stats.cachedBytes += bytes.byteLength;
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /** Store bytes already fetched (e.g. a bundle.json once it is known to be final). */
  async store(url, bytes) {
    const key = assetCacheKey(url);
    await this.ready;
    if (key && this.directory) await this.write(key, bytes);
  }

  async read(key) {
    const entry = this.entries[key];
    if (!entry) return null;
    try {
      const file = await (await this.directory.getFileHandle(fileNameFor(key))).getFile();
      if (file.size !== entry.bytes) return null;
      entry.lastUsed = Date.now();
      this.scheduleFlush();
      return await file.arrayBuffer();
    } catch {
      delete this.entries[key];
      return null;
    }
  }

  async write(key, bytes) {
    try {
      const handle = await this.directory.getFileHandle(fileNameFor(key), { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      // Listed only once the file is complete; a torn write is never read.
      this.entries[key] = { bytes: bytes.byteLength, lastUsed: Date.now() };
      this.scheduleFlush();
    } catch {
      this.stats.writeErrors += 1;
    }
  }

  /**
   * List `key` as cached: a worker wrote its file (`fileNameFor(key)` in
   * `ASSET_CACHE_DIRECTORY`, `bytes` long) and closed it. A file never
   * adopted is unlisted, and the next prune removes it.
   */
  adopt(key, bytes) {
    if (!this.directory) return;
    this.entries[key] = { bytes, lastUsed: Date.now() };
    this.scheduleFlush();
  }

  async prune(now = Date.now()) {
    if (!this.directory) return [];
    let drop = [];
    try {
      await this.#withLock(async () => {
        // Merge first: another tab's entries are candidates too, and its view
        // must survive the write that follows the deletions.
        this.entries = mergeEntries(this.entries, await this.#readManifest(), this.removed);
        drop = planPrune(this.entries, now, { maxAgeMs: this.maxAgeMs, maxBytes: this.maxBytes });
        for (const key of drop) {
          delete this.entries[key];
          this.removed[key] = now;
          await this.directory.removeEntry(fileNameFor(key)).catch(() => {});
        }
        // Files no manifest lists (another tab's torn write, an older manifest)
        // go too, once they have had the grace period to be listed by their
        // writer. Only unlisted names need their timestamp.
        const listed = new Set(Object.keys(this.entries).map(fileNameFor));
        const files = [];
        for await (const name of this.directory.keys()) {
          if (name === MANIFEST || listed.has(name)) continue;
          const file = await this.directory.getFileHandle(name).then((handle) => handle.getFile()).catch(() => null);
          files.push({ name, lastModified: file?.lastModified || 0 });
        }
        const unlisted = planUnlisted(files, listed, now);
        for (const name of unlisted) {
          const key = keyForFileName(name);
          if (key) this.removed[key] = now;
          await this.directory.removeEntry(name).catch(() => {});
        }
        // Deletions and the manifest are one atomic plan: a union merge would
        // otherwise put a pruned key back on the next flush.
        if (drop.length || unlisted.length) await this.#writeManifest(this.entries);
      });
    } catch {
      this.stats.writeErrors += 1;
    }
    return drop;
  }

  /** Remove everything (tests and a "clear cache" control). */
  async clear() {
    await this.ready;
    if (!this.directory) return;
    const now = Date.now();
    const known = Object.keys(this.entries || {});
    this.entries = {};
    try {
      await this.#withLock(async () => {
        for (const key of [...known, ...Object.keys(await this.#readManifest())]) this.removed[key] = now;
        for await (const name of this.directory.keys()) {
          if (name === MANIFEST) continue;
          const key = keyForFileName(name);
          if (key) this.removed[key] = now;
          await this.directory.removeEntry(name).catch(() => {});
        }
        await this.#writeManifest({});
      });
    } catch {
      this.stats.writeErrors += 1;
    }
  }

  summary() {
    const entries = Object.values(this.entries || {});
    return {
      enabled: this.enabled,
      files: entries.length,
      bytes: entries.reduce((sum, entry) => sum + Number(entry.bytes || 0), 0),
      ...this.stats,
    };
  }

  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 1000);
  }

  /** Run `apply` inside the cross-tab manifest lock when Web Locks are available. */
  #withLock(apply) {
    const locks = globalThis.navigator?.locks;
    if (typeof locks?.request !== "function") return apply();
    return locks.request(MANIFEST_LOCK, apply);
  }

  async #readManifest() {
    try {
      const handle = await this.directory.getFileHandle(MANIFEST, { create: true });
      const text = await (await handle.getFile()).text();
      return text ? JSON.parse(text).entries || {} : {};
    } catch {
      return {};
    }
  }

  async #writeManifest(entries) {
    const handle = await this.directory.getFileHandle(MANIFEST, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify({ schema: MANIFEST_SCHEMA, entries }));
    await writable.close();
  }

  async flush() {
    if (!this.directory) return;
    try {
      await this.#withLock(async () => {
        // Re-read first: another tab's entries must survive this write, keys
        // this tab removed must not, and the merged set becomes this tab's view
        // for its next prune.
        this.entries = mergeEntries(this.entries, await this.#readManifest(), this.removed);
        await this.#writeManifest(this.entries);
      });
    } catch {
      this.stats.writeErrors += 1;
    }
  }
}
