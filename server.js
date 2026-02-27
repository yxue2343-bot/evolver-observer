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
const FILES = {
  genes: path.join(ASSETS_DIR, 'genes.json'),
  capsules: path.join(ASSETS_DIR, 'capsules.json'),
  events: path.join(ASSETS_DIR, 'events.jsonl'),
  candidates: path.join(ASSETS_DIR, 'candidates.jsonl'),
  solidify: path.join(EVOLUTION_DIR, 'evolution_solidify_state.json'),
  personality: path.join(EVOLUTION_DIR, 'personality_state.json'),
  dormant: path.join(EVOLUTION_DIR, 'dormant_hypothesis.json'),
  log: EVOLVER_LOG,
};

const OBSERVER_USER = process.env.OBSERVER_USER || '';
const OBSERVER_PASS = process.env.OBSERVER_PASS || '';
const AUTH_ENABLED = Boolean(OBSERVER_USER && OBSERVER_PASS);

const INTENT_ZH = {
  repair: '修复',
  optimize: '优化',
  innovate: '创新',
};

const CATEGORY_HELP_ZH = {
  repair: '用于修复错误、提升稳定性，减少失败和中断。',
  optimize: '用于提升效率和质量，让流程更稳、更快。',
  innovate: '用于探索新能力或新策略，扩展系统上限。',
  unknown: '用于沉淀经验，等待后续验证与固化。',
};

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

function fileMtimeIso(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return new Date(fs.statSync(p).mtimeMs).toISOString();
  } catch (_e) {
    return null;
  }
}

function isoToMs(v) {
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? t : null;
}

function maxIso(values) {
  let max = null;
  for (const v of values) {
    const ms = isoToMs(v);
    if (ms == null) continue;
    if (max == null || ms > max) max = ms;
  }
  return max == null ? null : new Date(max).toISOString();
}

function toArray(v, key) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v[key])) return v[key];
  return [];
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

function parseJsonlTail(filePath, limit) {
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
      command: first || null,
    };
  } catch (_e) {
    return { running: false, pid: null, command: null };
  }
}

function parseLogAction(line) {
  const msg = String(line || '');

  if (msg.includes('[Evolver] System load')) {
    const m = msg.match(/System load\s+([\d.]+)\s+exceeds max\s+([\d.]+)/i);
    const load = m ? m[1] : '?';
    const max = m ? m[2] : '?';
    return {
      key: 'backoff_load',
      level: 'warn',
      zh: `系统负载 ${load} 高于阈值 ${max}，本轮演化暂停并在 60 秒后重试。`,
    };
  }

  if (msg.includes('[Heartbeat] Connected to hub')) {
    return { key: 'heartbeat_connected', level: 'ok', zh: '已连上 EvoMap，心跳正常。' };
  }

  if (msg.includes('[Heartbeat] Registered with hub')) {
    return { key: 'heartbeat_registered', level: 'ok', zh: '已向 EvoMap 完成节点注册。' };
  }

  if (msg.includes('[TaskReceiver] Claimed task:')) {
    const m = msg.match(/Claimed task:\s+"([^"]+)"/);
    return {
      key: 'task_claimed',
      level: 'ok',
      zh: `已领取任务：${m ? m[1] : '（任务名未解析）'}。`,
    };
  }

  if (msg.includes('[TaskReceiver] Resuming task:')) {
    const m = msg.match(/Resuming task:\s+"([^"]+)"/);
    return {
      key: 'task_resuming',
      level: 'ok',
      zh: `继续处理已领取任务：${m ? m[1] : '（任务名未解析）'}。`,
    };
  }

  if (msg.includes('[TaskComplete] Task completed successfully')) {
    return { key: 'task_completed', level: 'ok', zh: '任务已成功回报到 Hub。' };
  }

  if (msg.includes('[AutoPublish] Published bundle')) {
    return { key: 'publish_ok', level: 'ok', zh: '已自动发布 Gene + Capsule 到 EvoMap。' };
  }

  if (msg.includes('[AutoPublish] Hub rejected')) {
    return { key: 'publish_reject', level: 'warn', zh: '尝试发布被 Hub 拒绝（非致命）。' };
  }

  if (msg.includes('Loop mode enabled')) {
    return { key: 'loop_mode', level: 'ok', zh: '后台循环模式已启用。' };
  }

  return null;
}

