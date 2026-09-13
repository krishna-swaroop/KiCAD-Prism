/**
 * Typed KiCad RPC bridge.
 *
 * Session-scoped instance: waiters are registered before send, keyed by
 * session plus message, and settled exactly once on reset, dispose, timeout,
 * or a matching response.
 */

const RPC_VERSION = 1;
const DEFAULT_RESPONSE_TIMEOUT_MS = 4000;

export type KiCadRpcFailureKind = "pre_dispatch" | "unknown_outcome" | "rpc";

export class KiCadRpcError extends Error {
  readonly kind: KiCadRpcFailureKind;

  constructor(kind: KiCadRpcFailureKind, message: string) {
    super(message);
    this.name = "KiCadRpcError";
    this.kind = kind;
  }
}

type Waiter = {
  resolve: (payload: KiCadResponse) => void;
  reject: (error: Error) => void;
  timer: number;
};

type SessionWaiter = {
  resolve: (sessionId: string) => void;
  reject: (error: Error) => void;
  timer: number | null;
  signal: AbortSignal | null;
  onAbort: (() => void) | null;
};

export interface KiCadResponse {
  version?: number;
  session_id?: string;
  message_id?: number;
  response_to?: number;
  command?: string;
  status?: string;
  error_message?: string;
  parameters?: Record<string, unknown>;
  data?: string;
}

type LogFn = (message: string) => void;

export type KiCadTransport = {
  post(payload: string): boolean;
};

