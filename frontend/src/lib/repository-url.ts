/**
 * Turn a stored Git remote into the web URL a browser can open.
 *
 * The import field accepts scp-style (`git@host:org/repo.git`) and `ssh://`
 * remotes, and the workspace stores that transport spelling verbatim. Used
 * verbatim as an anchor href, a scp-style remote has no scheme, so the browser
 * resolves it as a *relative* URL against the Prism origin, and `ssh://` has
 * no web handler at all. Forge hosts serve their web UI over HTTPS on the same
 * host the remote names, so the browsable spelling is `https://host/path` with
 * the transport user dropped and the trailing `.git` removed.
 *
 * Returns null when no safe http(s) derivation exists so callers can render
 * the raw remote as plain text instead of a dead link.
 */

const SCP_LIKE_RE = /^[^/@]+@(\[[^\]]+\]|[^/:]+):(.+)$/;

export function repositoryWebUrl(raw: string | null | undefined): string | null {
  const remote = raw?.trim();
  if (!remote) {
    return null;
  }

  const scp = SCP_LIKE_RE.exec(remote);
  if (scp && !remote.includes("://")) {
    return buildWebUrl("https:", scp[1], "", scp[2]);
  }

  let parsed: URL;
  try {
    parsed = new URL(remote);
  } catch {
    return null;
  }

  if (parsed.protocol === "ssh:") {
    return buildWebUrl("https:", parsed.hostname, "", parsed.pathname);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return buildWebUrl(parsed.protocol, parsed.hostname, parsed.port, parsed.pathname);
}

function buildWebUrl(
  protocol: string,
  host: string,
  port: string,
  pathname: string
): string | null {
  if (!host) {
    return null;
  }
  const path = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  if (!path) {
    return null;
  }
  const origin = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
  return `${origin}/${path}`;
}