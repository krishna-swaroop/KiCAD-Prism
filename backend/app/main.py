from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.comments import router as comments_router
from app.api.diff import router as diff_router
from app.api.settings import router as settings_router
from app.api.folders import router as folders_router
from app.services.git_service import router as git_router
from app.services.comments_store_service import initialize_comments_store
from app.core.config import settings
import subprocess
import os
from pathlib import Path
from contextlib import asynccontextmanager

import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def configure_git():
    """Configure Git with GITHUB_TOKEN if available."""
    if settings.GITHUB_TOKEN:
        logger.info(f"Configuring Git to use GITHUB_TOKEN...")
        try:
            # git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
            token_url = f"https://{settings.GITHUB_TOKEN}@github.com/"
            subprocess.run(
                ["git", "config", "--global", f"url.{token_url}.insteadOf", "https://github.com/"],
                check=True
            )
            logger.info("Git successfully configured with token injection.")
        except Exception as e:
            logger.error(f"Failed to configure Git with token: {e}")

def scan_known_hosts():
    """Scan and add GitHub/GitLab to known_hosts if missing."""
    ssh_dir = Path.home() / ".ssh"
    known_hosts = ssh_dir / "known_hosts"
    hosts = ["github.com", "gitlab.com"]
    
    # Ensure known_hosts exists
    if not known_hosts.exists():
        try:
            known_hosts.touch(mode=0o644)
        except Exception as e:
            logger.error(f"Failed to create known_hosts file: {e}")
            return

    for host in hosts:
        try:
            # Check if host is already known using ssh-keygen -F (Find)
            # This checks hashed hosts too
            result = subprocess.run(
                ["ssh-keygen", "-F", host], 
                capture_output=True
            )
            
            if result.returncode != 0:
                logger.info(f"Host {host} not found in known_hosts. Scanning...")
                # Scan and append to known_hosts
                scan = subprocess.run(
                    ["ssh-keyscan", "-H", host], 
                    capture_output=True, 
                    text=True
                )
                if scan.returncode == 0 and scan.stdout:
                    with open(known_hosts, "a") as f:
                        f.write(scan.stdout)
                    logger.info(f"Successfully added {host} to known_hosts.")
                else:
                    logger.warning(f"Failed to scan {host}. Error: {scan.stderr}")
            else:
                logger.debug(f"Host {host} already in known_hosts.")
                
        except Exception as e:
            logger.error(f"Error checking/scanning host {host}: {e}")

def ensure_ssh_dir():
    """Ensure ~/.ssh exists and has correct permissions."""
    ssh_dir = Path.home() / ".ssh"
    try:
        ssh_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(ssh_dir, 0o700)
        
        scan_known_hosts()
        
        logger.info("SSH directory configured correctly.")
    except Exception as e:
        logger.error(f"Failed to configure SSH directory: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_git()
    ensure_ssh_dir()
    initialize_comments_store()
    yield

app = FastAPI(title="KiCAD Prism API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(git_router, prefix="/api/git", tags=["git"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(comments_router, prefix="/api/projects", tags=["comments"])
app.include_router(diff_router, prefix="/api/projects", tags=["diff"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(folders_router, prefix="/api/folders", tags=["folders"])
