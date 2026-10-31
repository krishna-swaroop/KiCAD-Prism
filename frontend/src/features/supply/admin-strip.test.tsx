import { describe, expect, it } from "vitest";

import type { SupplyConnector, SupplySignin, SupplySvhcList } from "@/types/supply";
import { adminNotices } from "./admin-strip";

const NOW = new Date("2026-10-16T12:00:00Z").getTime();
const day = (n: number) => new Date(NOW + n * 24 * 3600 * 1000).toISOString();
const connector = (id: string, extra: Partial<SupplyConnector> = {}) => ({ id, display_name: id.toUpperCase(), provider: "digikey", paused_reason: "", ...extra }) as SupplyConnector;
const signin = (extra: Partial<SupplySignin>): SupplySignin => ({ signed_in: true, state: "ok", granted_by: "a", granted_at: null, expires_at: null, redirect_uri: "", ...extra });
const list = (loaded_at: string | null): SupplySvhcList => ({ loaded: loaded_at !== null, substances: 10, loaded_at, loaded_by: "a", source_name: "list.csv" });

describe("what only an administrator can fix", () => {
  it("says nothing when all is well", () => {
    expect(adminNotices([connector("dk", { signin: signin({ expires_at: day(60) }) })], list(day(-30)), 0, NOW)).toEqual([]);
  });

  it("names a paused connector, a sign-in about to end or gone, an old Candidate List and parts waiting for room", () => {
    const notices = adminNotices(
      [connector("dk", { paused_reason: "over budget", signin: signin({ expires_at: day(5) }) }), connector("dk2", { signin: signin({ state: "expired" }) })],
      list(day(-200)), 12, NOW,
    );
    expect(notices.map((item) => item.key)).toEqual(["paused:dk", "signin:dk", "signin:dk2", "echa", "waiting"]);
    expect(notices.find((item) => item.key === "signin:dk")?.text).toContain("ends in 5 days");
    expect(notices.find((item) => item.key === "waiting")?.text).toContain("12 parts wait");
  });
});
