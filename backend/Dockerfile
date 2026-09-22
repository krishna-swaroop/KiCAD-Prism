# Backend Dockerfile
ARG KICAD_MONKEY_VARIANT=kicad-monkey-upstream
ARG NODE_VERSION=22.23.2
ARG PYTHON_VERSION=3.12.13
ARG RUST_VERSION=1.95.0
ARG UV_VERSION=0.12.5

# KiCad CLI runtime. Release/source defaults are reproducible and AMD64-only.
# Compose supplies the platform from its environment file. Select a different
# base image explicitly with `docker compose build --build-arg`; it is not a
# runtime environment value.
ARG KICAD_BASE_PLATFORM=linux/amd64
ARG KICAD_BASE_IMAGE=kicad/kicad:10.0.4@sha256:ee71e88396f8563168eb1ef282cda9ff2670fe86a677c63dd78b35e3d464454c

FROM --platform=${KICAD_BASE_PLATFORM} node:${NODE_VERSION}-bookworm-slim AS remote-provider-panel
WORKDIR /panel
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build:panel

FROM --platform=${KICAD_BASE_PLATFORM} rust:${RUST_VERSION}-bookworm AS prism-kicad-native-builder
ARG TARGETARCH
ARG GEOMETER_SDK_TAG=v2026-09-19
ARG GEOMETER_SDK_VERSION=2026.9.19
ARG GEOMETER_SDK_LINUX_AMD64_SHA256=ff2ef8615c5868de346b5e695bdea207fa5e379bb63e3f95148896ccdd0d8faa
ARG GEOMETER_SDK_LINUX_ARM64_SHA256=c0f92e5f11c254940d2e1bcce44af777db21bf6c46bd17a724aa3df5413684d1
WORKDIR /build/prism-kicad-native
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*
RUN case "${TARGETARCH}" in \
      amd64) sdk_arch=x64; sdk_sha="${GEOMETER_SDK_LINUX_AMD64_SHA256}" ;; \
      arm64) sdk_arch=arm64; sdk_sha="${GEOMETER_SDK_LINUX_ARM64_SHA256}" ;; \
      *) echo "Unsupported Geometer SDK architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && sdk_archive="geometer-sdk-${GEOMETER_SDK_VERSION}-linux-${sdk_arch}.zip" \
    && curl --fail --location --retry 3 \
      "https://github.com/wavenumber-eng/geometer/releases/download/${GEOMETER_SDK_TAG}/${sdk_archive}" \
      --output "/tmp/${sdk_archive}" \
    && echo "${sdk_sha}  /tmp/${sdk_archive}" | sha256sum --check - \
    && unzip -q "/tmp/${sdk_archive}" -d /opt/geometer-sdk \
    && rm "/tmp/${sdk_archive}"
ENV GEOMETER_SDK_DIR=/opt/geometer-sdk
COPY kicad-prism-viewer/native/prism-kicad-native/Cargo.toml \
    kicad-prism-viewer/native/prism-kicad-native/Cargo.lock \
    kicad-prism-viewer/native/prism-kicad-native/rust-toolchain.toml \
    kicad-prism-viewer/native/prism-kicad-native/build.rs ./
COPY kicad-prism-viewer/native/prism-kicad-native/src ./src
RUN rustup component add rustfmt clippy
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/prism-kicad-native/target \
    cargo fmt --check \
    && cargo test --release --locked \
    && cargo clippy --release --locked -- -D warnings \
    && cargo build --release --locked \
    && cp target/release/prism-kicad-native /tmp/prism-kicad-native

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv-bin

FROM --platform=${KICAD_BASE_PLATFORM} ${KICAD_BASE_IMAGE} AS prism-runtime
# Redeclare so the value that satisfied FROM is available in this stage and can
# be baked into the image as the Release Studio executor identity.
ARG KICAD_BASE_IMAGE
ARG PYTHON_VERSION
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

