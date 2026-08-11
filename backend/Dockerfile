# Backend Dockerfile
ARG KICAD_MONKEY_VARIANT=kicad-monkey-upstream

# KiCad CLI runtime. Release/source defaults are reproducible and AMD64-only.
# Compose supplies the platform from its environment file. Select a different
# base image explicitly with `docker compose build --build-arg`; it is not a
# runtime environment value.
ARG KICAD_BASE_PLATFORM=linux/amd64
ARG KICAD_BASE_IMAGE=kicad/kicad:10.0.4@sha256:ee71e88396f8563168eb1ef282cda9ff2670fe86a677c63dd78b35e3d464454c

FROM --platform=${KICAD_BASE_PLATFORM} node:22-bookworm-slim AS remote-provider-panel
WORKDIR /panel
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build:panel

FROM --platform=${KICAD_BASE_PLATFORM} ${KICAD_BASE_IMAGE} AS prism-runtime
# Redeclare so the value that satisfied FROM is available in this stage and can
# be baked into the image as the Release Studio executor identity.
ARG KICAD_BASE_IMAGE
ARG KICAD_LIBRARY_UTILS_REF=7124a92887b2280f85cfe2d5abb216062978d5e1
LABEL prism.release.kicad_base_image="${KICAD_BASE_IMAGE}"

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

USER root

# ─── System dependencies ────────────────────────────────────────────
# openssh-client provides ssh (which git needs for any ssh:// or git@host
# remote) and ssh-keyscan (used to read a host key before pinning it). Without
# it the image could only ever clone over HTTPS, and reading a host key failed
# with a bare "No such file or directory: 'ssh-keyscan'".
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    git \
    openssh-client \
    g++ \
    cmake \
    make \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5.18 /uv /uvx /usr/local/bin/

# Reuse the pinned Node runtime for the isolated WebGPU asset compiler.
COPY --from=remote-provider-panel /usr/local/bin/node /usr/local/bin/node
COPY --from=remote-provider-panel /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Optional KiCad Library Convention checker used by the component catalog health view.
RUN git clone --depth 1 https://gitlab.com/kicad/libraries/kicad-library-utils.git /opt/kicad-library-utils \
    && cd /opt/kicad-library-utils \
    && git fetch --depth 1 origin ${KICAD_LIBRARY_UTILS_REF} \
    && git checkout FETCH_HEAD

# ─── Backend setup ───────────────────────────────────────────────────
WORKDIR /app

ENV UV_NO_CACHE=1
RUN uv python install 3.12 \
    && uv venv /app/venv --python 3.12
ENV PATH="/app/venv/bin:$PATH"
ENV PRISM_SEMANTIC_VIEWER_REPO=/opt/kicad-prism-viewer
ENV PYTHONPATH=/opt/kicad-prism-viewer
ENV PRISM_CLIPPER2_LIBRARY=/usr/local/lib/libprism_clipper2.so

COPY backend/requirements.txt .
RUN uv pip install --no-cache-dir -r requirements.txt

# Install generator dependencies independently from the API requirements.
COPY kicad-prism-viewer/requirements-runtime.txt /opt/kicad-prism-viewer/
RUN uv pip install --no-cache-dir -r /opt/kicad-prism-viewer/requirements-runtime.txt

COPY kicad-prism-viewer/package*.json /opt/kicad-prism-viewer/
# package-lock optional deps may pin the wrong CPU arch when the image platform changes.
RUN cd /opt/kicad-prism-viewer && npm ci --include=optional \
    && ARCH="$(uname -m)" \
    && case "$ARCH" in aarch64|arm64) SHARP_CPU=arm64 ;; *) SHARP_CPU=x64 ;; esac \
    && npm install --include=optional --os=linux --cpu="${SHARP_CPU}" sharp

COPY kicad-prism-viewer /opt/kicad-prism-viewer
COPY scripts/build-prism-clipper2.sh /app/scripts/build-prism-clipper2.sh
RUN PRISM_VIEWER_ROOT=/opt/kicad-prism-viewer /app/scripts/build-prism-clipper2.sh \
    && ARCH="$(uname -m)" \
    && case "$ARCH" in aarch64|arm64) CLIPPER_ARCH=arm64 ;; *) CLIPPER_ARCH=x86_64 ;; esac \
    && cp "/opt/kicad-prism-viewer/native/prism-clipper2/linux-${CLIPPER_ARCH}/libprism_clipper2.so" \
        /usr/local/lib/libprism_clipper2.so
