import { describe, expect, it } from "vitest";

import type { SupplyConnector } from "@/types/supply";
import { budgetUsedPercent, connectorState, errorCodeLabel, failureWords, slowedText } from "./connector-status";
import { clockTime } from "./supply-format";
import { connectorFixture } from "./supply-test-fixtures";

describe("connectorState", () => {
  it("is active for a healthy connector", () => {
    expect(connectorState(connectorFixture())).toEqual({ label: "Active", tone: "success" });
  });

  it("puts the most urgent reason first", () => {
    const broken = connectorFixture({
      provider_available: false,
      credentials_status: "locked",
      paused_reason: "x",
      enabled: false,
    });
    expect(connectorState(broken).label).toBe("Provider missing");
    expect(connectorState({ ...broken, provider_available: true }).label).toBe("Credentials locked");
    expect(connectorState({ ...broken, provider_available: true, credentials_status: "ready" }).label).toBe("Paused");
    expect(connectorState({ ...broken, provider_available: true, credentials_status: "ready", paused_reason: "" }).label)
      .toBe("Disabled");
  });

  it("treats a CSV connector without an upload as not ready", () => {
    const csv = connectorFixture({ provider: "csv", credentials: {}, metered: false, csv_fed: true });
    expect(connectorState(csv)).toEqual({ label: "No file uploaded", tone: "warning" });
    const withFile = { ...csv, csv_import: { filename: "a.csv", imported_by: "x", imported_at: "2026-03-01T00:00:00Z", row_count: 2 } };
    expect(connectorState(withFile).label).toBe("Active");
    expect(connectorState({ ...csv, paused_reason: "x" }).label).toBe("Paused");
  });

  it("flags a changed credential key and unset credentials", () => {
    expect(connectorState(connectorFixture({ credentials_status: "unknown_key" })).label).toBe("Credential key changed");
    expect(connectorState(connectorFixture({ credentials: { api_key: false } })).label).toBe("Needs credentials");
  });

  it("reports a failure only while it is the latest outcome", () => {
    const failed = connectorFixture({
      last_error_code: "rate_limited",
      last_error_at: "2026-03-02T10:00:00Z",
      last_ok_at: "2026-03-01T10:00:00Z",
    });
    expect(connectorState(failed).label).toBe("Last call failed");
    expect(connectorState({ ...failed, last_ok_at: "2026-03-03T10:00:00Z" }).label).toBe("Active");
    expect(connectorState({ ...failed, last_ok_at: null }).label).toBe("Last call failed");
  });
});

describe("budgetUsedPercent", () => {
  it("rounds and clamps", () => {
    expect(budgetUsedPercent(connectorFixture({ daily_budget: 1000, usage_today: { spent: 125, interactive_spent: 0 } }))).toBe(13);
    expect(budgetUsedPercent(connectorFixture({ daily_budget: 100, usage_today: { spent: 400, interactive_spent: 0 } }))).toBe(100);
  });

  it("treats a zero budget as fully spent", () => {
    expect(budgetUsedPercent(connectorFixture({ daily_budget: 0 }))).toBe(100);
  });
});

describe("labels", () => {
  it("translates known error codes and tidies the rest", () => {
    expect(errorCodeLabel("auth_failed")).toBe("credentials rejected");
    expect(errorCodeLabel("response_too_large")).toBe("response too large");
    expect(failureWords("egress_denied", "DigiKey EU")).toBe("Can't reach DigiKey EU");
    expect(failureWords("auth_failed", "Mouser")).toBe("Mouser refused the sign-in");
    expect(failureWords("response_too_large", "TME")).toBe("Can't read TME's answer");
    expect(failureWords("", "TME")).not.toMatch(/_/);
  });

});

describe("a resting connector", () => {
  const NOW = Date.parse("2026-10-22T14:05:00");
  const base = { provider_available: true, credentials: {}, credentials_status: "ok", enabled: true, paused_reason: "", provider: "jlcpcb", csv_import: null, last_ok_at: null, last_error_code: "blocked", last_error_at: "2026-10-22T14:05:00" } as unknown as SupplyConnector;

  it("says it rests until a time instead of that the last call failed, and tells a refusal from other errors", () => {
    const resting = { ...base, cooldown_until: "2026-10-22T14:20:00" } as SupplyConnector;
    expect(connectorState(resting, NOW)).toEqual({ label: "Resting until 14:20", tone: "warning" });
    expect(connectorState({ ...resting, cooldown_until: "2026-10-22T14:00:00" } as SupplyConnector, NOW).label).toBe("Last call failed");
    expect(errorCodeLabel("blocked")).toBe("refused");
  });

  it("gives the day when the rest or the slowdown ends tomorrow", () => {
    expect(clockTime("2026-10-23T09:10:00", NOW)).toBe("tomorrow 09:10");
    expect(slowedText({ ...base, slow_until: "2026-10-23T09:10:00" } as SupplyConnector, NOW)).toBe("Calls slowed until tomorrow 09:10");
    expect(slowedText({ ...base, slow_until: "2026-10-22T10:00:00" } as SupplyConnector, NOW)).toBe("");
  });
});
