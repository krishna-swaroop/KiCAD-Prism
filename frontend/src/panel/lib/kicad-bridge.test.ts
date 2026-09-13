import { afterEach, describe, expect, it, vi } from "vitest";

import { createKiCadBridge, type KiCadBridge, type KiCadResponse } from "./kicad-bridge";

type Posted = Record<string, unknown>;

function trackingClock() {
  const live = new Set<number>();
  return {
    live,
    setTimeout(fn: () => void, ms: number) {
      const id = window.setTimeout(() => {
        live.delete(id);
        fn();
      }, ms) as unknown as number;
      live.add(id);
      return id;
    },
    clearTimeout(id: number) {
      live.delete(id);
      window.clearTimeout(id);
    },
  };
}

function openSession(instance: KiCadBridge, sessionId = "session-1", messageId = 1) {
  instance.handleIncoming({ command: "NEW_SESSION", session_id: sessionId, message_id: messageId });
}

describe("KiCadBridge", () => {
  const instances: KiCadBridge[] = [];

  function makeBridge(options: Parameters<typeof createKiCadBridge>[0] = {}): KiCadBridge {
    const instance = createKiCadBridge({ log: () => {}, ...options });
    instances.push(instance);
    return instance;
  }

  afterEach(() => {
    for (const instance of instances.splice(0)) {
      instance.dispose();
    }
    vi.useRealTimers();
    const w = window as unknown as { kiclient?: { postMessage?: unknown; _msgBacklog?: unknown[] } };
    delete w.kiclient;
  });

  it("resolves a command when the transport replies synchronously", async () => {
    const posted: Posted[] = [];
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: {
        post(payload) {
          const envelope = JSON.parse(payload) as Posted;
          posted.push(envelope);
          if (envelope.command !== "NEW_SESSION") {
            instance.handleIncoming({
              response_to: envelope.message_id,
              session_id: envelope.session_id,
              status: "OK",
              command: envelope.command,
            });
          }
          return true;
        },
      },
    });

    openSession(instance);
    await expect(instance.send("GET_SOURCE_INFO")).resolves.toMatchObject({
      command: "GET_SOURCE_INFO",
      status: "OK",
    });
    expect(posted.some((item) => item.command === "GET_SOURCE_INFO")).toBe(true);
    expect(clock.live.size).toBe(0);
  });

  it("rejects pending work on session reset and ignores a stale reply", async () => {
    const posted: Posted[] = [];
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: {
        post(payload) {
          posted.push(JSON.parse(payload) as Posted);
          return true;
        },
      },
    });
    openSession(instance, "session-a");
    const pending = instance.send("PLACE_COMPONENT");
    openSession(instance, "session-b", 10);
    await expect(pending).rejects.toThrow("Session reset");
    expect(clock.live.size).toBe(0);

    const next = instance.send("GET_SOURCE_INFO");
    const request = posted.find((item) => item.command === "GET_SOURCE_INFO");
    instance.handleIncoming({
      response_to: request?.message_id,
      session_id: "session-a",
      status: "OK",
      command: "GET_SOURCE_INFO",
    });
    expect(clock.live.size).toBe(1);
    instance.handleIncoming({
      response_to: request?.message_id,
      session_id: "session-b",
      status: "OK",
      command: "GET_SOURCE_INFO",
    });
    await expect(next).resolves.toMatchObject({ session_id: "session-b" });
    expect(clock.live.size).toBe(0);
  });

  it("rejects immediately when the transport is unavailable", async () => {
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: { post: () => false },
    });
    openSession(instance);
    await expect(instance.send("GET_SOURCE_INFO")).rejects.toThrow("KiCad transport is unavailable.");
    expect(clock.live.size).toBe(0);
  });

  it("rejects a throwing transport through the waiter without a second rejection", async () => {
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: {
        post(payload) {
          const envelope = JSON.parse(payload) as Posted;
          if (envelope.command === "NEW_SESSION") return true;
          throw new Error("boom");
        },
      },
    });
    openSession(instance);
    await expect(instance.send("GET_SOURCE_INFO")).rejects.toThrow("boom");
    expect(clock.live.size).toBe(0);
  });

  it("times out a missing reply once and ignores a late response", async () => {
    vi.useFakeTimers();
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: { post: () => true },
    });
    openSession(instance);
    const pending = instance.send("GET_SOURCE_INFO", {}, "", 4000);
    const timedOut = expect(pending).rejects.toThrow("Response timeout");
    await vi.advanceTimersByTimeAsync(4000);
    await timedOut;
    expect(clock.live.size).toBe(0);

    instance.handleIncoming({
      response_to: 3,
      session_id: "session-1",
      status: "OK",
      command: "GET_SOURCE_INFO",
    });
    expect(clock.live.size).toBe(0);
  });

  it("honors a longer per-call timeout instead of the 4s default", async () => {
    vi.useFakeTimers();
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: { post: () => true },
    });
    openSession(instance);
    const pending = instance.send("PLACE_COMPONENT", {}, "", 30_000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(clock.live.size).toBe(1);
    const timedOut = expect(pending).rejects.toThrow("Response timeout");
    await vi.advanceTimersByTimeAsync(26_000);
    await timedOut;
    expect(clock.live.size).toBe(0);
  });

  it("installs once and drains the backlog without chaining handlers", () => {
    const replies: Posted[] = [];
    const instance = makeBridge({
      transport: {
        post(payload) {
          replies.push(JSON.parse(payload) as Posted);
          return true;
        },
      },
    });
    const w = window as unknown as { kiclient: { postMessage: (msg: unknown) => void; _msgBacklog: unknown[] } };
    w.kiclient = {
      _msgBacklog: [{ command: "NEW_SESSION", session_id: "session-1", message_id: 1 }],
      postMessage(msg) {
        w.kiclient._msgBacklog.push(msg);
      },
    };

    instance.install();
    instance.install();
    w.kiclient.postMessage({ command: "NEW_SESSION", session_id: "session-2", message_id: 4 });

    expect(replies).toHaveLength(2);
    expect(replies.map((item) => item.session_id)).toEqual(["session-1", "session-2"]);
    expect(w.kiclient._msgBacklog).toEqual([]);
    expect(instance.hasSession()).toBe(true);

    instance.uninstall();
    instance.uninstall();
  });

  it("settles session waits on handshake, timeout, abort, and dispose", async () => {
    vi.useFakeTimers();
    const clock = trackingClock();
    const instance = makeBridge({
      clock,
      transport: { post: () => true },
    });

    const ready = instance.waitForSession();
    openSession(instance);
    await expect(ready).resolves.toBe("session-1");
    expect(clock.live.size).toBe(0);

    const timedOut = expect(
      makeBridge({ clock, transport: { post: () => true } }).waitForSession({ timeoutMs: 250 }),
    ).rejects.toThrow("Session timeout");
    await vi.advanceTimersByTimeAsync(250);
    await timedOut;
    expect(clock.live.size).toBe(0);

    const controller = new AbortController();
    const cancelled = makeBridge({ clock, transport: { post: () => true } }).waitForSession({
      signal: controller.signal,
    });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(clock.live.size).toBe(0);

    const disposable = makeBridge({ clock, transport: { post: () => true } });
    const pending = disposable.waitForSession({ timeoutMs: 10_000 });
    disposable.dispose();
    await expect(pending).rejects.toThrow("Bridge disposed");
    expect(clock.live.size).toBe(0);
  });

  it("rejects a command without a session and surfaces RPC errors", async () => {
    const clock = trackingClock();
    let lastCommandId = 0;
    const instance = makeBridge({
      clock,
      transport: {
        post(payload) {
          const envelope = JSON.parse(payload) as Posted;
          if (envelope.command !== "NEW_SESSION") {
            lastCommandId = envelope.message_id as number;
          }
          return true;
        },
      },
    });
    await expect(instance.send("GET_SOURCE_INFO")).rejects.toThrow(
      "Session has not been established yet.",
    );

    openSession(instance);
    const pending = instance.send("REMOTE_LOGIN");
    instance.handleIncoming({
      response_to: lastCommandId,
      session_id: "session-1",
      status: "ERROR",
      error_message: "login failed",
    } satisfies KiCadResponse);
    await expect(pending).rejects.toThrow("login failed");
    expect(clock.live.size).toBe(0);
  });
});
