FROM python:3.12-slim

WORKDIR /loadtest

RUN pip install --no-cache-dir aiohttp==3.11.18

COPY scripts/benchmark_remote_panel_load.py /loadtest/benchmark_remote_panel_load.py
COPY scripts/benchmark_concurrent_users.py /loadtest/benchmark_concurrent_users.py
COPY loadtest/entrypoint.sh /loadtest/entrypoint.sh

RUN chmod +x /loadtest/entrypoint.sh

ENV PRISM_BASE_URL=http://frontend \
    PRISM_LOADTEST_USERS=20 \
    PRISM_LOADTEST_DURATION=180 \
    PRISM_LOADTEST_SCOPE="remote_symbols.read api:read" \
    PRISM_LOADTEST_OUTPUT=/results/remote-panel-load.json

VOLUME ["/results"]

ENTRYPOINT ["/loadtest/entrypoint.sh"]