export type BridgeClock = {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

export type WaitForSessionOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type KiCadBridgeOptions = {
  transport?: KiCadTransport;
  clock?: BridgeClock;
  log?: LogFn;
};

type KiClient = {
  postMessage?: (msg: unknown) => void;
  _msgBacklog?: unknown[];
};

let logCallback: LogFn = () => {};

export function setLogCallback(fn: LogFn) {
  logCallback = fn;
}

function defaultLog(message: string) {
  logCallback(message);
}

function postToKiCad(payload: string): boolean {
  const w = window as unknown as Record<string, unknown>;
  if (
    typeof w.webkit === "object" &&
    w.webkit !== null &&
    (w.webkit as Record<string, unknown>).messageHandlers
  ) {
    const handlers = (w.webkit as Record<string, Record<string, { postMessage: (p: string) => void }>>).messageHandlers;
    if (handlers.kicad) {
      handlers.kicad.postMessage(payload);
      return true;
    }
  }
  if (
    typeof w.chrome === "object" &&
    w.chrome !== null &&
    (w.chrome as Record<string, unknown>).webview
  ) {
    const webview = (w.chrome as Record<string, { postMessage: (p: string) => void }>).webview;
    if (webview?.postMessage) {
      webview.postMessage(payload);
      return true;
    }
  }
  if (typeof w.external === "object" && w.external !== null) {
    const ext = w.external as { invoke?: (p: string) => void };
    if (ext.invoke) {
      try {
        ext.invoke(payload);
        return true;
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

function waiterKey(sessionId: string, messageId: number): string {
  return `${sessionId}:${messageId}`;
}

function abortError(message = "Session wait cancelled"): Error {
  if (typeof DOMException === "function") {
    return new DOMException(message, "AbortError");
  }
  return Object.assign(new Error(message), { name: "AbortError" });
}

export class KiCadBridge {
  private readonly transport: KiCadTransport;
  private readonly clock: BridgeClock;
  private readonly log: LogFn;
  private readonly waiters = new Map<string, Waiter>();
  private readonly sessionWaiters = new Set<SessionWaiter>();
  private sessionId: string | null = null;
  private messageCounter = 0;
  private installed = false;
  private boundHandler: ((incoming: unknown) => void) | null = null;
  private previousPost: ((incoming: unknown) => void) | null = null;

  constructor(options: KiCadBridgeOptions = {}) {
    this.transport = options.transport ?? { post: postToKiCad };
    this.clock = options.clock ?? {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms) as unknown as number,
      clearTimeout: (id) => window.clearTimeout(id),
    };
    this.log = options.log ?? defaultLog;
  }

  hasSession(): boolean {
    return this.sessionId !== null;
  }

  handleIncoming(incoming: unknown) {
    let payload: KiCadResponse | null = null;
    if (typeof incoming === "string") {
      try {
        payload = JSON.parse(incoming) as KiCadResponse;
      } catch (err) {
        this.log(`Invalid KiCad response: ${(err as Error).message}`);
        return;
      }
    } else if (typeof incoming === "object" && incoming !== null) {
      payload = incoming as KiCadResponse;
    }

    if (!payload) return;

    if (payload.command === "NEW_SESSION" && payload.response_to === undefined) {
      this.resetSession(payload);
      return;
    }

    if (payload.response_to !== undefined) {
      this.settleResponse(payload);
      return;
    }

    this.log(`KiCad -> ${JSON.stringify(payload)}`);
  }

  async send(
    command: string,
    parameters: Record<string, unknown> = {},
    data = "",
    timeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
  ): Promise<KiCadResponse> {
    if (!this.sessionId) {
      throw new KiCadRpcError("pre_dispatch", "Session has not been established yet.");
    }
    const sessionId = this.sessionId;
    const messageId = ++this.messageCounter;
    const envelope = {
      version: RPC_VERSION,
      session_id: sessionId,
      message_id: messageId,
      command,
      parameters: structuredClone(parameters),
      data,
    };
    const pending = this.registerWaiter(sessionId, messageId, timeoutMs);
    try {
      if (!this.transport.post(JSON.stringify(envelope))) {
        this.rejectWaiter(
          waiterKey(sessionId, messageId),
          new KiCadRpcError("pre_dispatch", "KiCad transport is unavailable."),
        );
      }
    } catch (error) {
      const wrapped = error instanceof KiCadRpcError
        ? error
        : new KiCadRpcError("unknown_outcome", (error as Error).message);
      this.rejectWaiter(waiterKey(sessionId, messageId), wrapped);
    }
    return pending;
  }

  waitForSession(options: WaitForSessionOptions = {}): Promise<string> {
    if (this.sessionId) {
      return Promise.resolve(this.sessionId);
    }
    if (options.signal?.aborted) {
      return Promise.reject(abortError());
    }

    return new Promise((resolve, reject) => {
      const waiter: SessionWaiter = {
        resolve,
        reject,
        timer: null,
        signal: options.signal ?? null,
        onAbort: null,
      };
      waiter.onAbort = () => this.finishSessionWaiter(waiter, () => reject(abortError()));
      if (waiter.signal) {
        waiter.signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      if (options.timeoutMs != null) {
        waiter.timer = this.clock.setTimeout(() => {
          this.finishSessionWaiter(waiter, () => reject(new Error("Session timeout")));
        }, options.timeoutMs);
      }
      this.sessionWaiters.add(waiter);
    });
  }

  install() {
    if (this.installed) return;
    const w = window as unknown as { kiclient?: KiClient };
    const existing: KiClient = w.kiclient || {};
    this.previousPost = typeof existing.postMessage === "function" ? existing.postMessage : null;
    this.boundHandler = (incoming: unknown) => this.handleIncoming(incoming);
    existing.postMessage = this.boundHandler;
    w.kiclient = existing;
    this.installed = true;

    const backlog = Array.isArray(existing._msgBacklog) ? existing._msgBacklog.splice(0) : [];
    for (const msg of backlog) {
      this.boundHandler(msg);
    }
  }

  uninstall() {
    if (!this.installed) return;
    const w = window as unknown as { kiclient?: KiClient };
    const existing = w.kiclient;
    if (existing && existing.postMessage === this.boundHandler) {
      if (this.previousPost) {
        existing.postMessage = this.previousPost;
      } else {
        delete existing.postMessage;
      }
    }
    this.installed = false;
    this.boundHandler = null;
    this.previousPost = null;
  }

  dispose() {
    this.rejectPending(new KiCadRpcError("unknown_outcome", "Bridge disposed"));
    this.rejectSessionWaiters(new Error("Bridge disposed"));
    this.uninstall();
    this.sessionId = null;
    this.messageCounter = 0;
  }

  private resetSession(request: KiCadResponse) {
    this.rejectPending(new KiCadRpcError("unknown_outcome", "Session reset"));
    this.sessionId = request.session_id ?? null;
    this.messageCounter = request.message_id ?? 0;
    if (this.sessionId) {
      this.log(`Session established: ${this.sessionId}`);
      this.resolveSessionWaiters(this.sessionId);
      this.sendNewSessionResponse(request);
    }
  }

  private sendNewSessionResponse(request: KiCadResponse) {
    if (!this.sessionId) return;
    const envelope = {
      version: RPC_VERSION,
      session_id: this.sessionId,
      message_id: ++this.messageCounter,
      response_to: request.message_id,
      command: "NEW_SESSION",
      status: "OK",
      parameters: {
        server_name: "KiCAD Prism Remote Provider",
        server_version: "0.1.0",
      },
    };
    this.transport.post(JSON.stringify(envelope));
  }

  private registerWaiter(sessionId: string, messageId: number, timeoutMs: number): Promise<KiCadResponse> {
    const key = waiterKey(sessionId, messageId);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: this.clock.setTimeout(() => {
          this.rejectWaiter(key, new KiCadRpcError("unknown_outcome", "Response timeout"));
        }, timeoutMs),
      };
      this.waiters.set(key, waiter);
    });
  }

  private settleResponse(payload: KiCadResponse) {
    const responseSession = payload.session_id ?? this.sessionId;
    if (!this.sessionId || !responseSession || responseSession !== this.sessionId) {
      this.log(`Ignoring stale KiCad response for session ${payload.session_id ?? "?"}`);
      return;
    }
    const key = waiterKey(responseSession, payload.response_to as number);
    const waiter = this.takeWaiter(key);
    if (!waiter) return;
    if (payload.status === "ERROR") {
      waiter.reject(new KiCadRpcError("rpc", payload.error_message || "KiCad RPC failed"));
      return;
    }
    waiter.resolve(payload);
  }

  private takeWaiter(key: string): Waiter | null {
    const waiter = this.waiters.get(key);
    if (!waiter) return null;
    this.waiters.delete(key);
    this.clock.clearTimeout(waiter.timer);
    return waiter;
  }

  private rejectWaiter(key: string, error: Error) {
    const waiter = this.takeWaiter(key);
    waiter?.reject(error);
  }

  private rejectPending(error: Error) {
    for (const key of [...this.waiters.keys()]) {
      this.rejectWaiter(key, error);
    }
  }

  private resolveSessionWaiters(sessionId: string) {
    for (const waiter of [...this.sessionWaiters]) {
      this.finishSessionWaiter(waiter, () => waiter.resolve(sessionId));
    }
  }

  private rejectSessionWaiters(error: Error) {
    for (const waiter of [...this.sessionWaiters]) {
      this.finishSessionWaiter(waiter, () => waiter.reject(error));
    }
  }

  private finishSessionWaiter(waiter: SessionWaiter, action: () => void) {
    if (!this.sessionWaiters.delete(waiter)) return;
    if (waiter.timer != null) this.clock.clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
    waiter.onAbort = null;
    action();
  }
}

let defaultBridge: KiCadBridge | null = null;

function getDefaultBridge(): KiCadBridge {
  if (!defaultBridge) {
    defaultBridge = new KiCadBridge();
  }
  return defaultBridge;
}

export function createKiCadBridge(options?: KiCadBridgeOptions): KiCadBridge {
  return new KiCadBridge(options);
}

export function hasSession(): boolean {
  return getDefaultBridge().hasSession();
}

export function sendRpcCommand(
  command: string,
  parameters: Record<string, unknown> = {},
  data = "",
): Promise<KiCadResponse> {
  return getDefaultBridge().send(command, parameters, data);
}

export function installBridge() {
  getDefaultBridge().install();
}

export function uninstallBridge() {
  getDefaultBridge().uninstall();
}

export async function waitForSession(options?: WaitForSessionOptions): Promise<string> {
  return getDefaultBridge().waitForSession(options);
}

export async function getSourceInfo(): Promise<KiCadResponse> {
  return sendRpcCommand("GET_SOURCE_INFO");
}

export async function triggerRemoteLogin(): Promise<KiCadResponse> {
  return sendRpcCommand("REMOTE_LOGIN", { interactive: true });
}