function summarizeTimeline(logLines) {
  const parsed = [];
  for (const line of logLines) {
    const hit = parseLogAction(line);
    if (hit) parsed.push(hit);
  }

  const compact = [];
  for (const item of parsed) {
    const last = compact[compact.length - 1];
    if (last && last.key === item.key) {
      last.count += 1;
    } else {
      compact.push({ ...item, count: 1 });
    }
  }

  return compact.slice(-12).reverse().map((x) => ({
    level: x.level,
    text: x.count > 1 ? `${x.zh}（最近连续 ${x.count} 次）` : x.zh,
  }));
}

function loadAssets() {
  const genesJson = safeReadJson(FILES.genes);
  const capsulesJson = safeReadJson(FILES.capsules);

  const genes = toArray(genesJson, 'genes').map((g) => {
    const cat = String(g.category || 'unknown').toLowerCase();
    const signals = Array.isArray(g.signals_match) ? g.signals_match.slice(0, 4) : [];
    const tactic = Array.isArray(g.strategy) ? (g.strategy[0] || '') : '';
    const catZh = INTENT_ZH[cat] || '未分类';

    return {
      id: g.id || null,
      category: cat,
      categoryZh: catZh,
      signals,
      explainZh: `这是一个“${catZh}型”基因。${CATEGORY_HELP_ZH[cat] || CATEGORY_HELP_ZH.unknown}`,
      tacticZh: tactic || '暂无策略摘要。',
    };
  });

  const capsules = toArray(capsulesJson, 'capsules').map((c) => {
    const score = c?.outcome?.score ?? null;
    const outcome = c?.outcome?.status || null;
    const trigger = Array.isArray(c.trigger) ? c.trigger.slice(0, 4) : [];
    return {
      id: c.id || null,
      gene: c.gene || null,
      summary: c.summary || '暂无摘要',
      confidence: c.confidence ?? null,
      outcome,
      score,
      trigger,
      explainZh: '这是一次可复用的“经验胶囊”，用于下次遇到类似场景时快速复现有效做法。',
    };
  });

  const eventRows = parseJsonlTail(FILES.events, 500).filter((e) => e && e.type === 'EvolutionEvent');
  const events = eventRows.slice(-20).reverse().map((e) => {
    const intent = String(e.intent || '').toLowerCase();
    const intentZh = INTENT_ZH[intent] || e.intent || '未知';
    const outcome = e?.outcome?.status || 'unknown';
    const score = e?.outcome?.score ?? null;
    return {
      id: e.id || null,
      at: e?.meta?.at || e.timestamp || null,
      intent,
      intentZh,
      outcome,
      score,
      capsuleId: e.capsule_id || null,
      genesUsed: Array.isArray(e.genes_used) ? e.genes_used : [],
      signals: Array.isArray(e.signals) ? e.signals.slice(0, 6) : [],
      explainZh: `执行了一次“${intentZh}”演化，结果：${outcome}${score == null ? '' : `（评分 ${score}）`}。`,
    };
  });

  const candidateRows = parseJsonlTail(FILES.candidates, 600);
  const candidates = candidateRows.slice(-8).reverse().map((c) => ({
    id: c.id || null,
    title: c.title || c.summary || '未命名候选能力',
    source: c.source || 'unknown',
    createdAt: c.created_at || null,
    signals: Array.isArray(c.signals) ? c.signals.slice(0, 3) : [],
    explainZh: '候选能力 = 还在观察/验证中的想法，尚未固化为正式 Gene 或 Capsule。',
  }));

  return {
    genes,
    capsules,
    events,
    candidates,
    counts: {
      genes: genes.length,
      capsules: capsules.length,
      events: eventRows.length,
      candidates: candidateRows.length,
    },
  };
}

