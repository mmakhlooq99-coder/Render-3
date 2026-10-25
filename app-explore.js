(function () {
  const root = document.getElementById('page-root');
  let isAdmin = false, batches = [], rows = [];
  let batchId = '', rmId = '', status = '', search = '', fbOnly = false;

  async function init() {
    let me;
    try { me = await api('/api/me'); } catch (e) { return; }
    isAdmin = me.role === 'ADMIN';
    await load(true);
  }

  async function load(first) {
    const qs = new URLSearchParams();
    if (batchId) qs.set('batchId', batchId);
    if (rmId) qs.set('rmId', rmId);
    if (status) qs.set('status', status);
    const d = await api('/api/explore/feedback?' + qs);
    batches = d.batches; rows = d.merchants;
    if (first && batches.length) batchId = String(batches[0].id);
    if (first) return load(false);
    shell(); draw();
  }

  function dlUrl() {
    const qs = new URLSearchParams();
    qs.set('batchId', batchId || 'all');
    if (rmId) qs.set('rmId', rmId);
    if (status) qs.set('status', status);
    return '/api/explore/download?' + qs;
  }

  function shell() {
    const rmNames = [...new Map(rows.filter((m) => m.rm_user_id).map((m) => [String(m.rm_user_id), m.rm_name || m.rm_name_raw])).entries()];
    root.innerHTML = `
      <div class="toolbar">
        <select id="ex-batch"><option value="all" ${batchId === 'all' ? 'selected' : ''}>All weeks</option>${batches.map((b) => `<option value="${b.id}" ${String(b.id) === batchId ? 'selected' : ''}>${escapeHtml(b.label)} (${escapeHtml(b.week_start)})</option>`).join('')}</select>
        ${isAdmin ? `<select id="ex-rm"><option value="">All RMs</option>${rmNames.map(([id, n]) => `<option value="${id}" ${id === rmId ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>` : ''}
        <select id="ex-status"><option value="">All status</option><option value="COMPLETED" ${status === 'COMPLETED' ? 'selected' : ''}>Completed (has feedback)</option><option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>Pending (no feedback)</option></select>
        <input id="ex-search" type="search" placeholder="Search merchant, MID or feedback…" style="flex:1;min-width:200px;" value="${escapeHtml(search)}">
        <a class="btn" id="ex-dl" href="#">⬇ Download Excel (CSV)</a>
      </div>
      <div class="stats-grid" id="ex-stats"></div>
      ${isAdmin ? '<div class="rm-pick-grid" id="ex-rms"></div>' : ''}
      <div class="card"><div class="card-header"><h3>Reactivation feedback</h3></div><div class="card-body">
        <div class="table-wrap"><table class="data-table stack-mobile"><thead><tr>
          <th>Status</th><th>Week</th>${isAdmin ? '<th>RM</th>' : ''}<th>MID</th><th>Merchant</th><th class="num">Value</th><th>Outcome</th><th>Feedback</th><th>Updated</th>
        </tr></thead><tbody id="ex-body"></tbody></table></div>
        <div id="ex-empty" class="empty-state" style="display:none;">No merchants match.</div>
      </div></div>`;
    const reload = async () => { await load(false); };
    document.getElementById('ex-batch').onchange = (e) => { batchId = e.target.value; rmId = ''; reload(); };
    const rs = document.getElementById('ex-rm'); if (rs) rs.onchange = (e) => { rmId = e.target.value; reload(); };
    document.getElementById('ex-status').onchange = (e) => { status = e.target.value; reload(); };
    document.getElementById('ex-search').oninput = (e) => { search = e.target.value.trim().toLowerCase(); draw(); };
    document.getElementById('ex-dl').onclick = (e) => { e.preventDefault(); window.location.href = dlUrl(); };
  }

  function visible() {
    if (!search) return rows;
    return rows.filter((m) => [m.merchant_name, m.mid, m.feedback, m.feedback_category, m.rm_name].some((v) => String(v || '').toLowerCase().includes(search)));
  }

  function draw() {
    const v = visible();
    const done = v.filter((m) => m.status === 'COMPLETED').length;
    const val = (a) => a.reduce((s, m) => s + (m.value_worth || 0), 0);
    document.getElementById('ex-stats').innerHTML = `
      <div class="stat-card"><div class="label">Merchants</div><div class="value">${v.length}</div></div>
      <div class="stat-card"><div class="label">Feedback received</div><div class="value success">${done}</div></div>
      <div class="stat-card"><div class="label">Pending</div><div class="value warning">${v.length - done}</div></div>
      <div class="stat-card"><div class="label">Completion</div><div class="value">${v.length ? Math.round((done / v.length) * 100) : 0}%</div></div>
      <div class="stat-card"><div class="label">Value pending</div><div class="value">${fmtMoney(val(v.filter((m) => m.status !== 'COMPLETED')))}</div></div>`;

    if (isAdmin) {
      const g = {};
      rows.forEach((m) => { const k = m.rm_user_id ?? ''; const r = (g[k] = g[k] || { n: m.rm_name || m.rm_name_raw || 'Unassigned', t: 0, d: 0 }); r.t++; if (m.status === 'COMPLETED') r.d++; });
      const el = document.getElementById('ex-rms');
      el.innerHTML = Object.entries(g).sort((a, b) => a[1].d / a[1].t - b[1].d / b[1].t).map(([k, r]) => `
        <div class="rm-pick-card"><div class="name">${escapeHtml(r.n)}</div>
        <div class="row"><span>Merchants</span><b>${r.t}</b></div><div class="row"><span>Feedback given</span><b>${r.d}</b></div>
        <div class="row"><span>Completion</span><b>${Math.round((r.d / r.t) * 100)}%</b></div></div>`).join('');
    }

    const body = document.getElementById('ex-body');
    document.getElementById('ex-empty').style.display = v.length ? 'none' : 'block';
    body.innerHTML = v.map((m) => `<tr>
      <td data-label="Status"><span class="pill ${m.status === 'COMPLETED' ? 'completed' : 'pending'}">${m.status === 'COMPLETED' ? 'Completed' : 'Pending'}</span></td>
      <td data-label="Week">${escapeHtml(m.batch_label)}</td>
      ${isAdmin ? `<td data-label="RM">${escapeHtml(m.rm_name || m.rm_name_raw || 'Unassigned')}</td>` : ''}
      <td data-label="MID">${escapeHtml(m.mid)}</td><td data-label="Merchant">${escapeHtml(m.merchant_name)}</td>
      <td class="num" data-label="Value">${fmtMoney(m.value_worth)}</td>
      <td data-label="Outcome" style="white-space:nowrap;">${escapeHtml(m.feedback_category) || '<span class="muted">—</span>'}</td>
      <td data-label="Feedback" style="max-width:340px;white-space:pre-wrap;">${escapeHtml(m.feedback) || '<span class="muted">—</span>'}</td>
      <td data-label="Updated" class="muted" style="font-size:12.5px;white-space:nowrap;">${escapeHtml(m.feedback_updated_at || '')}</td></tr>`).join('');
  }
  init();
})();
