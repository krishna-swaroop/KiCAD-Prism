/**
 * Server state: reads of Prism data that a component shows and keeps fresh.
 *
 * Built on the transport in `lib/api.ts`. A read is named by a key; the module
 * owns everything a component used to hand-roll around it:
 *
 * - **fetch and abort.** The first observer of a key starts the read. When the
 *   last observer leaves, the request in flight is aborted.
 * - **retention.** A key's last data outlives its observers for a retention
 *   window (`retainMs`, five minutes by default). A later observer within the
 *   window sees that data at once, marked `stale`, while the key is read again
 *   (stale-while-revalidate across remounts). `forgetServerState` drops keys
 *   whose data must not be shown again (sign-out).
 * - **stale responses.** Only the newest request for a key may publish. A
 *   response that lost a race, or arrived after its observers left, is dropped.
 * - **stale-while-refresh.** A refresh keeps the last data on screen. A failed
 *   refresh keeps the data too and reports the error beside it. With
 *   `keepPrevious`, a key change keeps the previous key's data on screen
 *   (`placeholder`) until the new key's first response.
 * - **poll while visible.** An observer can ask for a poll. Polls never
 *   overlap; with `whileVisible` they skip while the tab is hidden and read
 *   once when it becomes visible again.
 * - **invalidate by key.** `invalidateServerState(prefix)` re-reads every
 *   observed key that starts with `prefix` (a write says what it changed).
 *
 * For a periodic side effect that is not a keyed read (a tick that updates
 * several things), `usePoll` gives the same non-overlapping poll; `pollUntil`
 * is the awaitable form for a handler that waits on a server-side job.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type ServerKey = readonly (string | number | boolean | null)[];

export interface ServerSnapshot<T> {
  /** The last successful response for this key, kept through refreshes. */
  data: T | undefined;
  /** The latest read failed; `data` (if any) is from an earlier read. */
  error: Error | null;
  /** A request for this key is in flight. */
  fetching: boolean;
  /**
   * `data` has not been confirmed since it was retained (no observer was
   * left), or the latest read failed.
   */
  stale: boolean;
}

export interface ServerReadOptions<T> {
  /** Re-read every `pollMs` while observed. Polls never overlap. */
  pollMs?: number;
  /** Skip polls while the document is hidden; read when it becomes visible. */
  whileVisible?: boolean;
  /** Called with every successful response, after it is published. */
  onData?: (data: T) => void;
  /** Called with every failed read (not an abort), after it is published. */
  onError?: (error: Error) => void;
  /**
   * How long the key's data is kept after its last observer leaves.
   * `Infinity` keeps it until `forgetServerState`; 0 forgets it at once.
   */
  retainMs?: number;
  /** On a key change, show the previous key's data until the new key has some (also if its read fails). */
  keepPrevious?: boolean;
}

export interface ServerRead<T> extends ServerSnapshot<T> {
  /** No data to show yet and no error: the first read is pending. */
  loading: boolean;
  /** `data` is the previous key's (`keepPrevious`), shown while this key loads. */
  placeholder: boolean;
  /** Read again now (aborting a request in flight). Resolves once published. */
  refresh: () => Promise<void>;
}

const IDLE: ServerSnapshot<never> = { data: undefined, error: null, fetching: false, stale: false };

const DEFAULT_RETAIN_MS = 5 * 60_000;

