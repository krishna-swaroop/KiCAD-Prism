import { describe, expect, it } from "vitest";

import {
  PANEL_LOG_LIMIT,
  appendPanelLog,
  emptyPanelLog,
  redactPanelLogMessage,
} from "./panel-log";

describe("appendPanelLog", () => {
  it("keeps the newest entries once the cap is reached", () => {
    let log = emptyPanelLog();
    for (let index = 1; index <= PANEL_LOG_LIMIT + 5; index += 1) {
      log = appendPanelLog(log, `entry-${index}`);
    }
    expect(log.entries).toHaveLength(PANEL_LOG_LIMIT);
    expect(log.dropped).toBe(5);
    expect(log.entries[0]).toBe("entry-6");
    expect(log.entries.at(-1)).toBe(`entry-${PANEL_LOG_LIMIT + 5}`);
  });

  it("clears to an empty buffer including the dropped count", () => {
    let log = emptyPanelLog();
    for (let index = 0; index < PANEL_LOG_LIMIT + 2; index += 1) {
      log = appendPanelLog(log, `entry-${index}`);
    }
    expect(log.dropped).toBe(2);
    log = emptyPanelLog();
    expect(log).toEqual({ entries: [], dropped: 0 });
  });
});

describe("redactPanelLogMessage", () => {
  it("redacts bearer tokens and JSON credential fields", () => {
    expect(redactPanelLogMessage("Authorization: Bearer super-secret")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(
      redactPanelLogMessage('Login response: {"token":"abc","authenticated":true}'),
    ).toBe('Login response: {"token":"[redacted]","authenticated":true}');
    expect(
      redactPanelLogMessage('KiCad -> {"command":"PLACE_COMPONENT","data":"inline-bytes"}'),
    ).toBe('KiCad -> {"command":"PLACE_COMPONENT","data":"[redacted]"}');
  });

  it("stores the redacted form in the buffer", () => {
    const log = appendPanelLog(emptyPanelLog(), 'Authorization: Bearer super-secret');
    expect(log.entries).toEqual(["Authorization: Bearer [redacted]"]);
  });

  it("removes complete escaped JSON values before storing them", () => {
    const message = JSON.stringify({
      data: JSON.stringify({ token: "synthetic-secret" }),
      access_token: 'prefix"secret-suffix\\tail',
      command: "PLACE_COMPONENT",
    });
    const log = appendPanelLog(emptyPanelLog(), message);
    expect(JSON.parse(log.entries[0])).toEqual({
      data: "[redacted]", access_token: "[redacted]", command: "PLACE_COMPONENT",
    });
  });
});
