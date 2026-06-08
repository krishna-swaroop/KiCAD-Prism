# Backend Dockerfile
# KiCad CLI runtime. Keep this aligned with the newest KiCad file format Prism imports.
ARG KICAD_BASE_PLATFORM=linux/amd64

FROM node:22-bookworm-slim AS remote-provider-panel
WORKDIR /panel
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build:panel

FROM python:3.12-slim-bookworm AS python-runtime

FROM --platform=${KICAD_BASE_PLATFORM} kicad/kicad:10.0.0
ARG KICAD_LIBRARY_UTILS_REF=7124a92887b2280f85cfe2d5abb216062978d5e1

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/local/bin:${PATH}"

USER root

# kicad-monkey currently publishes wheels for Python >=3.11,<3.13.
# The KiCad 10 base image can provide Python 3.13, so copy a supported
# Python 3.12 runtime while keeping the KiCad CLI/runtime from the base image.
COPY --from=python-runtime /usr/local /usr/local

# ─── System dependencies ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Optional KiCad Library Convention checker used by the component catalog health view.
RUN git clone --depth 1 https://gitlab.com/kicad/libraries/kicad-library-utils.git /opt/kicad-library-utils \
    && cd /opt/kicad-library-utils \
    && git fetch --depth 1 origin ${KICAD_LIBRARY_UTILS_REF} \
    && git checkout FETCH_HEAD

# ─── Backend setup ───────────────────────────────────────────────────
WORKDIR /app

COPY backend/requirements.txt .
RUN python3.12 -m pip install --ignore-installed --no-cache-dir -r requirements.txt

COPY backend/ .
COPY scripts/ scripts/
COPY --from=remote-provider-panel /panel/dist/remote_provider/ /app/app/static/remote_provider/

# Expose backend port
EXPOSE 8000

# Run the application. Keep workers configurable because each worker runs startup hooks.
CMD ["sh", "-c", "python3.12 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4}"]