function computeStatus({ process, timeline, dormant, node }) {
  if (!process.running) {
    return {
      code: 'stopped',
      title: '已停止',
      level: 'bad',
      reason: 'Evolver 循环进程未运行。',
      suggestion: '检查 LaunchAgent 或手动重启 evolver loop。',
    };
  }

  const hasBackoff = timeline.some((x) => String(x.text).includes('系统负载'));
  const dormantReason = dormant && dormant.backoff_reason ? String(dormant.backoff_reason) : '';

  if (hasBackoff || dormantReason === 'system_load_exceeded') {
    return {
      code: 'backoff',
      title: '回退中',
      level: 'warn',
      reason: '系统负载偏高，Evolver 正在按保护策略暂停并重试。',
      suggestion: '降低并发任务或调高 EVOLVE_LOAD_MAX，才能看到新的演化产出。',
    };
  }

  if (node && node.ok === false) {
    return {
      code: 'local_only',
      title: '本地运行中（外网状态未知）',
      level: 'warn',
      reason: '本地循环在跑，但暂时无法读取 EvoMap 节点状态。',
      suggestion: '检查网络连通性，稍后会自动恢复。',
    };
  }

  return {
    code: 'running',
    title: '运行中',
    level: 'ok',
    reason: 'Evolver 循环正常运行。',
    suggestion: '重点关注“最近产出”和“最近动作”两块即可。',
  };
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

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/dashboard', async (_req, res) => {
  const solidifyState = safeReadJson(FILES.solidify);
  const personality = safeReadJson(FILES.personality);
  const dormant = safeReadJson(FILES.dormant);
  const process = processStatus();
  const node = await fetchNodeStatus();

  const assets = loadAssets();
  const logLines = readTailLines(FILES.log, 900);
  const timeline = summarizeTimeline(logLines);
  const status = computeStatus({ process, timeline, dormant, node });

  const fileTimes = {
    logUpdatedAt: fileMtimeIso(FILES.log),
    stateUpdatedAt: fileMtimeIso(FILES.solidify),
    genesUpdatedAt: fileMtimeIso(FILES.genes),
    capsulesUpdatedAt: fileMtimeIso(FILES.capsules),
    eventsUpdatedAt: fileMtimeIso(FILES.events),
    candidatesUpdatedAt: fileMtimeIso(FILES.candidates),
  };

  const lastRun = solidifyState?.last_run || null;
  const lastSolidify = solidifyState?.last_solidify || null;

  const freshness = {
    dataUpdatedAt: maxIso([
      fileTimes.logUpdatedAt,
      fileTimes.stateUpdatedAt,
      fileTimes.candidatesUpdatedAt,
      fileTimes.eventsUpdatedAt,
    ]),
    outputUpdatedAt: maxIso([
      fileTimes.genesUpdatedAt,
      fileTimes.capsulesUpdatedAt,
      fileTimes.eventsUpdatedAt,
    ]),
    nodeLastSeenAt: node.lastSeenAt || null,
    lastRunAt: lastRun?.created_at || null,
    lastSolidifyAt: lastSolidify?.at || null,
    ...fileTimes,
  };

  const metrics = [
    { key: 'genes', label: '基因', value: assets.counts.genes, desc: '可复用策略模板（不是任务数）' },
    { key: 'capsules', label: '胶囊', value: assets.counts.capsules, desc: '已验证经验包（可复用）' },
    { key: 'events', label: '演化事件', value: assets.counts.events, desc: '执行记录（不是项目）' },
    { key: 'candidates', label: '候选能力', value: assets.counts.candidates, desc: '待验证想法，尚未固化' },
    { key: 'published', label: '累计发布', value: node.totalPublished ?? '-', desc: '已对外发布到 EvoMap 的资产数' },
    { key: 'promoted', label: '累计 promoted', value: node.totalPromoted ?? '-', desc: '在网络中获得更高认可的资产数' },
  ];

  res.json({
    now: new Date().toISOString(),
    status,
    freshness,
    metrics,
    process,
    node,
    lastRun,
    lastSolidify,
    timeline,
    assets: {
      genes: assets.genes.slice(0, 6),
      capsules: assets.capsules.slice(0, 6),
      events: assets.events.slice(0, 10),
      candidates: assets.candidates,
    },
    personality,
    dormant,
    technical: {
      logTail: logLines.slice(-180),
      processCommand: process.command,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[evolver-observer] listening on http://0.0.0.0:${PORT}`);
});
