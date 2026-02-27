function clsByBool(v) {
  if (v === true) return 'good';
  if (v === false) return 'bad';
  return 'warn';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function short(s, n = 80) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n) + '...' : t;
}

function renderCards(data) {
  const cards = [
    ['本地进程', data.process.running ? 'RUNNING' : 'STOPPED', data.process.running],
    ['PID', data.process.pid ?? '-', null],
    ['EvoMap 在线', data.node.online, data.node.online],
    ['节点状态', data.node.status ?? '-', null],
    ['发布数', data.node.totalPublished ?? '-', null],
    ['Promoted', data.node.totalPromoted ?? '-', null],
    ['Genes', data.assets.genesCount, null],
    ['Capsules', data.assets.capsulesCount, null],
    ['Events', data.assets.eventsCount, null],
    ['Candidates', data.assets.candidatesCount, null],
  ];

  const html = cards
    .map(([k, v, b]) => {
      const cls = b == null ? '' : clsByBool(b);
      return `<div class="card"><div class="k">${esc(k)}</div><div class="v ${cls}">${esc(v)}</div></div>`;
    })
    .join('');

  document.getElementById('topCards').innerHTML = html;
}

function renderSummary(data) {
  const run = data.lastRun || {};
  const solid = data.lastSolidify || {};
  const kv = [
    ['node_id', data.config.nodeId],
    ['run_id', run.run_id || '-'],
    ['created_at', run.created_at || '-'],
    ['selected_gene', run.selected_gene_id || '-'],
    ['source_type', run.source_type || '-'],
    ['active_task', run.active_task_title || '-'],
    ['last_solidify', solid.at || '-'],
    ['solidify_outcome', solid.outcome || '-'],
    ['dormant_reason', data.dormant?.backoff_reason || '-'],
    ['last_seen', data.node.lastSeenAt || '-'],
  ];

  const signals = Array.isArray(run.signals) ? run.signals.slice(0, 10).join(', ') : '-';
  kv.push(['signals', signals]);

  document.getElementById('runSummary').innerHTML = kv
    .map(([k, v]) => `<div class="key">${esc(k)}</div><div>${esc(v)}</div>`)
    .join('');
}

function renderActions(data) {
  const list = data.actions || [];
  const html = list.length
    ? list.map((a) => `<li><code>${esc(a.type)}</code> ${esc(a.text)}</li>`).join('')
    : '<li>暂无动作</li>';
  document.getElementById('actions').innerHTML = html;
}

function renderEvents(data) {
  const rows = (data.events || [])
    .map((e) => {
      const gene = e.genesUsed && e.genesUsed.length ? short(e.genesUsed.join(', '), 40) : '-';
      return `<tr>
        <td>${esc(e.at || '-')}</td>
        <td>${esc(e.intent || '-')}</td>
        <td>${esc(e.outcome || '-')}</td>
        <td>${esc(e.score ?? '-')}</td>
        <td>${esc(gene)}</td>
        <td>${esc(short(e.capsuleId || '-', 24))}</td>
      </tr>`;
    })
    .join('');

  document.getElementById('eventsBody').innerHTML = rows || '<tr><td colspan="6">暂无数据</td></tr>';
}

function renderLog(data) {
  const tail = (data.logTail || []).join('\n');
  document.getElementById('logTail').textContent = tail || '(empty)';
}

async function refresh() {
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    const data = await res.json();
    renderCards(data);
    renderSummary(data);
    renderActions(data);
    renderEvents(data);
    renderLog(data);

    document.getElementById('statusLine').textContent =
      `Last update: ${new Date(data.now).toLocaleString()} · Auto refresh 15s`;
  } catch (e) {
    document.getElementById('statusLine').textContent = `刷新失败: ${e.message}`;
  }
}

refresh();
setInterval(refresh, 15000);
