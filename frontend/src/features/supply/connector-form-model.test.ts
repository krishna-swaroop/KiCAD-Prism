import { describe, expect, it } from "vitest";

import { changesFrom, createProblem, initialState, reducer, settingsProblem, valuesOf } from "./connector-form-model";
import { connectorFixture, providerFixture } from "./supply-test-fixtures";

describe("create form model", () => {
  const keyed = providerFixture({ storefronts: ["uk", "it"] });

  it("starts from the first provider's defaults", () => {
    const state = initialState(keyed);
    expect(state).toMatchObject({ provider: "demo", storefront: "uk", budget: "1000", reserve: "10" });
  });

  it("resets storefront, budget and credentials when the provider changes", () => {
    const typed = reducer(initialState(keyed), { type: "credential", name: "api_key", value: "secret" });
    const other = providerFixture({ key: "other", storefronts: [], default_daily_budget: 50 });
    expect(reducer(typed, { type: "provider", provider: other })).toMatchObject({
      provider: "other", storefront: "", budget: "50", credentials: {},
    });
  });

  it("asks for whatever is missing, in order", () => {
    const state = initialState(keyed);
    expect(createProblem(state, undefined)).toBe("Choose a provider.");
    expect(createProblem({ ...state, storefront: "" }, keyed)).toBe("Choose a storefront.");
    expect(createProblem(state, keyed)).toBe("Enter API key.");
    const filled = reducer(state, { type: "credential", name: "api_key", value: "k" });
    expect(createProblem(filled, keyed)).toBeNull();
    expect(createProblem({ ...filled, credentials: { api_key: "   " } }, keyed)).toBe("Enter API key.");
  });

  it("checks currency, budget and reserve", () => {
    const base = { currency: "", budget: "100", reserve: "10" };
    expect(settingsProblem(base)).toBeNull();
    expect(settingsProblem({ ...base, currency: "eur" })).toBeNull();
    expect(settingsProblem({ ...base, currency: "EURO" })).toMatch(/three letter/);
    expect(settingsProblem({ ...base, budget: "-1" })).toMatch(/whole number/);
    expect(settingsProblem({ ...base, budget: "1.5" })).toMatch(/whole number/);
    expect(settingsProblem({ ...base, reserve: "51" })).toMatch(/0 to 50/);
    expect(settingsProblem({ ...base, reserve: "" })).toMatch(/0 to 50/);
  });
});

describe("edit form model", () => {
  const connector = connectorFixture();

  it("sends nothing when nothing changed", () => {
    expect(changesFrom(connector, valuesOf(connector))).toEqual({});
  });

  it("sends only what changed, normalized", () => {
    const values = { ...valuesOf(connector), displayName: "  Renamed ", currency: "gbp", budget: "500" };
    expect(changesFrom(connector, values)).toEqual({ display_name: "Renamed", currency: "GBP", daily_budget: 500 });
  });

  it("sets and clears how long raw samples are kept", () => {
    const set = { ...valuesOf(connector), retention: "14" };
    expect(changesFrom(connector, set)).toEqual({ retention_days: 14 });
    const kept = connectorFixture({ retention_days: 14 });
    expect(changesFrom(kept, { ...valuesOf(kept), retention: "" })).toEqual({ retention_days: null });
    expect(settingsProblem({ currency: "", budget: "1", reserve: "10", retention: "0" })).toMatch(/1 to 365/);
    expect(settingsProblem({ currency: "", budget: "1", reserve: "10", retention: "" })).toBeNull();
    expect(changesFrom(connector, { ...valuesOf(connector), keep: "90" })).toEqual({ keep_days: 90 });
    expect(changesFrom(connector, { ...valuesOf(connector), keepUnused: true })).toEqual({ keep_unused: true });
    expect(changesFrom(connector, { ...valuesOf(connector), catalogue: true })).toEqual({ catalogue: true });
    expect(settingsProblem({ currency: "", budget: "1", reserve: "10", keep: "0" })).toMatch(/1 to 3650/);
  });
});
