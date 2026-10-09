FROM node:22.23.2-bookworm-slim
ARG TARGETARCH
# Exact CLI version; npm validates the tarball against its registry integrity.
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && case "$TARGETARCH" in amd64) arch=x64;; arm64) arch=arm64;; *) exit 1;; esac \
    && npm install --prefix /opt/opencode --ignore-scripts --no-audit --no-fund "@opencode/cli-linux-$arch@2.0.20" \
    && ln -s "/opt/opencode/node_modules/@opencode/cli-linux-$arch/bin/opencode" /usr/local/bin/opencode
WORKDIR /app/agent/service
COPY agent/service ./
COPY agent/skills /app/agent/skills
RUN mkdir -p /agent-workspaces && chown node:node /agent-workspaces
USER node
ENV PRISM_AGENT_WORKSPACE_ROOT=/agent-workspaces
ENV XDG_DATA_HOME=/agent-workspaces/.opencode-data
EXPOSE 4097
CMD ["node", "server.mjs"]
