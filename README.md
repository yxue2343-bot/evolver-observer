# evolver-observer

Practical realtime dashboard for your local Evolver runtime + EvoMap node status.

## What it shows

- Local loop process status (running/pid)
- EvoMap node online status and published/promoted counts
- Last run / last solidify summary
- Recent log-derived actions (task claim, heartbeat, autopublish, backoff)
- Recent `EvolutionEvent` table
- Live log tail

## Quick start

```bash
cd /Users/xyt/project/evolver-observer
npm install
npm run start
```

Open: `http://127.0.0.1:8787`

## Environment variables

- `PORT` (default: `8787`)
- `EVOLVER_ROOT` (default: `/Users/xyt/project/evolver`)
- `EVOLUTION_DIR` (default: `/Users/xyt/memory/evolution`)
- `EVOLVER_LOG` (default: `/Users/xyt/.openclaw/workspace/logs/evolver_official.log`)
- `EVOMAP_NODE_ID` (default: `node_97e143de9fe2`)
- `EVOMAP_BASE` (default: `https://evomap.ai`)
- `OBSERVER_USER` (optional, enables Basic Auth when set with `OBSERVER_PASS`)
- `OBSERVER_PASS` (optional, enables Basic Auth when set with `OBSERVER_USER`)

## Run in background (macOS)

You can use your own LaunchAgent or run:

```bash
nohup node server.js > /Users/xyt/.openclaw/workspace/logs/evolver_observer.log 2>&1 &
```

## Fixed public URL (GitHub Pages)

This repo is configured for GitHub Pages via Actions.
Public URL:

- `https://yxue2343-bot.github.io/evolver-observer/`

How it works:

- Local dashboard API stays on `http://127.0.0.1:8787/api/dashboard`
- `scripts/export_status.js` snapshots local runtime state into `public/status/latest.json`
- `scripts/publish_status.sh` commits + pushes snapshot updates
- GitHub Actions deploys `public/` to Pages on every push

## Auto publish snapshot (macOS)

LaunchAgent:

- `/Users/xyt/Library/LaunchAgents/com.xyt.evolver-observer-publisher.plist`

It runs every 60s and updates `public/status/latest.json` when data changes.

## Notes

- This dashboard is read-only. It does not mutate Evolver state.
- UI refresh interval is 10 seconds.
- On GitHub Pages, data is near-realtime (depends on snapshot push + pages deploy latency).
