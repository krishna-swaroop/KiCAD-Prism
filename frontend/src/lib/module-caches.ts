/**
 * Module-level caches that outlive a screen (a fetched board index, for one)
 * are not server state, but they still belong to the account that fetched
 * them. A module registers its own reset when it loads; signing out runs every
 * registered reset, so a module that was never loaded has nothing to clear and
 * is not pulled into the main bundle just to be forgotten.
 */
const resets = new Set<() => void>();

export function registerModuleCacheReset(reset: () => void): void {
  resets.add(reset);
}

export function forgetModuleCaches(): void {
  for (const reset of resets) reset();
}
