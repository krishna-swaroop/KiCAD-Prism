import { describe, expect, it, vi } from "vitest";

import { loadClientEnvironment } from "./client-environment";

const FROZEN_MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

describe("loadClientEnvironment", () => {
  it("reports the real macOS release, chip and browser build from client hints", async () => {
    const getHighEntropyValues = vi.fn(async () => ({
      platform: "macOS",
      platformVersion: "15.3.1",
      architecture: "arm",
      bitness: "64",
      fullVersionList: [
        { brand: "Not)A;Brand", version: "99.0.0.0" },
        { brand: "Chromium", version: "153.0.7240.62" },
        { brand: "Google Chrome", version: "153.0.7240.62" },
      ],
    }));

    const env = await loadClientEnvironment({
      userAgent: FROZEN_MAC_CHROME,
      userAgentData: { platform: "macOS", getHighEntropyValues },
    });

    expect(env).toEqual({
      browser: "Google Chrome 153.0.7240.62",
      os: "macOS 15.3.1 (arm, 64-bit)",
      userAgent: FROZEN_MAC_CHROME,
    });
    expect(getHighEntropyValues).toHaveBeenCalledWith(["platformVersion", "architecture", "bitness", "fullVersionList"]);
  });

  it("names Windows 11 from its platform version", async () => {
    const env = await loadClientEnvironment({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      userAgentData: {
        platform: "Windows",
        getHighEntropyValues: async () => ({
          platformVersion: "15.0.0",
          architecture: "x86",
          bitness: "64",
          fullVersionList: [{ brand: "Microsoft Edge", version: "153.0.3405.80" }],
        }),
      },
    });
    expect(env.browser).toBe("Microsoft Edge 153.0.3405.80");
    expect(env.os).toBe("Windows 11 (15.0.0) (x86, 64-bit)");
  });

  it("falls back to the user agent when client hints are unavailable", async () => {
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15";
    const env = await loadClientEnvironment({ userAgent: safari });
    expect(env.browser).toBe("Safari 19.1");
    expect(env.os).toBe("macOS (version and architecture not exposed by this browser)");
  });

  it("prefers Edge over the Chrome token it also carries", async () => {
    const env = await loadClientEnvironment({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0",
    });
    expect(env.browser).toBe("Microsoft Edge 153.0.0.0");
    expect(env.os).toMatch(/^Windows 10 or 11/);
  });

  it("falls back when the browser refuses high-entropy hints", async () => {
    const env = await loadClientEnvironment({
      userAgent: FROZEN_MAC_CHROME,
      userAgentData: { getHighEntropyValues: async () => Promise.reject(new Error("denied")) },
    });
    expect(env.browser).toBe("Chrome 153.0.0.0");
    expect(env.os).toMatch(/^macOS \(/);
  });
});
