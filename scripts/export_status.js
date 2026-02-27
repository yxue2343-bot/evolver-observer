#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const API_URL = process.env.OBSERVER_API_URL || 'http://127.0.0.1:8787/api/dashboard';
const OUT_FILE = process.env.OBSERVER_STATUS_FILE || path.join(__dirname, '..', 'public', 'status', 'latest.json');

async function main() {
  const res = await fetch(API_URL, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();

  // Keep public snapshot concise and non-sensitive.
  const snapshot = {
    now: raw.now || new Date().toISOString(),
    status: raw.status || null,
    freshness: raw.freshness || null,
    metrics: raw.metrics || [],
    process: raw.process
      ? {
          running: !!raw.process.running,
          pid: raw.process.pid || null,
        }
      : null,
    node: raw.node
      ? {
          ok: !!raw.node.ok,
          online: raw.node.online,
          status: raw.node.status || null,
          totalPublished: raw.node.totalPublished ?? null,
          totalPromoted: raw.node.totalPromoted ?? null,
          lastSeenAt: raw.node.lastSeenAt || null,
        }
      : null,
    runtime: raw.runtime || null,
    lastRun: raw.lastRun || null,
    lastSolidify: raw.lastSolidify || null,
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    assets: raw.assets || { genes: [], capsules: [], events: [], candidates: [] },
    publishedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  process.stdout.write(`${OUT_FILE}\n`);
}

main().catch((err) => {
  console.error(`[export_status] ${err.message || err}`);
  process.exit(1);
});