const isAbort = (error: unknown): boolean =>
  (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

function documentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

interface PollOptions {
  intervalMs: number;
  whileVisible?: boolean;
  /** Run the first tick now instead of after one interval. */
  immediate?: boolean;
}

/**
 * Run `tick` every `intervalMs` until the returned stop function is called.
 * A tick never starts while the previous one is in flight. With
 * `whileVisible`, hidden ticks are skipped and one runs when the document
 * becomes visible. `tick` gets a signal that aborts on stop.
 */
function startPoll(tick: (signal: AbortSignal) => Promise<void>, options: PollOptions): () => void {
  const controller = new AbortController();
  let inFlight = false;
  const run = async () => {
    if (inFlight || controller.signal.aborted) return;
    if (options.whileVisible && !documentVisible()) return;
    inFlight = true;
    try {
      await tick(controller.signal);
    } finally {
      inFlight = false;
    }
  };
  const timer = window.setInterval(() => void run(), options.intervalMs);
  if (options.immediate) void run();
  const onVisibility = () => {
    if (documentVisible()) void run();
  };
  if (options.whileVisible) document.addEventListener("visibilitychange", onVisibility);
  return () => {
    controller.abort();
    window.clearInterval(timer);
    if (options.whileVisible) document.removeEventListener("visibilitychange", onVisibility);
  };
}

interface Observer {
  load: (signal: AbortSignal) => Promise<unknown>;
  onData?: (data: unknown) => void;
  onError?: (error: Error) => void;
  stopPoll?: () => void;
}

interface Entry {
  key: ServerKey;
  snapshot: ServerSnapshot<unknown>;
  listeners: Set<() => void>;
  observers: Set<Observer>;
  controller: AbortController | null;
  pending: Promise<void> | null;
  /** Bumped by every request; only the newest may publish. */
  sequence: number;
  /** Keep the data this long after the last observer leaves. */
  retainMs: number;
  /** No observer is left; the data is kept for the retention window. */
  retained: boolean;
  retainTimer: ReturnType<typeof setTimeout> | undefined;
}

interface ForgetOptions {
  except?: ServerKey;
  unobservedOnly?: boolean;
}

function startsWith(key: ServerKey, prefix: ServerKey): boolean {
  return prefix.length <= key.length && prefix.every((part, index) => key[index] === part);
}

/** A store of keyed reads. The app uses one (`serverState`); tests make their own. */
export class ServerStateStore {
  private entries = new Map<string, Entry>();
  /** Hear every publish, for answers about many keys at once (`outdated`). */
  private watchers = new Set<() => void>();

  watch(listener: () => void): () => void {
    this.watchers.add(listener);
    return () => { this.watchers.delete(listener); };
  }

  /** How many observed keys under `prefix` show data from an earlier read because the latest one failed. */
  outdated(prefix: ServerKey): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      const { data, error, fetching } = entry.snapshot;
      if (entry.observers.size > 0 && data !== undefined && error && !fetching && startsWith(entry.key, prefix)) count += 1;
    }
    return count;
  }

  snapshot(id: string): ServerSnapshot<unknown> {
    return this.entries.get(id)?.snapshot ?? IDLE;
  }

  /**
   * Observe `key`: `listener` hears every change, `observer.load` reads it.
   * Starts the first read. Returns the function that stops observing.
   */
  observe(
    key: ServerKey,
    observer: Observer,
    listener: () => void,
    poll?: PollOptions,
    retainMs: number = DEFAULT_RETAIN_MS,
  ): () => void {
    const id = JSON.stringify(key);
    let entry = this.entries.get(id);
    if (!entry) {
      entry = {
        key,
        snapshot: IDLE,
        listeners: new Set(),
        observers: new Set(),
        controller: null,
        pending: null,
        sequence: 0,
        retainMs,
        retained: false,
        retainTimer: undefined,
      };
      this.entries.set(id, entry);
    }
    const current = entry;
    current.retainMs = Math.max(current.retainMs, retainMs);
    current.listeners.add(listener);
    current.observers.add(observer);
    if (poll) observer.stopPoll = startPoll(() => this.read(current, false), poll);
    if (current.retained) {
      // Back within the retention window: show the kept data and read again.
      current.retained = false;
      clearTimeout(current.retainTimer);
      current.retainTimer = undefined;
      current.snapshot = { ...current.snapshot, stale: true };
      void this.read(current, false);
    } else if (current.snapshot.data === undefined && current.snapshot.error === null && !current.pending) {
      void this.read(current, false);
    }
    return () => {
      current.listeners.delete(listener);
      current.observers.delete(observer);
      observer.stopPoll?.();
      // React unsubscribes and resubscribes in one commit when an option
      // changes; wait a microtask so that does not drop the entry and re-read.
      queueMicrotask(() => {
        if (current.observers.size > 0 || this.entries.get(id) !== current) return;
        // A key nobody shows is no longer out of date on screen.
        for (const watcher of [...this.watchers]) watcher();
        this.settle(current);
        if (current.snapshot.data === undefined || current.retainMs <= 0) {
          this.entries.delete(id);
          return;
        }
        current.retained = true;
        current.snapshot = { ...current.snapshot, fetching: false };
        if (Number.isFinite(current.retainMs)) {
          current.retainTimer = setTimeout(() => {
            if (current.retained && this.entries.get(id) === current) this.entries.delete(id);
          }, current.retainMs);
        }
      });
    };
  }

  /**
   * Drop every key under `prefix`: its data is never shown again and a
   * response in flight is discarded. An observed key starts over (no data, a
   * fresh read). `except` is left alone; `unobservedOnly` leaves every
   * observed key alone.
   */
  forget(prefix: ServerKey, { except, unobservedOnly = false }: ForgetOptions = {}): void {
    const kept = except ? JSON.stringify(except) : null;
    for (const [id, entry] of [...this.entries]) {
      if (id === kept || !startsWith(entry.key, prefix)) continue;
      if (unobservedOnly && entry.observers.size > 0) continue;
      this.settle(entry);
      clearTimeout(entry.retainTimer);
      if (entry.observers.size === 0) {
        this.entries.delete(id);
        continue;
      }
      this.publish(entry, IDLE);
      void this.read(entry, false);
    }
  }

  /** Abort the request in flight and stop any older one from publishing. */
  private settle(entry: Entry) {
    entry.controller?.abort();
    entry.sequence += 1;
    entry.controller = null;
    entry.pending = null;
  }

  /** Read `id` again, aborting a request in flight. No-op when unobserved. */
  refresh(id: string): Promise<void> {
    const entry = this.entries.get(id);
    return entry && entry.observers.size > 0 ? this.read(entry, true) : Promise.resolve();
  }

  /** Re-read every observed key that starts with `prefix`. */
  invalidate(prefix: ServerKey): Promise<void> {
    const reads: Promise<void>[] = [];
    for (const entry of this.entries.values()) {
      if (entry.observers.size > 0 && startsWith(entry.key, prefix)) reads.push(this.read(entry, true));
    }
    return Promise.all(reads).then(() => undefined);
  }

  private publish(entry: Entry, snapshot: ServerSnapshot<unknown>) {
    entry.snapshot = snapshot;
    for (const listener of [...entry.listeners]) listener();
    for (const watcher of [...this.watchers]) watcher();
  }

  private read(entry: Entry, force: boolean): Promise<void> {
    if (entry.pending && !force) return entry.pending;
    const [observer] = entry.observers;
    if (!observer) return Promise.resolve();
    entry.controller?.abort();
    const controller = new AbortController();
    const sequence = ++entry.sequence;
    entry.controller = controller;
    const owns = () => entry.sequence === sequence && !controller.signal.aborted;
    if (!entry.snapshot.fetching) this.publish(entry, { ...entry.snapshot, fetching: true });
    // A load that throws synchronously fails the read like a rejection.
    const pending = new Promise<unknown>((resolve) => resolve(observer.load(controller.signal)))
      .then(
        (data) => {
          if (!owns()) return;
          this.publish(entry, { data, error: null, fetching: false, stale: false });
          for (const each of [...entry.observers]) each.onData?.(data);
        },
        (error: unknown) => {
          if (!owns() || isAbort(error)) return;
          const failure = asError(error);
          this.publish(entry, {
            data: entry.snapshot.data,
            error: failure,
            fetching: false,
            stale: entry.snapshot.data !== undefined,
          });
          for (const each of [...entry.observers]) each.onError?.(failure);
        },
      )
      .finally(() => {
        if (entry.sequence === sequence) {
          entry.pending = null;
          entry.controller = null;
        }
      });
    entry.pending = pending;
    return pending;
  }
}

