import io
import json
import logging
import os
import re
import subprocess
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.roles import ROLE_LABELS, Role, normalize_role
from app.core.security import AuthenticatedUser, require_admin
from app.services import access_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_admin)])

# In Docker, home is /root. SSH keys are usually in ~/.ssh
# We use resolve() to get the absolute path to avoid any ambiguity
SSH_DIR = (Path.home() / ".ssh").resolve()
PRIVATE_KEY = SSH_DIR / "id_ed25519"
PUBLIC_KEY = SSH_DIR / "id_ed25519.pub"

# Strict allowlist: only characters valid in RFC 5321 email addresses.
# Excludes whitespace and shell-significant characters entirely.
_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}"
    r"@"
    r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"
    r"\.[a-zA-Z]{2,}$"
)


class SSHKeyResponse(BaseModel):
    exists: bool
    public_key: str | None = None


class GenerateSSHKeyRequest(BaseModel):
    email: str = "kicad-prism@example.com"


class RoleAssignmentResponse(BaseModel):
    email: str
    role: Role
    source: str


class UpsertRoleRequest(BaseModel):
    role: str


@router.get("/ssh-key", response_model=SSHKeyResponse)
async def get_ssh_key():
    """Get the current SSH public key if it exists."""
    logger.info(f"Checking for SSH public key at: {PUBLIC_KEY}")
    if not PUBLIC_KEY.exists():
        logger.info("SSH public key not found.")
        return {"exists": False, "public_key": None}

    try:
        with open(PUBLIC_KEY) as f:
            key_content = f.read().strip()
            logger.info("SSH public key found and read successfully.")
            return {"exists": True, "public_key": key_content}
    except Exception as e:
        logger.error(f"Error reading public key: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error reading public key: {str(e)}"
        ) from e


@router.post("/ssh-key/generate")
async def generate_ssh_key(request: GenerateSSHKeyRequest):
    """Generate a new Ed25519 SSH key."""
    logger.info(f"Starting SSH key generation for email: {request.email}")
    safe_email = request.email.strip()
    if not safe_email or len(safe_email) > 254 or not _EMAIL_RE.match(safe_email):
        raise HTTPException(status_code=400, detail="Invalid email format.")
    logger.info(f"SSH Directory: {SSH_DIR}")
    logger.info(f"Private Key Path: {PRIVATE_KEY}")
    logger.info(f"Public Key Path: {PUBLIC_KEY}")

    if PRIVATE_KEY.exists():
        logger.info("Existing private key found. Removing it.")
        try:
            os.remove(PRIVATE_KEY)
            if PUBLIC_KEY.exists():
                os.remove(PUBLIC_KEY)
                logger.info("Existing public key removed.")
        except OSError as e:
            logger.error(f"Failed to remove existing key: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to remove existing key: {e}"
            ) from e

    # Ensure .ssh directory exists and has correct permissions
    try:
        if not SSH_DIR.exists():
            logger.info(f"Creating SSH directory: {SSH_DIR}")
            SSH_DIR.mkdir(parents=True, exist_ok=True)

        logger.info(f"Setting permissions 0o700 on {SSH_DIR}")
        os.chmod(SSH_DIR, 0o700)
    except Exception as e:
        logger.error(f"Failed to create/chmod SSH directory: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to setup SSH directory: {str(e)}"
        ) from e

    try:
        # Generate key without passphrase (-N "") and with a fixed comment so
        # no user-controlled data is passed to the subprocess.
        command = [
            "ssh-keygen",
            "-t",
            "ed25519",
            "-C",
            "kicad-prism",
            "-N",
            "",
            "-f",
            str(PRIVATE_KEY),
        ]
        logger.info(f"Running command: {' '.join(command)}")

        subprocess.run(command, check=True, capture_output=True)
        logger.info("ssh-keygen command completed successfully.")

        # Ensure private key has correct permissions
        if not PRIVATE_KEY.exists():
            logger.error("Private key file not found after generation!")
            raise HTTPException(
                status_code=500,
                detail="Key generation appeared to succeed but file is missing.",
            )

        logger.info(f"Setting permissions 0o600 on {PRIVATE_KEY}")
        os.chmod(PRIVATE_KEY, 0o600)

        # Replace the fixed comment in the public key with the validated email.
        # This is pure Python string manipulation — safe_email never touches a
        # subprocess or filesystem path.
        pub_key_text = PUBLIC_KEY.read_text().strip()
        key_parts = pub_key_text.split(
            " ", 2
        )  # ["ssh-ed25519", "<base64>", "<comment>"]
        key_parts[2] = safe_email
        PUBLIC_KEY.write_text(" ".join(key_parts) + "\n")

        content = PUBLIC_KEY.read_text().strip()
        logger.info("Public key read successfully returning result.")
        return {"success": True, "public_key": content}

    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode() if e.stderr else "Unknown error"
        logger.error(f"ssh-keygen failed: {error_msg}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate SSH key: {error_msg}"
        ) from e
    except Exception as e:
        logger.error(f"An unexpected error occurred during key generation: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {str(e)}"
        ) from e


@router.get("/access/users", response_model=list[RoleAssignmentResponse])
async def list_access_users():
    return [
        RoleAssignmentResponse(**item)
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
        valid_roles = ", ".join(
            f"{role} ({label})" for role, label in ROLE_LABELS.items()
        )
        raise HTTPException(
            status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}."
        )

    try:
        assignment = access_service.upsert_user_role(
            email=email, role=normalized_role, updated_by=user.email
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return RoleAssignmentResponse(**assignment)


@router.get("/datasource-zip")
async def download_datasource_zip(request: Request):
    """Build and stream the KiCAD PCM datasource ZIP for this Prism instance."""
    base_url = str(request.base_url).rstrip("/")

    metadata = {
        "name": "KiCAD Prism Remote Symbols",
        "description": "Datasource package for the KiCAD Prism remote symbol provider.",
        "description_full": (
            "Installs a datasource descriptor for KiCAD Prism. After installing the ZIP in "
            "PCM, add the metadata URL to Remote Symbol Settings if KiCad does not auto-register it."
        ),
        "identifier": "org.kicad-prism.remote-symbols",
        "type": "plugin",
        "author": {
            "name": "KiCAD Prism",
            "contact": {"url": "https://github.com/krishna-swaroop/KiCAD-Prism"},
        },
        "license": "Apache-2.0",
        "resources": {
            "server": base_url,
            "instructions": (
                "Install from file, then use the KiCad Remote Symbol Settings dialog to add "
                f"{base_url} as a provider if it is not auto-registered."
            ),
        },
        "versions": [
            {
                "kicad_version": "8.0.0",
                "version": "0.1.0",
                "status": "stable",
                "platforms": ["windows", "macos", "linux"],
            }
        ],
    }

    resource = {
        "metadata_url": base_url,
        "description": (
            f"Add {base_url} as a Remote Symbol provider in KiCad eeschema settings. "
            f"KiCad discovers the provider at {base_url}/.well-known/kicad-remote-provider automatically."
        ),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))
        zf.writestr("resources/remote_symbol.json", json.dumps(resource, indent=2))
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="kicad-prism-remote-symbols.zip"'
        },
    )


@router.delete("/access/users/{email}")
async def delete_access_user(
    email: str, user: AuthenticatedUser = Depends(require_admin)
):
    try:
        deleted = access_service.delete_user_role(email=email, updated_by=user.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not deleted:
        raise HTTPException(status_code=404, detail="User role assignment not found")

    return {"deleted": email.strip().lower()}
