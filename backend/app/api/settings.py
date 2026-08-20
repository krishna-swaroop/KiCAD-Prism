import asyncio
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import logging

from app.core.config import settings
from app.core.roles import ROLE_LABELS, Role, normalize_role
from app.core.security import AuthenticatedUser, require_admin
from app.services import (
    access_service,
    git_access_service,
    password_credential_service,
    project_import_service,
    session_store_service,
)
from app.services.git_remote_url import RemoteUrlError, parse_remote_url
from app.services.workspace_service import workspace

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_admin)])

class SSHKeyResponse(BaseModel):
    exists: bool
    public_key: str | None = None
    # The fingerprint is what a forge shows beside an authorised key, so it is
    # how an operator confirms the key they pasted is the one Prism uses.
    fingerprint: str | None = None
    key_type: str | None = None
    comment: str | None = None
    created_at: str | None = None

class GenerateSSHKeyRequest(BaseModel):
    email: str = "kicad-prism@example.com"


class RoleAssignmentResponse(BaseModel):
    email: str
    role: Role
    source: str
    has_password: bool = False


class UpsertRoleRequest(BaseModel):
    role: str


class SetPasswordRequest(BaseModel):
    password: str
    must_change: bool = True

@router.get("/ssh-key", response_model=SSHKeyResponse)
async def get_ssh_key():
    """Get the workspace machine-user key and its fingerprint."""
    info = await asyncio.to_thread(git_access_service.describe_key)
    return SSHKeyResponse(
        exists=info.exists,
        public_key=info.public_key,
        fingerprint=info.fingerprint,
        key_type=info.key_type,
        comment=info.comment,
        created_at=info.created_at,
    )

@router.post("/ssh-key/generate")
async def generate_ssh_key(request: GenerateSSHKeyRequest):
    """Generate a new Ed25519 key for the workspace."""
    try:
        info = await asyncio.to_thread(git_access_service.generate_key, request.email)
    except Exception as error:
        logger.exception("SSH key generation failed")
        raise HTTPException(status_code=500, detail=f"Failed to generate SSH key: {error}")
    return {
        "success": True,
        "public_key": info.public_key,
        "fingerprint": info.fingerprint,
    }


@router.get("/git-access")
async def get_git_access():
    """Everything an operator needs to reason about Prism's Git access.

    The key, its fingerprint, which hosts are pinned, and the live access state
    of every imported repository — so a broken credential is visible here rather
    than at the moment someone tries to sync.
    """
    key = git_access_service.describe_key()
    repositories = await asyncio.to_thread(_repository_access_rows)
    return {
        "key": {
            "exists": key.exists,
            "public_key": key.public_key,
            "fingerprint": key.fingerprint,
            "key_type": key.key_type,
            "comment": key.comment,
            "created_at": key.created_at,
        },
        "trusted_hosts": git_access_service.trusted_hosts(),
        "repositories": repositories,
        # Lets the UI disable what the server cannot do, rather than surfacing
        # a FileNotFoundError when the button is pressed.
        "tools": git_access_service.openssh_tools(),
    }


def _repository_access_rows() -> List[dict]:
    rows: List[dict] = []
    for repository in workspace.get_repositories():
        url = str(repository.get("url") or "")
        entry = {
            "id": repository.get("id"),
            "name": repository.get("name"),
            "url": url,
            "last_synced_at": repository.get("last_synced_at"),
            "host": None,
            "host_trusted": None,
            "guidance": None,
        }
        try:
            parsed = parse_remote_url(url)
        except Exception:
            entry["guidance"] = "This repository's URL predates URL validation and cannot be parsed."
            rows.append(entry)
            continue
        guidance = git_access_service.guidance_for(parsed)
        entry.update(
            {
                "host": parsed.host,
                # Checked without a network call; the live check is on demand,
                # so opening Settings does not fan out to every Git server.
                "host_trusted": git_access_service.is_host_trusted(parsed.host)
                if parsed.scheme == "ssh"
                else None,
                "forge": guidance.forge,
                "deploy_key_url": guidance.deploy_key_url,
                "guidance": guidance.instructions,
            }
        )
        rows.append(entry)
    return rows


class CheckAccessRequest(BaseModel):
    url: str


@router.post("/git-access/check")
async def check_git_access(request: CheckAccessRequest):
    """Ask a Git server whether Prism may read one repository, right now."""
    try:
        parsed = parse_remote_url(request.url, project_import_service.remote_url_policy())
    except RemoteUrlError as error:
        raise HTTPException(status_code=400, detail=str(error))

    result = await asyncio.to_thread(
        git_access_service.check_repository_access,
        parsed,
        git_env=project_import_service.git_env(),
    )
    guidance = git_access_service.guidance_for(parsed)
    return {
        "reachable": result.reachable,
        "authorized": result.authorized,
        "reason": result.reason,
        "message": result.message,
        "default_branch": result.default_branch,
        "forge": guidance.forge,
        "deploy_key_url": guidance.deploy_key_url,
        "instructions": guidance.instructions,
    }