const serverState = new ServerStateStore();

/**
 * How many keys on screen under `prefix` show data whose latest re-read failed: what a screen marks as out of date. The
 * prefix is read once; a caller passes a constant.
 */
export function useOutdatedCount(prefix: ServerKey): number {
  const [watched] = useState(prefix);
  const subscribe = useCallback((listener: () => void) => serverState.watch(listener), []);
  return useSyncExternalStore(subscribe, () => serverState.outdated(watched), () => 0);
}

/** Re-read every observed key starting with `prefix`, e.g. after a write. */
export function invalidateServerState(prefix: ServerKey): Promise<void> {
  return serverState.invalidate(prefix);
}

/** Drop every key starting with `prefix`, e.g. on sign-out (see `ServerStateStore.forget`). */
export function forgetServerState(prefix: ServerKey, options?: ForgetOptions): void {
  serverState.forget(prefix, options);
}

/**
 * Read `key` with `load` and keep it fresh. `null` reads nothing. `load` and
 * `onData` may change on every render; the latest ones are used.
 */
export function useServerState<T>(
  key: ServerKey | null,
  load: (signal: AbortSignal) => Promise<T>,
  options: ServerReadOptions<T> = {},
  store: ServerStateStore = serverState,
): ServerRead<T> {
  const id = key ? JSON.stringify(key) : null;
  const loadRef = useRef(load);
  const onDataRef = useRef(options.onData);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    loadRef.current = load;
    onDataRef.current = options.onData;
    onErrorRef.current = options.onError;
  });
  const { pollMs, whileVisible, retainMs, keepPrevious } = options;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (id === null) return () => undefined;
      const observer: Observer = {
        load: (signal) => loadRef.current(signal),
        onData: (data) => onDataRef.current?.(data as T),
        onError: (error) => onErrorRef.current?.(error),
      };
      const poll = pollMs ? { intervalMs: pollMs, whileVisible } : undefined;
      return store.observe(JSON.parse(id) as ServerKey, observer, listener, poll, retainMs);
    },
    [id, pollMs, whileVisible, retainMs, store],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (id === null ? IDLE : store.snapshot(id)),
    () => IDLE,
  ) as ServerSnapshot<T>;
  const refresh = useCallback(() => (id === null ? Promise.resolve() : store.refresh(id)), [id, store]);

  // The last data shown, by key, so a key change can keep it on screen. Kept
  // in state and updated during render (React's "previous render" pattern).
  const [shown, setShown] = useState<{ id: string; data: T } | null>(null);
  if (keepPrevious && id !== null && snapshot.data !== undefined && (shown?.id !== id || shown.data !== snapshot.data)) {
    setShown({ id, data: snapshot.data });
  }
  const placeholder = Boolean(keepPrevious && id !== null && snapshot.data === undefined && shown && shown.id !== id);
  const data = placeholder ? shown?.data : snapshot.data;

  return {
    ...snapshot,
    data,
    placeholder,
    loading: id !== null && data === undefined && snapshot.error === null,
    refresh,
  };
}

