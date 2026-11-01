import type { SupplyConnector, SupplyProvider, UpdateSupplyConnectorInput } from "@/types/supply";

export interface FormState {
  provider: string;
  storefront: string;
  displayName: string;
  currency: string;
  budget: string;
  reserve: string;
  credentials: Record<string, string>;
}

export type FormAction =
  | { type: "provider"; provider: SupplyProvider }
  | { type: "field"; name: "storefront" | "displayName" | "currency" | "budget" | "reserve"; value: string }
  | { type: "credential"; name: string; value: string };

export function initialState(provider: SupplyProvider | undefined): FormState {
  return {
    provider: provider?.key ?? "",
    storefront: provider?.storefronts[0] ?? "",
    displayName: "",
    currency: "",
    budget: String(provider?.default_daily_budget ?? 0),
    reserve: "10",
    credentials: {},
  };
}

export function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "provider":
      return {
        ...state,
        provider: action.provider.key,
        storefront: action.provider.storefronts[0] ?? "",
        budget: String(action.provider.default_daily_budget),
        credentials: {},
      };
    case "field":
      return { ...state, [action.name]: action.value };
    case "credential":
      return { ...state, credentials: { ...state.credentials, [action.name]: action.value } };
  }
}

/** Currency, budget and reserve checks shared by the create and edit forms. */
export function settingsProblem(values: { currency: string; budget: string; reserve: string; retention?: string; keep?: string; resetTime?: string }): string | null {
  if (values.currency && !/^[A-Za-z]{3}$/.test(values.currency)) return "Currency is a three letter code.";
  if (!/^\d+$/.test(values.budget)) return "Daily budget is a whole number.";
  if (!/^\d+$/.test(values.reserve) || Number(values.reserve) > 50) return "Reserve is 0 to 50 percent.";
  if (values.retention && (!/^\d+$/.test(values.retention) || Number(values.retention) < 1 || Number(values.retention) > 365)) {
    return "Keep raw samples for 1 to 365 days, or leave it empty.";
  }
  if (values.keep && (!/^\d+$/.test(values.keep) || Number(values.keep) < 1 || Number(values.keep) > 3650)) {
    return "Keep history for 1 to 3650 days, or leave it empty.";
  }
  if (values.resetTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.resetTime.trim())) return "The reset time is hours and minutes, such as 00:00.";
  return null;
}

/** The first thing wrong with the create form, or null. Mirrors the server's rules. */
export function createProblem(state: FormState, provider: SupplyProvider | undefined): string | null {
  if (!provider) return "Choose a provider.";
  if (provider.storefronts.length > 0 && !state.storefront) return "Choose a storefront.";
  const missing = provider.credential_fields.find((field) => !(state.credentials[field.name] ?? "").trim());
  if (missing) return `Enter ${missing.label}.`;
  return settingsProblem(state);
}

export interface EditValues {
  displayName: string;
  storefront: string;
  currency: string;
  budget: string;
  reserve: string;
  /** Days raw samples are kept; empty is the server's default. */
  retention: string;
  /** Days any history is kept; empty keeps it for good. */
  keep: string;
  /** Prices of parts not in use are kept past the read window. */
  keepUnused: boolean;
  /** Offers come from the published catalogue. */
  catalogue: boolean;
  /** When the provider's day begins, and in which time zone: its budget resets then. */
  resetTime: string;
  resetTz: string;
}

export function valuesOf(connector: SupplyConnector): EditValues {
  return {
    displayName: connector.display_name,
    storefront: connector.storefront,
    currency: connector.currency,
    budget: String(connector.daily_budget),
    reserve: String(connector.interactive_reserve_pct),
    retention: connector.retention_days === null ? "" : String(connector.retention_days),
    keep: connector.keep_days === null ? "" : String(connector.keep_days),
    keepUnused: connector.keep_unused,
    catalogue: connector.catalogue,
    resetTime: connector.reset_time ?? "00:00",
    resetTz: connector.reset_tz ?? "UTC",
  };
}

/** Only what differs from the saved connector, so an untouched form sends nothing. */
export function changesFrom(connector: SupplyConnector, values: EditValues): UpdateSupplyConnectorInput {
  const changes: UpdateSupplyConnectorInput = {};
  if (values.storefront !== connector.storefront) changes.storefront = values.storefront;
  if (values.displayName.trim() !== connector.display_name) changes.display_name = values.displayName.trim();
  if (values.currency.trim().toUpperCase() !== connector.currency) changes.currency = values.currency.trim().toUpperCase();
  if (Number(values.budget) !== connector.daily_budget) changes.daily_budget = Number(values.budget);
  if (Number(values.reserve) !== connector.interactive_reserve_pct) changes.interactive_reserve_pct = Number(values.reserve);
  const retention = values.retention.trim() === "" ? null : Number(values.retention);
  if (retention !== connector.retention_days) changes.retention_days = retention;
  const keep = values.keep.trim() === "" ? null : Number(values.keep);
  if (keep !== connector.keep_days) changes.keep_days = keep;
  if (values.keepUnused !== connector.keep_unused) changes.keep_unused = values.keepUnused;
  if (values.catalogue !== connector.catalogue) changes.catalogue = values.catalogue;
  if (values.resetTime.trim() !== (connector.reset_time ?? "00:00")) changes.reset_time = values.resetTime.trim();
  if (values.resetTz.trim() !== (connector.reset_tz ?? "UTC")) changes.reset_tz = values.resetTz.trim();
  return changes;
}