COPY --from=uv-bin /uv /uvx /usr/local/bin/

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
# Pin the interpreter rather than inheriting the base image's system Python.
# The KiCad 10.0.4 base ships 3.13; Prism's dependency set -- kicad-monkey and
# kicad-cruncher in particular -- is validated on 3.12, so the venv selects it
# explicitly and a base-image Python bump cannot silently move it.
RUN uv python install ${PYTHON_VERSION} \
    && uv venv /app/venv --python ${PYTHON_VERSION}
ENV PATH="/app/venv/bin:$PATH"
ENV PRISM_SEMANTIC_VIEWER_REPO=/opt/kicad-prism-viewer
ENV PYTHONPATH=/opt/kicad-prism-viewer
ENV PRISM_CLIPPER2_LIBRARY=/usr/local/lib/libprism_clipper2.so
ENV PRISM_KICAD_NATIVE_PATH=/usr/local/bin/prism-kicad-native

# API, workers, Release Studio, and the semantic viewer share one fully resolved
# runtime. Installing two independently resolved files into this venv was the
# source of Monkey/Cruncher drift between CI, hosts, and images.
COPY requirements/runtime.lock /app/requirements/runtime.lock
COPY .python-version .node-version /app/
COPY scripts/verify_dependency_identity.py /app/scripts/verify_dependency_identity.py
RUN uv pip sync --python /app/venv/bin/python /app/requirements/runtime.lock \
    && python /app/scripts/verify_dependency_identity.py --python-only

COPY kicad-prism-viewer/package*.json /opt/kicad-prism-viewer/
# The universal lock carries Sharp's optional binaries for every supported
# platform; npm selects the image architecture during the clean install.
# A second unversioned `npm install sharp` used to move the image beyond the
# reviewed lock and is deliberately forbidden.
RUN cd /opt/kicad-prism-viewer && npm ci --include=optional

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
COPY --from=prism-kicad-native-builder \
    /tmp/prism-kicad-native \
    /usr/local/bin/prism-kicad-native
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

# The default image keeps the release pair from requirements/runtime.lock.
FROM prism-runtime AS kicad-monkey-upstream
ENV PRISM_KICAD_MONKEY_SOURCE=pypi-release

# Opt-in development target. The named context is supplied only by
# docker-compose.local-kicad-monkey.yml, so normal deployments do not need a
# sibling kicad-monkey checkout.
FROM prism-runtime AS kicad-monkey-local
# Modern upstream owns Monkey and Cruncher in one monorepo. A local development
# image replaces both together from that checkout; mixing a local Monkey with
# whichever Cruncher happened to be newest on PyPI is forbidden.
ARG LOCAL_WN_GEOMETER_VERSION=2026.9.11
RUN --mount=from=kicad_toolchain,source=/,target=/tmp/kicad-toolchain,ro \
    test -f /tmp/kicad-toolchain/packages/kicad_cruncher/pyproject.toml \
    && uv pip install --no-cache-dir --reinstall \
        "wn-geometer==${LOCAL_WN_GEOMETER_VERSION}" \
    && uv pip install --no-cache-dir --no-deps --reinstall \
        /tmp/kicad-toolchain \
        /tmp/kicad-toolchain/packages/kicad_cruncher \
    && uv pip check --python /app/venv/bin/python \
    && python - <<'PY'
import pathlib, sys, kicad_monkey
installed = pathlib.Path(kicad_monkey.__file__).parent
mounted = pathlib.Path("/tmp/kicad-toolchain/src/py/kicad_monkey")
for name in sorted(p.name for p in mounted.glob("*.py")):
    if not (installed / name).exists():
        sys.exit(f"local working tree not installed: {name} is missing from {installed}")
print(f"kicad-monkey {kicad_monkey.__version__} installed from the mounted working tree")
PY
ENV PRISM_KICAD_MONKEY_SOURCE=local-monorepo

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