/**
 * Run `tick` every `intervalMs` while `enabled`, never two at once, aborting
 * the one in flight on unmount. `onError` hears a failure once per outage:
 * repeats of the same message are skipped until a tick succeeds.
 */
export function usePoll(
  enabled: boolean,
  tick: (signal: AbortSignal) => Promise<void>,
  { intervalMs, onError }: { intervalMs: number; onError: (error: unknown) => void },
): void {
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => {
    if (!enabled) return;
    let lastFailure = "";
    return startPoll(
      async (signal) => {
        try {
          await tick(signal);
          lastFailure = "";
        } catch (error) {
          if (signal.aborted || isAbort(error)) return;
          const failure = error instanceof Error ? error.message : String(error);
          if (failure === lastFailure) return;
          lastFailure = failure;
          onErrorRef.current(error);
        }
      },
      { intervalMs },
    );
  }, [enabled, intervalMs, tick]);
}

/**
 * Run `tick` every `intervalMs`, never two at once, until it returns true
 * (resolves true) or has run `maxTicks` times (resolves false). A tick that
 * throws rejects with its error; `signal` aborts the wait. The first tick runs
 * at once unless `delayFirst`.
 */
export function pollUntil(
  tick: (signal: AbortSignal) => Promise<boolean>,
  {
    intervalMs,
    maxTicks = Infinity,
    delayFirst = false,
    signal,
  }: { intervalMs: number; maxTicks?: number; delayFirst?: boolean; signal?: AbortSignal },
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let ticks = 0;
    let settled = false;
    let stop = () => undefined as void;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      stop();
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    stop = startPoll(
      async (tickSignal) => {
        try {
          const done = await tick(tickSignal);
          ticks += 1;
          if (done) finish(() => resolve(true));
          else if (ticks >= maxTicks) finish(() => resolve(false));
        } catch (error) {
          finish(() => reject(error));
        }
      },
      { intervalMs, immediate: !delayFirst },
    );
  });
}
