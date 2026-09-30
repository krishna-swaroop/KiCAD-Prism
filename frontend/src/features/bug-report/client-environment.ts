/**
 * The reporter's browser and operating system, as precisely as the browser
 * will tell us.
 *
 * The user-agent string alone is not enough. Browsers now freeze it: every
 * Mac reports "Intel Mac OS X 10_15_7" whatever the chip or macOS release,
 * and Chrome zeroes all but the major version. Chromium browsers still expose
 * the real values through User-Agent Client Hints, so those are asked for
 * first. Safari and Firefox do not implement them, and Chromium only offers
 * them on HTTPS or localhost, so the user-agent string is the fallback there
 * and the report says the OS details are approximate.
 */
export interface ClientEnvironment {
  browser: string;
  os: string;
  userAgent: string;
}

interface BrandVersion {
  brand: string;
  version: string;
}

interface HighEntropyValues {
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  fullVersionList?: BrandVersion[];
}

interface UserAgentData {
  brands?: BrandVersion[];
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyValues>;
}

export interface NavigatorLike {
  userAgent: string;
  userAgentData?: UserAgentData;
}

const HIGH_ENTROPY_HINTS = ["platformVersion", "architecture", "bitness", "fullVersionList"];

/** Chromium pads the brand list with a decoy ("Not.A/Brand") and the engine itself. */
function pickBrand(brands: BrandVersion[] | undefined): BrandVersion | null {
  if (!brands?.length) return null;
  const real = brands.filter(({ brand }) => !/not.?a.?brand/i.test(brand));
  return real.find(({ brand }) => brand !== "Chromium") ?? real[0] ?? null;
}

function windowsName(platformVersion: string): string {
  // Client hints report the Windows UI contract version: 13 and above is Windows 11.
  const major = Number.parseInt(platformVersion, 10);
  if (Number.isNaN(major)) return `Windows ${platformVersion}`;
  if (major >= 13) return `Windows 11 (${platformVersion})`;
  if (major > 0) return `Windows 10 (${platformVersion})`;
  return `Windows 8.1 or earlier (${platformVersion})`;
}

function describeHintedOs(platform: string, values: HighEntropyValues): string {
  const version = values.platformVersion ?? "";
  const name = platform === "Windows" && version ? windowsName(version) : [platform, version].filter(Boolean).join(" ");
  const machine = [values.architecture, values.bitness ? `${values.bitness}-bit` : ""].filter(Boolean).join(", ");
  return machine ? `${name} (${machine})` : name;
}

/** Checked in order: Edge and Opera also carry "Chrome/", and Chrome also carries "Safari/". */
const USER_AGENT_BROWSERS: Array<[RegExp, string]> = [
  [/Edg\/([\d.]+)/, "Microsoft Edge"],
  [/OPR\/([\d.]+)/, "Opera"],
  [/Firefox\/([\d.]+)/, "Firefox"],
  [/Chrome\/([\d.]+)/, "Chrome"],
  [/Version\/([\d.]+).*Safari/, "Safari"],
];

function describeUserAgentBrowser(userAgent: string): string {
  for (const [pattern, name] of USER_AGENT_BROWSERS) {
    const match = pattern.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return "unknown";
}

function describeUserAgentOs(userAgent: string): string {
  if (/iPhone|iPad/.test(userAgent)) return "iOS or iPadOS";
  if (/Mac OS X/.test(userAgent)) return "macOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows NT 10\.0/.test(userAgent)) return "Windows 10 or 11";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "unknown";
}

export async function loadClientEnvironment(nav: NavigatorLike): Promise<ClientEnvironment> {
  const data = nav.userAgentData;
  if (data?.getHighEntropyValues) {
    try {
      const values = await data.getHighEntropyValues(HIGH_ENTROPY_HINTS);
      const brand = pickBrand(values.fullVersionList) ?? pickBrand(data.brands);
      const platform = values.platform ?? data.platform ?? "";
      return {
        browser: brand ? `${brand.brand} ${brand.version}` : describeUserAgentBrowser(nav.userAgent),
        os: platform ? describeHintedOs(platform, values) : describeUserAgentOs(nav.userAgent),
        userAgent: nav.userAgent,
      };
    } catch {
      // A browser may refuse high-entropy hints; fall through to the string.
    }
  }
  return {
    browser: describeUserAgentBrowser(nav.userAgent),
    os: `${describeUserAgentOs(nav.userAgent)} (version and architecture not exposed by this browser)`,
    userAgent: nav.userAgent,
  };
}
