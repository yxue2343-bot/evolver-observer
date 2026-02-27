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

function readSimpleEnv(filePath) {
  const out = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n');
    for (const line of lines) {
      const s = String(line || '').trim();
      if (!s || s.startsWith('#')) continue;
      const idx = s.indexOf('=');
      if (idx <= 0) continue;
      const k = s.slice(0, idx).trim();
      const v = s.slice(idx + 1).trim();
      out[k] = v;
    }
  } catch (_e) {}
  return out;
}

function clipText(v, n = 80) {
  const s = String(v || '');
  if (s.length <= n) return s;
  return `${s.slice(0, n)}...`;
}

function stableHash(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function signalToZh(sig) {
  const s = String(sig || '');
  if (!s) return '未知信号';
  if (/unknown command 'process'/i.test(s)) return '调用命令写法错误（process 命令）';
  if (/repeated_tool_usage:exec/i.test(s)) return 'exec 调用过多，流程可能过重';
  if (/protocol_drift/i.test(s)) return '输出/流程偏离约定';
  if (/system_load_exceeded/i.test(s)) return '系统负载过高';
  if (/timeout|aborted|queue/i.test(s)) return '请求超时或排队中断';
  if (/error|exception|failed|log_error/i.test(s)) return '检测到报错信号';
  return clipText(s, 42);
}

function summarizeSignals(signals, max = 3) {
  const arr = Array.isArray(signals) ? signals : [];
  const zh = arr.map(signalToZh).filter(Boolean);
  return zh.slice(0, max);
}

function explainGeneZh(g, catZh, signals, tactic) {
  const id = String(g.id || '').toLowerCase();
  const sigText = signals.length ? `触发它的典型信号是：${signals.join('、')}。` : '';

  if (id.includes('repair')) {
    return {
      purposeZh: '这个基因是“修 bug 用”的模板：先定位报错，再做小范围改动，最后做验证，避免越改越乱。',
      detailZh: sigText || '它主要在报错场景下触发。',
      tacticZh: tactic || '常见做法：先抓错误线索，再做最小修补。',
    };
  }

  if (id.includes('optimize')) {
    return {
      purposeZh: '这个基因是“提效率用”的模板：减少重复步骤，让流程更快更稳。',
      detailZh: sigText || '它主要在效率瓶颈场景下触发。',
      tacticZh: tactic || '常见做法：整理提示词和资产结构，降低重复劳动。',
    };
  }

  if (id.includes('innovate')) {
    return {
      purposeZh: '这个基因是“尝试新方法用”的模板：在可控风险下探索新能力。',
      detailZh: sigText || '它主要在新机会出现时触发。',
      tacticZh: tactic || '常见做法：先小步试验，再看效果是否值得固化。',
    };
  }

  return {
    purposeZh: `这是一个“${catZh}型”基因。${CATEGORY_HELP_ZH[g.category] || CATEGORY_HELP_ZH.unknown}`,
    detailZh: sigText || '当前没有解析到明显触发信号。',
    tacticZh: tactic || '暂无策略摘要。',
  };
}

function inferProblemZh(text) {
  const s = String(text || '');
  if (/unknown command 'process'/i.test(s)) return '命令写错导致流程中断';
  if (/429|rate limit/i.test(s)) return '接口限流导致请求失败';
  if (/timeout|aborted/i.test(s)) return '请求超时或被中断';
  if (/system load|load exceeded/i.test(s)) return '系统负载过高导致暂停';
  if (/error|exception|failed/i.test(s)) return '运行中出现报错';
  return '流程稳定性或效率问题';
}

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
    const catZh = INTENT_ZH[cat] || '未分类';
    const signals = summarizeSignals(g.signals_match, 4);
    const tactic = Array.isArray(g.strategy) ? clipText(g.strategy[0] || '', 80) : '';
    const explain = explainGeneZh({ ...g, category: cat }, catZh, signals, tactic);

    return {
      id: g.id || null,
      category: cat,
      categoryZh: catZh,
      signals,
      purposeZh: explain.purposeZh,
      detailZh: explain.detailZh,
      tacticZh: explain.tacticZh,
    };
  });

  const capsules = toArray(capsulesJson, 'capsules').map((c) => {
    const score = c?.outcome?.score ?? null;
    const outcome = c?.outcome?.status || null;
    const trigger = summarizeSignals(c.trigger, 4);
    const problemZh = inferProblemZh(`${c.summary || ''} ${(Array.isArray(c.trigger) ? c.trigger.join(' ') : '')}`);
    const outcomeZh = outcome === 'success' ? '成功' : outcome === 'failed' ? '失败' : '未知';
    const blastFiles = c?.blast_radius?.files;
    const blastLines = c?.blast_radius?.lines;

    return {
      id: c.id || null,
      gene: c.gene || null,
      summary: c.summary || '暂无摘要',
      confidence: c.confidence ?? null,
      outcome,
      score,
      trigger,
      problemZh,
      resultZh: `结果：${outcomeZh}${score == null ? '' : `（评分 ${score}）`}`,
      valueZh: `这条胶囊的作用是：下次再出现“${problemZh}”时，可以复用这套做法。${blastFiles == null ? '' : `当次改动规模约 ${blastFiles} 个文件`} ${blastLines == null ? '' : `${blastLines} 行`}。`,
    };
  });

  const eventRows = parseJsonlTail(FILES.events, 500).filter((e) => e && e.type === 'EvolutionEvent');
  const events = eventRows.slice(-20).reverse().map((e) => {
    const intent = String(e.intent || '').toLowerCase();
    const intentZh = INTENT_ZH[intent] || e.intent || '未知';
    const outcome = e?.outcome?.status || 'unknown';
    const score = e?.outcome?.score ?? null;
    const signals = summarizeSignals(e.signals, 4);
    const problemZh = inferProblemZh((Array.isArray(e.signals) ? e.signals.join(' ') : '') + ` ${e.id || ''}`);
    const gene = Array.isArray(e.genes_used) && e.genes_used.length ? e.genes_used[0] : null;

    let actionZh = `执行了“${intentZh}”策略。`;
    if (intent === 'repair') actionZh = '针对报错做了一轮修复尝试。';
    if (intent === 'optimize') actionZh = '针对流程效率做了一轮优化尝试。';
    if (intent === 'innovate') actionZh = '针对新方法做了一轮小步试验。';

    const resultZh = outcome === 'success'
      ? `执行成功${score == null ? '' : `，评分 ${score}`}`
      : `执行未成功${score == null ? '' : `，评分 ${score}`}`;

    return {
      id: e.id || null,
      at: e?.meta?.at || e.timestamp || null,
      intent,
      intentZh,
      outcome,
      score,
      capsuleId: e.capsule_id || null,
      genesUsed: Array.isArray(e.genes_used) ? e.genes_used : [],
      signals,
      problemZh,
      actionZh,
      resultZh,
      explainZh: `本轮在处理“${problemZh}”。${gene ? `系统使用了 ${gene}。` : ''}${actionZh}最终：${resultZh}。`,
    };
  });

  const candidateRows = parseJsonlTail(FILES.candidates, 2000);
  const candidateById = new Map();

  for (const c of candidateRows) {
    const id = c && c.id ? String(c.id) : `anon_${stableHash(JSON.stringify(c || {}))}`;
    candidateById.set(id, c);
  }

  const uniqueCandidates = Array.from(candidateById.values());
  const uniqueTail = uniqueCandidates.slice(-8).reverse();

  const sourceStats = {};
  for (const c of uniqueCandidates) {
    const s = c && c.source ? String(c.source) : 'unknown';
    sourceStats[s] = (sourceStats[s] || 0) + 1;
  }

  const candidates = uniqueTail.map((c) => {
    const source = c.source || 'unknown';
    const signals = summarizeSignals(c.signals, 3);
    const sourceZh = source === 'transcript' ? '会话记录' : source === 'signals' ? '信号推断' : source;

    return {
      id: c.id || null,
      title: c.title || c.summary || '未命名候选能力',
      source,
      sourceZh,
      createdAt: c.created_at || null,
      signals,
      explainZh: '候选能力 = 还在观察中的想法，暂时不会直接改动你的主流程。',
      nextZh: '如果后续反复出现同类信号，它会升级为正式基因或胶囊。',
    };
  });

  return {
    genes,
    capsules,
    events,
    candidates,
    candidateStats: {
      raw: candidateRows.length,
      unique: uniqueCandidates.length,
      duplicates: Math.max(0, candidateRows.length - uniqueCandidates.length),
      sourceStats,
    },
    counts: {
      genes: genes.length,
      capsules: capsules.length,
      events: eventRows.length,
      candidates: uniqueCandidates.length,
      candidatesRaw: candidateRows.length,
    },
  };
}

