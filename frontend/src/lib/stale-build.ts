/**
 * Recognises a lazy chunk that could not be loaded.
 *
 * After a redeploy, a tab still running the previous build asks for hashed
 * chunks the server no longer has. Retrying cannot help: the browser keeps the
 * failed module in its module map for the life of the page, so only a reload,
 * which boots the new build, recovers. Each engine words the failure
 * differently; Vite adds its own for CSS preloads.
 */
const STALE_CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module", // Chromium
  "error loading dynamically imported module", // Firefox
  "Importing a module script failed", // Safari
  "Unable to preload CSS", // Vite
];

export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return STALE_CHUNK_MESSAGES.some((fragment) => error.message.includes(fragment));
}