RUN cd /opt/kicad-prism-viewer && npm run build

COPY backend/ .
COPY scripts/ scripts/
COPY --from=remote-provider-panel /panel/dist/remote_provider/ /app/app/static/remote_provider/

# Stable on-disk identity for toolchain_digest / live CI. Written late so the
# expensive layers above stay cacheable when only executor identity changes.
RUN mkdir -p /etc/prism \
    && printf '%s\n' "${KICAD_BASE_IMAGE}" > /etc/prism/kicad-base-image \
    && chmod 0644 /etc/prism/kicad-base-image

# Expose backend port
EXPOSE 8000

# Run the application. Keep workers configurable because each worker runs startup hooks.
CMD ["sh", "-c", "/app/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4}"]

# The default image keeps the release pins from requirements-runtime.txt.
FROM prism-runtime AS kicad-monkey-upstream
ENV PRISM_KICAD_MONKEY_SOURCE=pypi-release

# Opt-in development target. The named context is supplied only by
# docker-compose.local-kicad-monkey.yml, so normal deployments do not need a
# sibling kicad-monkey checkout.
FROM prism-runtime AS kicad-monkey-local
# Install kicad-cruncher first, then put the working tree in last. Installing
# it the other way round quietly undid the whole point of this target:
# `--upgrade` re-resolved kicad-cruncher's dependency on kicad-monkey and
# pulled the newest release from PyPI straight over the local install, so the
# image ran published code while reporting
# PRISM_KICAD_MONKEY_SOURCE=local-working-tree.
#
# kicad-cruncher is deliberately unpinned. The two packages share a date-based
# scheme but not a release cadence — kicad-monkey 2026.7.28 shipped with no
# matching cruncher — so asking for the working tree's own version resolves to
# nothing and fails the build. cruncher depends on `kicad-monkey>=`, and the
# `uv pip check` below is what actually proves the mounted tree satisfies it.
#
# The final assertion fails the build rather than shipping an image whose
# kicad-monkey is not the one that was mounted.
RUN --mount=from=kicad_monkey,source=/,target=/tmp/kicad-monkey,ro \
    uv pip install --no-cache-dir --upgrade kicad-cruncher \
    && uv pip install --no-cache-dir --no-deps --reinstall /tmp/kicad-monkey \
    && uv pip check \
    && python - <<'PY'
import pathlib, sys, kicad_monkey
installed = pathlib.Path(kicad_monkey.__file__).parent
mounted = pathlib.Path("/tmp/kicad-monkey/src/py/kicad_monkey")
for name in sorted(p.name for p in mounted.glob("*.py")):
    if not (installed / name).exists():
        sys.exit(f"local working tree not installed: {name} is missing from {installed}")
print(f"kicad-monkey {kicad_monkey.__version__} installed from the mounted working tree")
PY
ENV PRISM_KICAD_MONKEY_SOURCE=local-working-tree

FROM ${KICAD_MONKEY_VARIANT} AS final
ARG PRISM_RELEASE=development
ARG PRISM_REVISION=unknown
ARG PRISM_BUILD_DATE=unknown
ENV PRISM_RELEASE=${PRISM_RELEASE}
ENV PRISM_REVISION=${PRISM_REVISION}
ENV PRISM_BUILD_DATE=${PRISM_BUILD_DATE}
LABEL org.opencontainers.image.title="KiCAD Prism backend" \
    org.opencontainers.image.version="${PRISM_RELEASE}" \
    org.opencontainers.image.revision="${PRISM_REVISION}" \
    org.opencontainers.image.created="${PRISM_BUILD_DATE}" \
    org.opencontainers.image.source="https://github.com/krishna-swaroop/KiCAD-Prism" \
    org.opencontainers.image.licenses="Apache-2.0"
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10 \
    CMD curl -fsS http://127.0.0.1:8000/api/health/ready >/dev/null || exit 1
