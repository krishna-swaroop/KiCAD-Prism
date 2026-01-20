# Deployment Guide

This guide provides instructions for setting up KiCAD Prism on a new machine.

## Prerequisites

1. **Python 3.10+**: Required for the backend.
2. **Node.js v18+ & NPM**: Required for the frontend.
3. **Git**: Required for project management and workflows.
4. **KiCAD 8.0 or 9.0**: Required for `kicad-cli` workflow execution.

---

## 1. Backend Setup (FastAPI)

Navigate to the `backend` directory:

```bash
cd backend
```

### Create Virtual Environment

```bash
python -m venv venv
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Configuration

Copy the example environment file and customize:

```bash
cp .env.example .env
```

The backend expects a directory named `project-database` to exist one level ABOVE the repository root:

```bash
# Example structure:
# /Users/name/Projects/
# ├── KiCAD-Prism/       (this repo)
# └── project-database/  (created by backend or manually)
```

### Running the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

By default, it runs on `http://localhost:8000`.

---

## 2. Frontend Setup (React + Vite)

Navigate to the `frontend` directory:

```bash
cd frontend
```

### Install Dependencies

```bash
npm install
```

### Configuration

Copy the example environment file and customize:

```bash
cp .env.example .env
```

### Running the Frontend

```bash
npm run dev
```

By default, it runs on `http://localhost:5173`. Make sure the backend is running so the proxy works.

---

## 3. Authentication Setup

KiCAD Prism supports optional Google Sign-in with domain restrictions.

### How to Turn ON Authentication

To enable authentication for your deployment:

1. **Backend**: Set `GOOGLE_CLIENT_ID` in `backend/.env` and set `DEV_MODE=False`.
2. **Frontend**: Set `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` to match the backend.
3. **Allowed Domains**: Configure `ALLOWED_DOMAINS_STR` in `backend/.env` with your organization's domains.

Once configured, the system will automatically show the login page and restrict access.

### Configuration Modes

### Option 1: Public Gallery (No Authentication)

The simplest setup - anyone can access the platform without signing in.

**Backend `.env`:**

```bash
GOOGLE_CLIENT_ID=
DEV_MODE=True
```

**Frontend `.env`:**

```bash
VITE_GOOGLE_CLIENT_ID=
```

### Option 2: Development Mode

Shows the Google Sign-in button with a "Dev Bypass" option for testing.

**Backend `.env`:**

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
DEV_MODE=True
ALLOWED_DOMAINS_STR=pixxel.co.in,spacepixxel.in
```

**Frontend `.env`:**

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Option 3: Production Mode

Full authentication required - only users from allowed domains can access.

**Backend `.env`:**

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
DEV_MODE=False
ALLOWED_DOMAINS_STR=pixxel.co.in,spacepixxel.in
```

**Frontend `.env`:**

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Setting Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application**
6. Configure authorized JavaScript origins:
   - Development: `http://localhost:5173`
   - Production: `https://your-domain.com`
7. Copy the **Client ID** to both backend and frontend `.env` files

### Managing Allowed Domains

To add or remove allowed domains, update the `ALLOWED_DOMAINS_STR` variable in the backend `.env`:

```bash
# Single domain
ALLOWED_DOMAINS_STR=pixxel.co.in

# Multiple domains (comma-separated)
ALLOWED_DOMAINS_STR=pixxel.co.in,spacepixxel.in,example.com
```

> **Note**: The domain is extracted from the user's email. For `user@pixxel.co.in`, the domain is `pixxel.co.in`.

---

## 4. Windows-Specific Instructions

If your host server is based on **Windows**, follow these additional steps:

### KiCAD CLI Path

The backend currently searches for `kicad-cli` in a standard macOS path. You may need to update the path in `backend/app/services/project_service.py`:

```python
# Locate this function in project_service.py
def _find_cli_path():
    # macOS path:
    # mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    
    # Windows path (example):
    windows_path = "C:\\Program Files\\KiCad\\9.0\\bin\\kicad-cli.exe"
    if os.path.exists(windows_path):
        return windows_path
    return "kicad-cli"
```

### Shell Execution

The workflows use `subprocess.Popen`. On Windows, ensure that `git` and `kicad-cli` are available in the System Environment Variables (PATH).

### Git Configuration

For the "Sync" and "Push to Remote" features to work, ensure the machine has Git credentials configured globally or via a credential manager:

```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## 5. Production Deployment

### Using Docker (Recommended)

A `docker-compose.yml` for production deployment:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - ALLOWED_DOMAINS_STR=${ALLOWED_DOMAINS_STR}
      - DEV_MODE=False
    volumes:
      - ./project-database:/app/project-database

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    environment:
      - VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
```

### Reverse Proxy (nginx)

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 6. Deploying on Local Network

To access KiCAD Prism from other devices on your local network (e.g., tablets, other computers):

### 1. Backend

Run with host set to `0.0.0.0` to listen on all interfaces:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

Run with the `--host` flag:

```bash
npm run dev -- --host
```

### 3. Accessing the App

Find your computer's local IP address (e.g., `192.168.1.x`) and access:

- **Frontend**: `http://192.168.1.x:5173`
- **Backend API**: `http://192.168.1.x:8000`

> **Note**: Ensure your firewall allows incoming connections on port 8000 and 5173.

---

## 7. Troubleshooting

| Issue | Solution |
|-------|----------|
| **CORS Issues** | Check `backend/app/main.py` to ensure the frontend's origin is allowed. |
| **Git Hangs** | The platform sets `GIT_TERMINAL_PROMPT=0` to prevent hangs. Check if the repository requires authentication. |
| **Missing Jobsets** | Ensure projects have an `Outputs.kicad_jobset` file for Workflows. |
| **Auth Config Errors** | Verify both frontend and backend have matching `GOOGLE_CLIENT_ID` values. |
| **Domain Rejection** | Check that the user's email domain is in `ALLOWED_DOMAINS_STR`. |
| **Sync Fails** | Ensure the server has read access to the remote repository. |
