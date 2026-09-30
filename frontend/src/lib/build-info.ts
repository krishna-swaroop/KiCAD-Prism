export interface PrismBuildInfo {
  release: string;
  revision: string;
  buildDate: string;
}

/**
 * The frontend bundle's own identity, fixed at build time. The backend reports
 * its identity separately (`/api/health`), and the two can differ after a
 * partial upgrade, which is exactly what a bug report needs to show.
 */
export const FRONTEND_BUILD: PrismBuildInfo = __PRISM_BUILD__;
