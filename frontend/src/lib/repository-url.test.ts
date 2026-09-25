import { describe, expect, it } from "vitest";

import { repositoryWebUrl } from "./repository-url";

describe("repositoryWebUrl", () => {
  it("derives an https URL from scp-style GitHub remotes", () => {
    expect(repositoryWebUrl("git@github.com:org/repo.git")).toBe("https://github.com/org/repo");
    expect(repositoryWebUrl("git@github.com:org/repo")).toBe("https://github.com/org/repo");
    expect(repositoryWebUrl("git@gitlab.com:org/repo.git")).toBe("https://gitlab.com/org/repo");
  });

  it("derives an https URL from ssh:// remotes and drops the ssh port", () => {
    expect(repositoryWebUrl("ssh://git@github.com/org/repo.git")).toBe("https://github.com/org/repo");
    expect(repositoryWebUrl("ssh://git@github.com:2222/org/repo.git")).toBe("https://github.com/org/repo");
  });

  it("keeps http(s) remotes and strips the trailing .git", () => {
    expect(repositoryWebUrl("https://github.com/org/repo.git")).toBe("https://github.com/org/repo");
    expect(repositoryWebUrl("https://github.com/org/repo/")).toBe("https://github.com/org/repo");
    expect(repositoryWebUrl("http://git.internal.example/org/repo.git")).toBe("http://git.internal.example/org/repo");
  });

  it("preserves a non-default https port and drops the normalized default", () => {
    expect(repositoryWebUrl("https://git.internal.example:8443/org/repo.git")).toBe("https://git.internal.example:8443/org/repo");
    expect(repositoryWebUrl("https://github.com:443/org/repo.git")).toBe("https://github.com/org/repo");
  });

  it("drops credentials from an https remote", () => {
    expect(repositoryWebUrl("https://user:token@github.com/org/repo.git")).toBe("https://github.com/org/repo");
  });

  it("handles IPv6 ssh hosts", () => {
    expect(repositoryWebUrl("ssh://git@[::1]/org/repo.git")).toBe("https://[::1]/org/repo");
  });

  it("returns null for empty and null input", () => {
    expect(repositoryWebUrl(null)).toBeNull();
    expect(repositoryWebUrl(undefined)).toBeNull();
    expect(repositoryWebUrl("")).toBeNull();
    expect(repositoryWebUrl("   ")).toBeNull();
  });

  it("returns null when no safe derivation exists", () => {
    expect(repositoryWebUrl("github.com/org/repo")).toBeNull();
    expect(repositoryWebUrl("git@github.com")).toBeNull();
    expect(repositoryWebUrl("https://github.com/")).toBeNull();
    expect(repositoryWebUrl("file:///org/repo")).toBeNull();
    expect(repositoryWebUrl("not a url")).toBeNull();
  });
});