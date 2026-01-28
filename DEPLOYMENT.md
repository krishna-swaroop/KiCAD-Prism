# Deployment Guide

This guide provides instructions for setting up KiCAD Prism. The **easiest and recommended** way is using Docker.

---

## 1. Quick Start: Docker Deployment (Recommended)

Docker packages both the frontend and the backend (with `kicad-cli` v9 pre-installed) into a portable environment. This works on Windows, macOS (including Apple Silicon), and Linux.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/krishna-swaroop/KiCAD-Prism.git
cd KiCAD-Prism

# 2. Start the platform
docker compose up -d --build
```

> [!TIP]
> `docker compose up -d` will automatically build the images the first time. Using the `--build` flag ensures that any local changes to the `Dockerfile` or source code are re-built into the images.

Access the UI at: **`http://localhost`**

### Volume Mapping & Persistence

By default, Docker creates a `data` directory in the repository root to store persistent data:

- **`./data/projects`**: This is where your KiCAD repositories are stored.
- **Data Survival**: Your projects remain available even if you stop or update the containers.
- **Manual Import**: You can clone existing KiCAD project repositories into `./data/projects` on your host machine, and they will appear in the dashboard.

---

## 2. Environment Configuration

For Docker deployments, you **must** create a `.env` file in the **root directory** of the project (where `docker-compose.yml` is located).

### Example .env File

Place this at the root of the `KiCAD-Prism/` directory:

```bash
# --- .env (Project Root) ---

# [AUTH] Force authentication toggle
# Set to 'false' for public gallery mode
AUTH_ENABLED=true

# [AUTH] Google OAuth Configuration
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com

# [AUTH] Access Control
ALLOWED_DOMAINS_STR=yourcompany.com
ALLOWED_USERS_STR=admin@yourcompany.com

# [CONFIG] Development Mode
# Set to 'false' for production (enforces login)
DEV_MODE=false

# [GIT] Private Repository Access (Optional)
# Enter your GitHub Personal Access Token (classic) to enable 
# Sync, Push, and Import for private/organizational repos.
GITHUB_TOKEN=ghp_your_secret_token_here
```

### Accessing Private/Organizational Repos

If you need KiCAD Prism to interact with private repositories:

1. Generate a **Personal Access Token (classic)** on GitHub with the `repo` scope.
2. If using an Organizational repo, ensure you click **"Configure SSO"** next to the token and authorize your organization.
3. Add the token to your `.env` as shown above.
4. Restart your containers: `docker compose up -d`.

The backend will automatically configure Git to use this token for all `https://github.com` operations.

---

## 3. Local Development (Manual Setup)

If you want to contribute to the code or run without Docker, follow these steps.

### Prerequisites

1. **Python 3.10+**
2. **Node.js v18+ & NPM**
3. **KiCAD 9.0** (with `kicad-cli` in your PATH)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create backend .env
cp .env.example .env

# Run server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install

# Create frontend .env
cp .env.example .env

# Run dev server
npm run dev
```

> **Note**: For local development, `.env` files must be placed inside the `backend/` and `frontend/` directories respectively.

---

## 4. Authentication Setup (Google OAuth)

KiCAD Prism supports optional Google Sign-in with domain restrictions.

### Configuring Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create an **OAuth 2.0 Client ID** (Web application type)
3. Add these Authorized JavaScript Origins:
   - Development: `http://localhost:5173`
   - Production/Docker: `http://localhost`
4. Copy the **Client ID** to your `.env` file.

### Configuration Modes

| Mode | Behavior | Configuration |
|------|----------|---------------|
| **Public Gallery** | No login required | `AUTH_ENABLED=false` |
| **Development** | Login with "Dev Bypass" | `DEV_MODE=true` |
| **Production** | Strict Google Login | `DEV_MODE=false` |

---

## 5. Troubleshooting

| Issue | Solution |
|-------|----------|
| **Docker pull fails** | Check your internet connection and ensure you are using the correct image tag (e.g., `kicad/kicad:9.0.0-arm64` for Mac M1/M2). |
| **Visual Diff Empty** | Check `docker logs kicad-prism-backend` to ensure `kicad-cli` is running correctly. |
| **Persistence Issues** | Ensure the `./data/projects` folder has write permissions for the Docker user. |
| **Auth Rejection** | Verify that `GOOGLE_CLIENT_ID` matches in both backend and frontend configs. |
| **Sync Fails** | Ensure the server/container has network access to the remote Git repository. |
