function esc(v) {
  return String(v == null ? '' : v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function ago(iso) {
  if (!iso) return '未知';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '未知';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  return `${d}天前`;
}

function levelClass(level) {
  if (level === 'ok') return 'ok';
  if (level === 'bad') return 'bad';
  return 'warn';
}

function renderHero(data) {
  const s = data.status || {};
  const cls = levelClass(s.level);
  document.getElementById('hero').innerHTML = `
    <div class="statusTitle ${cls}">${esc(s.title || '状态未知')}</div>
    <div class="statusReason">${esc(s.reason || '暂无')}</div>
    <div class="statusSuggest">建议：${esc(s.suggestion || '-')}</div>
  `;
}

function renderFreshness(data) {
  const f = data.freshness || {};
  const rows = [
    ['页面刷新时间', fmtTime(data.now)],
    ['数据最近变化', `${fmtTime(f.dataUpdatedAt)}（${ago(f.dataUpdatedAt)}）`],
    ['有效产出最近变化', `${fmtTime(f.outputUpdatedAt)}（${ago(f.outputUpdatedAt)}）`],
    ['本地日志更新时间', `${fmtTime(f.logUpdatedAt)}（${ago(f.logUpdatedAt)}）`],
    ['EvoMap 最近心跳', `${fmtTime(f.nodeLastSeenAt)}（${ago(f.nodeLastSeenAt)}）`],
    ['最近一次 solidify', `${fmtTime(f.lastSolidifyAt)}（${ago(f.lastSolidifyAt)}）`],
  ];

  document.getElementById('freshness').innerHTML = rows
    .map(([k, v]) => `<div class="k">${esc(k)}</div><div>${esc(v)}</div>`)
    .join('');
}

function renderMetrics(data) {
  const metrics = data.metrics || [];
  document.getElementById('metrics').innerHTML = metrics
    .map((m) => `
      <div class="metric">
        <div class="name">${esc(m.label)}</div>
        <div class="value">${esc(m.value)}</div>
        <div class="desc">${esc(m.desc)}</div>
      </div>
    `)
    .join('');
}

function renderAssetList(elId, items, mapper) {
  const el = document.getElementById(elId);
  if (!items || !items.length) {
    el.innerHTML = '<div class="item"><div class="explain">暂无数据</div></div>';
    return;
  }
  el.innerHTML = items.map(mapper).join('');
}

function renderGenes(data) {
  const genes = (data.assets && data.assets.genes) || [];
  renderAssetList('genes', genes, (g) => `
    <div class="item">
      <div class="title">${esc(g.id || '未知基因')} · ${esc(g.categoryZh || '未分类')}</div>
      <div class="meta">触发信号：${esc((g.signals || []).join(', ') || '-')}</div>
      <div class="explain">${esc(g.explainZh || '')}</div>
      <div class="meta">策略摘要：${esc(g.tacticZh || '-')}</div>
    </div>
  `);
}

function renderCapsules(data) {
  const capsules = (data.assets && data.assets.capsules) || [];
  renderAssetList('capsules', capsules, (c) => `
    <div class="item">
      <div class="title">${esc(c.id || '未知胶囊')} · score ${esc(c.score ?? '-')}</div>
      <div class="meta">来源基因：${esc(c.gene || '-')} · outcome：${esc(c.outcome || '-')}</div>
      <div class="explain">${esc(c.summary || '')}</div>
      <div class="meta">用途说明：${esc(c.explainZh || '')}</div>
    </div>
  `);
}

function renderCandidates(data) {
  const candidates = (data.assets && data.assets.candidates) || [];
  renderAssetList('candidates', candidates, (c) => `
    <div class="item">
      <div class="title">${esc(c.title || '未命名候选')}</div>
      <div class="meta">来源：${esc(c.source || '-')} · 时间：${esc(fmtTime(c.createdAt))}</div>
      <div class="explain">${esc(c.explainZh || '')}</div>
      <div class="meta">关联信号：${esc((c.signals || []).join(', ') || '-')}</div>
    </div>
  `);
}

function renderTimeline(data) {
  const lines = data.timeline || [];
  document.getElementById('timeline').innerHTML = lines.length
    ? lines.map((x) => `<li class="${esc(levelClass(x.level))}">${esc(x.text)}</li>`).join('')
    : '<li>最近没有抓到高价值动作。</li>';
}

function renderEvents(data) {
  const events = (data.assets && data.assets.events) || [];
  document.getElementById('eventsBody').innerHTML = events.length
    ? events
        .map((e) => `
          <tr>
            <td>${esc(fmtTime(e.at))}</td>
            <td>${esc(e.intentZh || e.intent || '-')}</td>
            <td>${esc(e.outcome || '-')}</td>
            <td>${esc(e.score ?? '-')}</td>
            <td>${esc(e.explainZh || '-')}</td>
          </tr>
        `)
        .join('')
    : '<tr><td colspan="5">暂无事件</td></tr>';
}

function renderTech(data) {
  const tail = (data.technical && data.technical.logTail) || [];
  document.getElementById('logTail').textContent = tail.join('\n') || '(empty)';
}

function renderHeader(data) {
  const fresh = data.freshness || {};
  const line = `上次刷新：${fmtTime(data.now)} ｜ 数据更新：${ago(fresh.dataUpdatedAt)} ｜ 产出更新：${ago(fresh.outputUpdatedAt)}`;
  document.getElementById('subline').textContent = line;

  const dot = document.getElementById('liveDot');
  const txt = document.getElementById('liveText');
  const staleMs = Date.now() - new Date(fresh.dataUpdatedAt || 0).getTime();
  if (Number.isFinite(staleMs) && staleMs < 90000) {
    dot.style.background = 'var(--ok)';
    txt.textContent = '实时更新中';
  } else {
    dot.style.background = 'var(--warn)';
    txt.textContent = '数据更新偏慢';
  }
}

async function refresh() {
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    const data = await res.json();

    renderHeader(data);
    renderHero(data);
    renderFreshness(data);
    renderMetrics(data);
    renderGenes(data);
    renderCapsules(data);
    renderCandidates(data);
    renderTimeline(data);
    renderEvents(data);
    renderTech(data);
  } catch (e) {
    document.getElementById('subline').textContent = `加载失败：${e.message}`;
    document.getElementById('liveText').textContent = '连接失败';
  }
}

refresh();
setInterval(refresh, 10000);
