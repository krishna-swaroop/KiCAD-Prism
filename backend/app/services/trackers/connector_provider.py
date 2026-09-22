"""Translate persisted connector fields into the GitHub adapter's credentials."""

from __future__ import annotations

from typing import Any, Mapping

from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials


def github_auth_for_connector(
    row: Mapping[str, Any], material: Mapping[str, Any]
) -> GitHubAppAuth:
    return GitHubAppAuth(
        GitHubAppCredentials(
            app_id=str(material.get("appId") or material.get("app_id") or ""),
            installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
            private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
            instance_kind=str(row.get("instance_kind") or "github.com"),
            base_url=str(row.get("base_url") or ""),
        )
    )