class HostKeyRequest(BaseModel):
    host: str
    port: int = 22


@router.post("/git-access/host-keys/scan")
async def scan_git_host_key(request: HostKeyRequest):
    """Fetch a host's SSH key so its fingerprint can be checked before trusting.

    Scanning and trusting are separate on purpose: a scan is exactly as
    trustworthy as the network it ran over, so an administrator has to compare
    the fingerprint against what the Git server's operator publishes.
    """
    try:
        candidate = await asyncio.to_thread(
            git_access_service.scan_host_key, request.host, request.port
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except git_access_service.MissingSSHToolError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error))
    return {
        "host": candidate.host,
        "fingerprints": candidate.fingerprints,
        "already_trusted": git_access_service.is_host_trusted(candidate.host),
    }


@router.post("/git-access/host-keys/trust")
async def trust_git_host_key(request: HostKeyRequest):
    """Pin a host key the administrator has verified."""
    try:
        candidate = await asyncio.to_thread(
            git_access_service.scan_host_key, request.host, request.port
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except git_access_service.MissingSSHToolError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error))
    await asyncio.to_thread(git_access_service.trust_host, candidate)
    return {"host": candidate.host, "fingerprints": candidate.fingerprints, "trusted": True}


@router.delete("/git-access/host-keys/{host}")
async def forget_git_host_key(host: str):
    try:
        removed = await asyncio.to_thread(git_access_service.forget_host, host)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"host": host, "removed": removed}


@router.get("/access/users", response_model=List[RoleAssignmentResponse])
async def list_access_users():
    credentialed = (
        set(password_credential_service.list_credentialed_emails())
        if settings.PASSWORD_AUTH_ENABLED
        else set()
    )
    return [
        RoleAssignmentResponse(
            **item,
            has_password=item["email"].strip().lower() in credentialed,
        )
        for item in access_service.list_role_assignments()
    ]


@router.put("/access/users/{email}", response_model=RoleAssignmentResponse)
async def upsert_access_user(
    email: str,
    request: UpsertRoleRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    normalized_role = normalize_role(request.role)
    if normalized_role is None:
        valid_roles = ", ".join(f"{role} ({label})" for role, label in ROLE_LABELS.items())
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}.")

    try:
        assignment = access_service.upsert_user_role(email=email, role=normalized_role, updated_by=user.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    return RoleAssignmentResponse(
        **assignment,
        has_password=password_credential_service.has_credential(assignment["email"]),
    )


@router.delete("/access/users/{email}")
async def delete_access_user(email: str, user: AuthenticatedUser = Depends(require_admin)):
    try:
        deleted = access_service.delete_user_role(email=email, updated_by=user.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    if not deleted:
        raise HTTPException(status_code=404, detail="User role assignment not found")

    account = access_service.get_user_by_email(email)
    revoked = 0
    if account:
        revoked += session_store_service.revoke_sessions_for_user_id(
            account["user_id"], reason=f"access_revoked:{user.email}"
        )
    revoked += session_store_service.revoke_sessions_for_email(
        email, reason=f"access_revoked:{user.email}"
    )

    return {"deleted": email.strip().lower(), "sessions_revoked": revoked}


@router.put("/access/users/{email}/password")
async def set_user_password(
    email: str,
    request: SetPasswordRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Set or reset a user's local password. Requires an existing Prism account."""
    if not settings.PASSWORD_AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Password login is not enabled on this deployment")
    try:
        password_credential_service.set_password(
            email,
            request.password,
            updated_by=user.email,
            must_change=request.must_change,
        )
    except password_credential_service.NoSuchUserError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except password_credential_service.PasswordPolicyError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    account = access_service.get_user_by_email(email)
    revoked = 0
    if account:
        revoked += session_store_service.revoke_sessions_for_user_id(
            account["user_id"], reason=f"password_reset:{user.email}"
        )
    revoked += session_store_service.revoke_sessions_for_email(
        email, reason=f"password_reset:{user.email}"
    )
    return {
        "email": email.strip().lower(),
        "must_change": request.must_change,
        "sessions_revoked": revoked,
    }


@router.delete("/access/users/{email}/password")
async def delete_user_password(email: str, user: AuthenticatedUser = Depends(require_admin)):
    if not settings.PASSWORD_AUTH_ENABLED:
        raise HTTPException(status_code=400, detail="Password login is not enabled on this deployment")
    deleted = password_credential_service.delete_credential(email)
    if not deleted:
        raise HTTPException(status_code=404, detail="No local password for this account")
    return {"email": email.strip().lower(), "deleted": True}
