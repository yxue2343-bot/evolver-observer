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

## Run in background (macOS)

You can use your own LaunchAgent or run:

```bash
nohup node server.js > /Users/xyt/.openclaw/workspace/logs/evolver_observer.log 2>&1 &
```

## Notes

- This dashboard is read-only. It does not mutate Evolver state.
- Data refresh interval on UI is 15 seconds.
