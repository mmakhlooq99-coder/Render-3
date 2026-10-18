(function () {
  const root = document.getElementById('page-root');
  let isAdmin = false, batches = [], batchId = null, merchants = [], changes = null;
  let rmId = '', prio = 'All', view = 'all', sortMode = 'priority', search = '';
  const act = (p) => (p === 'Urgent' ? 'Call today' : p === 'Watch' ? 'Call this week' : 'Monitor');
  const rank = { Urgent: 0, Watch: 1, Recent: 2 };

  async function init() {
    let me;
    try { me = await api('/api/me'); } catch (e) { return; }
    isAdmin = me.role === 'ADMIN';
    batches = (await api('/api/tracking/batches')).batches;
    if (!batches.length) { root.innerHTML = '<div class="card"><div class="card-body"><div class="empty-state">No updates uploaded yet. Upload a snapshot in Merchant Tracking first.</div></div></div>'; return; }
    batchId = batches[0].id;
    await load();
  }

  async function load() {
    const [m, c] = await Promise.all([
      api('/api/tracking/merchants?batchId=' + batchId),
      api('/api/explore/changes?batchId=' + batchId),
    ]);
    merchants = m.merchants; changes = c; rmId = ''; prio = 'All'; view = 'all'; search = '';
    shell(); draw();
  }

  const newSet = () => new Set(changes.newMids), worseSet = () => new Set(changes.worsenedMids);

  function shell() {
    const b = batches.find((x) => x.id === batchId);
    root.innerHTML = `
      <div class="toolbar">
        <select id="ex-batch">${batches.map((x) => `<option value="${x.id}" ${x.id === batchId ? 'selected' : ''}>${escapeHtml(x.date_label)} — ${escapeHtml(x.range_label)}</option>`).join('')}</select>
        <input id="ex-search" type="search" placeholder="Search merchant name or MID…" style="flex:1;min-width:200px;">
      </div>
      <div class="stats-grid" id="ex-stats"></div>
      <div class="card" style="margin-bottom:18px;"><div class="card-header"><h3>What changed ${changes.previous ? 'since ' + escapeHtml(changes.previous.date_label) : ''}</h3></div>
        <div class="card-body" id="ex-changes"></div></div>
      ${isAdmin ? '<div class="rm-pick-grid" id="ex-rms"></div>' : ''}
      <div class="card">
        <div class="card-header"><h3>${escapeHtml(b.date_label)} update</h3>
          <select id="ex-sort"><option value="priority">Sort: Urgency</option><option value="value">Sort: Value at risk</option><option value="days">Sort: Days inactive</option><option value="name">Sort: Merchant name</option></select></div>
        <div class="card-body">
          <div class="chip-row" id="ex-chips">${['All', 'Urgent', 'Watch', 'Recent'].map((p) => `<button class="chip" data-p="${p}">${p}</button>`).join('')}</div>
          <div class="chip-row" id="ex-views">
            <button class="chip" data-v="all" data-p="All">All merchants</button>
            <button class="chip" data-v="new" data-p="Urgent">New today</button>
            <button class="chip" data-v="worse" data-p="Watch">Got worse</button>
          </div>
          <div class="table-wrap"><table class="data-table stack-mobile"><thead><tr>
            <th>Priority</th><th>MID</th><th>Merchant</th>${isAdmin ? '<th>RM</th>' : ''}<th>Last Active</th><th class="num">Days Inactive</th><th class="num">Value at risk</th><th>Action</th>
          </tr></thead><tbody id="ex-body"></tbody></table></div>
          <div id="ex-empty" class="empty-state" style="display:none;">No merchants match.</div>
        </div></div>`;
    document.getElementById('ex-batch').onchange = async (e) => { batchId = Number(e.target.value); await load(); };
    document.getElementById('ex-search').oninput = (e) => { search = e.target.value.trim().toLowerCase(); draw(); };
    document.getElementById('ex-sort').onchange = (e) => { sortMode = e.target.value; draw(); };
    document.getElementById('ex-chips').onclick = (e) => { const c = e.target.closest('.chip'); if (c) { prio = c.dataset.p; draw(); } };
    document.getElementById('ex-views').onclick = (e) => { const c = e.target.closest('.chip'); if (c) { view = c.dataset.v; draw(); } };
  }

  function scoped() { return isAdmin && rmId ? merchants.filter((m) => String(m.rm_user_id) === rmId) : merchants; }

  function draw() {
    const src = scoped(), ns = newSet(), ws = worseSet();
    const sum = (a) => a.reduce((s, m) => s + (m.grand_total || 0), 0);
    document.getElementById('ex-stats').innerHTML = `
      <div class="stat-card"><div class="label">Merchants</div><div class="value">${src.length}</div></div>
      <div class="stat-card"><div class="label">Urgent</div><div class="value" style="color:var(--danger)">${src.filter((m) => m.priority === 'Urgent').length}</div></div>
      <div class="stat-card"><div class="label">New today</div><div class="value warning">${src.filter((m) => ns.has(String(m.mid))).length}</div></div>
      <div class="stat-card"><div class="label">Value at risk</div><div class="value">${fmtMoney(sum(src))}</div></div>`;

    const ch = document.getElementById('ex-changes');
    if (!changes.previous) ch.innerHTML = '<div class="muted">This is the first update — nothing to compare with yet.</div>';
    else {
      ch.innerHTML = `<div class="stats-grid" style="margin-bottom:12px;">
        <div class="stat-card"><div class="label">Newly inactive</div><div class="value warning">${changes.newMids.length}</div></div>
        <div class="stat-card"><div class="label">Got worse</div><div class="value" style="color:var(--danger)">${changes.worsenedMids.length}</div></div>
        <div class="stat-card"><div class="label">Back to active</div><div class="value success">${changes.recovered.length}</div></div></div>
        ${changes.recovered.length ? `<div class="muted" style="font-size:12.5px;"><b>Back to active:</b> ${changes.recovered.slice(0, 12).map((r) => escapeHtml(r.merchant_name)).join(', ')}${changes.recovered.length > 12 ? ' … +' + (changes.recovered.length - 12) + ' more' : ''}</div>` : ''}`;
    }

    if (isAdmin) {
      const g = {};
      merchants.forEach((m) => { const k = m.rm_user_id ?? ''; (g[k] = g[k] || { n: m.rm_name || 'Unassigned', t: 0, u: 0, v: 0, nw: 0 }); g[k].t++; if (m.priority === 'Urgent') g[k].u++; if (ns.has(String(m.mid))) g[k].nw++; g[k].v += m.grand_total || 0; });
      const el = document.getElementById('ex-rms');
      el.innerHTML = Object.entries(g).sort((a, b) => b[1].v - a[1].v).map(([k, r]) => `
        <button class="rm-pick-card ${String(k) === rmId ? 'active' : ''}" data-rm="${k}"><div class="name">${escapeHtml(r.n)}</div>
        <div class="row"><span>Accounts</span><b>${r.t}</b></div><div class="row"><span>Urgent</span><b class="urgent-tag">${r.u}</b></div>
        <div class="row"><span>New today</span><b>${r.nw}</b></div><div class="row"><span>Value</span><b>${fmtMoney(r.v)}</b></div></button>`).join('');
      el.querySelectorAll('.rm-pick-card').forEach((b) => b.onclick = () => { const k = b.dataset.rm; rmId = rmId === k ? '' : k; draw(); });
    }

    document.querySelectorAll('#ex-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.p === prio));
    document.querySelectorAll('#ex-views .chip').forEach((c) => c.classList.toggle('active', c.dataset.v === view));

    let rows = src.slice();
    if (prio !== 'All') rows = rows.filter((m) => m.priority === prio);
    if (view === 'new') rows = rows.filter((m) => ns.has(String(m.mid)));
    if (view === 'worse') rows = rows.filter((m) => ws.has(String(m.mid)));
    if (search) rows = rows.filter((m) => (m.merchant_name || '').toLowerCase().includes(search) || String(m.mid).toLowerCase().includes(search));
    rows.sort((a, b) => sortMode === 'value' ? (b.grand_total || 0) - (a.grand_total || 0)
      : sortMode === 'days' ? (b.days_inactive || 0) - (a.days_inactive || 0)
      : sortMode === 'name' ? String(a.merchant_name).localeCompare(String(b.merchant_name))
      : (rank[a.priority] - rank[b.priority]) || (b.grand_total || 0) - (a.grand_total || 0));

    const body = document.getElementById('ex-body'), empty = document.getElementById('ex-empty');
    empty.style.display = rows.length ? 'none' : 'block';
    body.innerHTML = rows.map((m) => `<tr>
      <td data-label="Priority"><span class="pill ${m.priority.toLowerCase()}">${m.priority}</span>${ns.has(String(m.mid)) ? ' <span class="pill pending">NEW</span>' : ws.has(String(m.mid)) ? ' <span class="pill urgent">▲</span>' : ''}</td>
      <td data-label="MID">${escapeHtml(m.mid)}</td><td data-label="Merchant">${escapeHtml(m.merchant_name)}</td>
      ${isAdmin ? `<td data-label="RM">${escapeHtml(m.rm_name || 'Unassigned')}</td>` : ''}
      <td data-label="Last Active">${escapeHtml(m.last_active_label) || '—'}</td>
      <td class="num" data-label="Days Inactive">${m.days_inactive ?? '—'}</td>
      <td class="num" data-label="Value at risk">${fmtMoney(m.grand_total)}</td>
      <td data-label="Action" class="muted" style="font-size:12.5px;white-space:nowrap;">${act(m.priority)}</td></tr>`).join('');
  }
  init();
})();
