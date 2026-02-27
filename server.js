const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();

const PORT = Number(process.env.PORT || 8787);
const EVOLVER_ROOT = process.env.EVOLVER_ROOT || '/Users/xyt/project/evolver';
const EVOLUTION_DIR = process.env.EVOLUTION_DIR || '/Users/xyt/memory/evolution';
const EVOLVER_LOG = process.env.EVOLVER_LOG || '/Users/xyt/.openclaw/workspace/logs/evolver_official.log';
const NODE_ID = process.env.EVOMAP_NODE_ID || 'node_97e143de9fe2';
const EVOMAP_BASE = (process.env.EVOMAP_BASE || 'https://evomap.ai').replace(/\/+$/, '');

const ASSETS_DIR = path.join(EVOLVER_ROOT, 'assets', 'gep');
const OBSERVER_USER = process.env.OBSERVER_USER || '';
const OBSERVER_PASS = process.env.OBSERVER_PASS || '';
const AUTH_ENABLED = Boolean(OBSERVER_USER && OBSERVER_PASS);

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Basic realm="evolver-observer"');
  res.status(401).send('Authentication required');
}

function authMiddleware(req, res, next) {
  if (!AUTH_ENABLED) return next();

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return unauthorized(res);

  try {
    const raw = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = raw.indexOf(':');
    const user = idx >= 0 ? raw.slice(0, idx) : raw;
    const pass = idx >= 0 ? raw.slice(idx + 1) : '';
    if (user === OBSERVER_USER && pass === OBSERVER_PASS) return next();
    return unauthorized(res);
  } catch (_e) {
    return unauthorized(res);
  }
}

function safeReadJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function readTailLines(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch (_e) {
    return [];
  }
}

function countJsonl(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    return lines.length;
  } catch (_e) {
    return 0;
  }
}

function parseJsonlTail(filePath, limit) {
  try {
    const lines = readTailLines(filePath, limit);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_e) {
    return [];
  }
}

function processStatus() {
  try {
    const cmd = `pgrep -af "${EVOLVER_ROOT}/index.js --loop"`;
    const out = execSync(cmd, { encoding: 'utf8' }).trim();
    const first = out.split('\n').filter(Boolean)[0] || '';
    const pid = first.split(/\s+/)[0] || null;
    return {
      running: Boolean(first),
      pid: pid && /^\d+$/.test(pid) ? Number(pid) : null,
      command: first,
    };
  } catch (_e) {
    return { running: false, pid: null, command: null };
  }
}

function parseAssets() {
  const genesJson = safeReadJson(path.join(ASSETS_DIR, 'genes.json'));
  const capsulesJson = safeReadJson(path.join(ASSETS_DIR, 'capsules.json'));

  const genesCount = Array.isArray(genesJson)
    ? genesJson.length
    : genesJson && Array.isArray(genesJson.genes)
      ? genesJson.genes.length
      : 0;

  const capsulesCount = Array.isArray(capsulesJson)
    ? capsulesJson.length
    : capsulesJson && Array.isArray(capsulesJson.capsules)
      ? capsulesJson.capsules.length
      : 0;

  const eventsCount = countJsonl(path.join(ASSETS_DIR, 'events.jsonl'));
  const candidatesCount = countJsonl(path.join(ASSETS_DIR, 'candidates.jsonl'));

  return { genesCount, capsulesCount, eventsCount, candidatesCount };
}

function summarizeLogLines(lines) {
  const actions = [];
  for (const line of lines) {
    if (line.includes('[TaskReceiver]')) actions.push({ type: 'task', text: line });
    else if (line.includes('[TaskComplete]')) actions.push({ type: 'task_complete', text: line });
    else if (line.includes('[AutoPublish]')) actions.push({ type: 'publish', text: line });
    else if (line.includes('[AntiPatternPublish]')) actions.push({ type: 'anti_pattern', text: line });
    else if (line.includes('[Heartbeat]')) actions.push({ type: 'heartbeat', text: line });
    else if (line.includes('[Evolver] System load')) actions.push({ type: 'backoff', text: line });
    else if (line.includes('[DormantHypothesis]')) actions.push({ type: 'dormant', text: line });
  }
  return actions.slice(-30);
}

async function fetchNodeStatus() {
  const url = `${EVOMAP_BASE}/a2a/nodes/${encodeURIComponent(NODE_ID)}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      ok: true,
      online: !!data.online,
      status: data.status || null,
      reputation: data.reputation_score ?? null,
      totalPublished: data.total_published ?? null,
      totalPromoted: data.total_promoted ?? null,
      lastSeenAt: data.last_seen_at || null,
      survivalStatus: data.survival_status || null,
      raw: data,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      online: null,
      status: null,
      reputation: null,
      totalPublished: null,
      totalPromoted: null,
      lastSeenAt: null,
      survivalStatus: null,
      raw: null,
    };
  }
}

function latestEvolutionEvents(limit = 20) {
  const events = parseJsonlTail(path.join(ASSETS_DIR, 'events.jsonl'), 300)
    .filter((e) => e && e.type === 'EvolutionEvent')
    .slice(-limit)
    .reverse()
    .map((e) => ({
      id: e.id || null,
      at: e?.meta?.at || e.timestamp || null,
      intent: e.intent || null,
      score: e?.outcome?.score ?? null,
      outcome: e?.outcome?.status || null,
      capsuleId: e.capsule_id || null,
      signals: Array.isArray(e.signals) ? e.signals.slice(0, 8) : [],
      genesUsed: Array.isArray(e.genes_used) ? e.genes_used : [],
    }));

  return events;
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/dashboard', async (_req, res) => {
  const solidifyState = safeReadJson(path.join(EVOLUTION_DIR, 'evolution_solidify_state.json'));
  const personalityState = safeReadJson(path.join(EVOLUTION_DIR, 'personality_state.json'));
  const dormant = safeReadJson(path.join(EVOLUTION_DIR, 'dormant_hypothesis.json'));
  const process = processStatus();
  const assets = parseAssets();
  const logLines = readTailLines(EVOLVER_LOG, 500);
  const node = await fetchNodeStatus();

  res.json({
    now: new Date().toISOString(),
    config: {
      evolverRoot: EVOLVER_ROOT,
      evolutionDir: EVOLUTION_DIR,
      logPath: EVOLVER_LOG,
      nodeId: NODE_ID,
      evomapBase: EVOMAP_BASE,
    },
    process,
    node,
    assets,
    lastRun: solidifyState?.last_run || null,
    lastSolidify: solidifyState?.last_solidify || null,
    personality: personalityState || null,
    dormant: dormant || null,
    actions: summarizeLogLines(logLines),
    events: latestEvolutionEvents(20),
    logTail: logLines.slice(-200),
  });
});

app.listen(PORT, () => {
  console.log(`[evolver-observer] listening on http://0.0.0.0:${PORT}`);
});