function computeStatus({ process, timeline, dormant, node, loadMax }) {
  if (!process.running) {
    return {
      code: 'stopped',
      title: '已停止',
      level: 'bad',
      reason: 'Evolver 循环进程未运行。',
      suggestion: '检查 LaunchAgent 或手动重启 evolver loop。',
    };
  }

  const hasBackoff = timeline.length > 0 && String(timeline[0].text).includes('系统负载');
  const dormantReason = dormant && dormant.backoff_reason ? String(dormant.backoff_reason) : '';

  if (hasBackoff || dormantReason === 'system_load_exceeded') {
    return {
      code: 'backoff',
      title: '回退中',
      level: 'warn',
      reason: `系统负载偏高，Evolver 正在按保护策略暂停并重试（当前阈值 ${loadMax}）。`,
      suggestion: '如果长期回退，可继续提高阈值或减少并发任务。',
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
    reason: `Evolver 循环正常运行（当前阈值 ${loadMax}）。`,
    suggestion: '重点看“最近在做什么”和“新增基因/胶囊解释”。',
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

  const envCfg = readSimpleEnv(path.join(EVOLVER_ROOT, '.env'));
  const loadMax = parseFloat(envCfg.EVOLVE_LOAD_MAX || process.env.EVOLVE_LOAD_MAX || '2');

  const assets = loadAssets();
  const logLines = readTailLines(FILES.log, 260);
  const timeline = summarizeTimeline(logLines);
  const status = computeStatus({ process, timeline, dormant, node, loadMax });

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

  const candRaw = assets.candidateStats ? assets.candidateStats.raw : assets.counts.candidatesRaw;
  const candUnique = assets.candidateStats ? assets.candidateStats.unique : assets.counts.candidates;
  const candDup = assets.candidateStats ? assets.candidateStats.duplicates : Math.max(0, candRaw - candUnique);

  const metrics = [
    { key: 'genes', label: '基因', value: assets.counts.genes, desc: '可复用策略模板（不是任务数）' },
    { key: 'capsules', label: '胶囊', value: assets.counts.capsules, desc: '已验证经验包（可复用）' },
    { key: 'events', label: '演化事件', value: assets.counts.events, desc: '执行记录（不是项目）' },
    { key: 'candidates_unique', label: '候选能力(去重后)', value: candUnique, desc: `按 id 去重，已折叠 ${candDup} 条重复记录` },
    { key: 'candidates_raw', label: '候选原始记录', value: candRaw, desc: '原始累计条数（会包含重复）' },
    { key: 'load_max', label: '负载阈值', value: loadMax, desc: '超过这个值会暂缓演化' },
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
      candidateStats: assets.candidateStats,
    },
    personality,
    dormant,
    runtime: {
      loadMax,
    },
    technical: {
      logTail: logLines.slice(-180),
      processCommand: process.command,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[evolver-observer] listening on http://0.0.0.0:${PORT}`);
});
