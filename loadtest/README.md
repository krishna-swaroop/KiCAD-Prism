# Remote Panel Loadtest

Separate Docker container that simulates concurrent KiCad-like users against the already-running Prism stack.

## What it hits

1. **Setup:** page through every category and index all released components (id + MPN)
2. Panel discovery / static assets
3. Each user repeatedly picks a uniformly random MPN and searches for it
4. Part detail + symbol/footprint previews
5. Place path: part manifest → signed asset downloads
6. ~20% inline-bundle fallback place path

## Run

```bash
./scripts/bootstrap_remote_panel_loadtest_client.sh
docker compose -f docker-compose.loadtest.yml up --build --abort-on-container-exit
```

Report: `loadtest/results/remote-panel-load.json`
