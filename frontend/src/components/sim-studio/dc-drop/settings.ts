import type { SimSetup } from "../types";

/** The first analysis's settings, by section (`mesh`, `terminals`, ...). */
export type Settings = Record<string, Record<string, unknown> | undefined>;

export function settingsOf(setup: SimSetup): Settings {
    return (setup.analyses[0]?.settings ?? {}) as Settings;
}

/** The setup with one setting set (`undefined` restores the engine default). */
export function withSetting(setup: SimSetup, section: string, key: string, value: unknown): SimSetup {
    const next = structuredClone(setup);
    const analysis = next.analyses[0];
    const settings = { ...(analysis.settings ?? {}) } as Settings;
    const group = { ...(settings[section] ?? {}) };
    if (value === undefined) delete group[key];
    else group[key] = value;
    if (Object.keys(group).length) settings[section] = group;
    else delete settings[section];
    analysis.settings = settings;
    return next;
}
