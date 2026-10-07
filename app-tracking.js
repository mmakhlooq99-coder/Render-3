(function () {
  const root = document.getElementById('page-root');
  let me = null;
  let isAdmin = false;
  let batches = [];
  let selectedBatchId = null;
  let merchants = [];
  let selectedRmId = ''; // admin only — '' means "all RMs"
  let selectedPriority = 'All';
  let sortMode = 'priority';

  const prioRank = { Urgent: 0, Watch: 1, Recent: 2 };
  const actionText = (p) => (p === 'Urgent' ? 'Call today' : p === 'Watch' ? 'Call this week' : 'Monitor');

  async function init() {
    try {
      me = await api('/api/me');
      isAdmin = me.role === 'ADMIN';
    } catch (e) { return; }
    await loadBatches();
    render();
  }

  async function loadBatches() {
    const data = await api('/api/tracking/batches');
    batches = data.batches;
    if (!selectedBatchId && batches.length) selectedBatchId = batches[0].id;
  }

  async function loadMerchants() {
    if (!selectedBatchId) { merchants = []; return; }
    const data = await api('/api/tracking/merchants?batchId=' + selectedBatchId);
    merchants = data.merchants;
  }

  function filteredSorted() {
    let rows = merchants;
    if (isAdmin && selectedRmId) rows = rows.filter((m) => String(m.rm_user_id) === String(selectedRmId));
    if (selectedPriority !== 'All') rows = rows.filter((m) => m.priority === selectedPriority);
    rows = rows.slice();
    if (sortMode === 'priority') rows.sort((a, b) => prioRank[a.priority] - prioRank[b.priority] || b.grand_total - a.grand_total);
    else if (sortMode === 'value') rows.sort((a, b) => b.grand_total - a.grand_total);
    else if (sortMode === 'days') rows.sort((a, b) => b.days_inactive - a.days_inactive);
    else if (sortMode === 'name') rows.sort((a, b) => a.merchant_name.localeCompare(b.merchant_name));
    return rows;
  }

  function rmSummaryRows() {
    const byRm = new Map();
    merchants.forEach((m) => {
      const key = m.rm_user_id || 'none';
      if (!byRm.has(key)) byRm.set(key, { rmId: m.rm_user_id, rmName: m.rm_name || 'Unassigned', total: 0, urgent: 0, value: 0 });
      const e = byRm.get(key);
      e.total++;
      if (m.priority === 'Urgent') e.urgent++;
      e.value += m.grand_total;
    });
    return Array.from(byRm.values()).sort((a, b) => b.value - a.value);
  }

  async function render() {
    const currentBatch = batches.find((b) => b.id === selectedBatchId);

    root.innerHTML = `
      ${isAdmin ? uploadCardHtml() : ''}
      ${batches.length === 0 ? emptyStateHtml() : mainHtml(currentBatch)}
    `;

    if (batches.length === 0) {
      if (isAdmin) wireUpload();
      return;
    }

    await loadMerchants();
    renderStats();
    if (isAdmin) renderRmGrid();
    renderList();
    wireControls();
    if (isAdmin) { wireUpload(); wireSnapshotDelete(); }
  }

  function emptyStateHtml() {
    return `<div class="card"><div class="card-body empty-state">${isAdmin ? 'No tracking snapshots uploaded yet. Use the form above to upload the first one.' : 'No tracking data yet — ask your admin to upload this week’s snapshot.'}</div></div>`;
  }

  function uploadCardHtml() {
    const today = new Date();
    return `
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header"><h3>Upload a tracking snapshot</h3></div>
        <div class="card-body">
          <div class="field">
            <label>Snapshot date (e.g. the day you're checking turnover for)</label>
            <input type="text" id="tr-date" value="${today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}" />
          </div>
          <div class="field">
            <label>Period this value covers (e.g. "Sep 1 – Oct 6, 2026")</label>
            <input type="text" id="tr-range" placeholder="Sep 1 – Oct 6, 2026" />
          </div>
          <div class="field">
            <label>Tracking file (.xlsx or .csv)</label>
            <input type="file" id="tr-file" accept=".csv,.xlsx" />
            <div class="help-text">Expected columns: <b>RM</b>, <b>MID</b>, <b>Merchant Name</b>, <b>Priority</b> (Urgent/Watch/Recent), <b>Status</b>, <b>Latest Day Value</b>, <b>Last Active</b>, <b>Days Inactive</b>, <b>Grand Total</b>. RM names are matched to existing accounts automatically.</div>
          </div>
          <button class="btn" id="tr-submit">Upload snapshot</button>
          <div id="tr-up-result" style="margin-top:16px;"></div>
        </div>
      </div>
      ${batches.length ? snapshotListHtml() : ''}
    `;
  }

  function snapshotListHtml() {
    return `
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header"><h3>Snapshots</h3></div>
        <div class="card-body">
          <div class="toolbar" style="margin-bottom:0;">
            <select id="tr-batch-select">
              ${batches.map((b) => `<option value="${b.id}" ${b.id === selectedBatchId ? 'selected' : ''}>${escapeHtml(b.date_label)} — ${escapeHtml(b.range_label)}</option>`).join('')}
            </select>
            <div class="spacer"></div>
            <button class="btn danger small" id="tr-delete-batch">Delete this snapshot</button>
          </div>
        </div>
      </div>
    `;
  }

  function mainHtml(currentBatch) {
    return `
      ${!isAdmin && batches.length > 1 ? `
      <div class="toolbar">
        <select id="tr-batch-select-rm">
          ${batches.map((b) => `<option value="${b.id}" ${b.id === selectedBatchId ? 'selected' : ''}>${escapeHtml(b.date_label)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="stats-grid" id="tr-stats"></div>
      ${isAdmin ? '<div class="section-title" style="margin:22px 0 10px; font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.03em;">Select an RM</div><div class="rm-pick-grid" id="tr-rm-grid"></div>' : ''}
      <div class="card">
        <div class="card-header">
          <h3>${currentBatch ? escapeHtml(currentBatch.date_label) + ' snapshot' : 'Merchants'}</h3>
          <select id="tr-sort">
            <option value="priority">Sort: Urgency</option>
            <option value="value">Sort: Value at risk</option>
            <option value="days">Sort: Days inactive</option>
            <option value="name">Sort: Merchant name</option>
          </select>
        </div>
        <div class="card-body">
          <div class="chip-row" id="tr-chips">
            <button class="chip active" data-p="All">All</button>
            <button class="chip" data-p="Urgent">Urgent</button>
            <button class="chip" data-p="Watch">Watch</button>
            <button class="chip" data-p="Recent">Recent</button>
          </div>
          <div class="table-wrap">
            <table class="data-table stack-mobile" id="tr-table">
              <thead>
                <tr>
                  <th>Priority</th><th>MID</th><th>Merchant</th>${isAdmin ? '<th>RM</th>' : ''}
                  <th>Status</th><th>Last Active</th><th class="num">Days Inactive</th>
                  <th class="num">Value at risk</th><th>Action</th>
                </tr>
              </thead>
              <tbody id="tr-tbody"></tbody>
            </table>
          </div>
          <div id="tr-empty" class="empty-state" style="display:none;">No merchants match this filter.</div>
        </div>
      </div>
    `;
  }

  function renderStats() {
    const el = document.getElementById('tr-stats');
    if (!el) return;
    const source = isAdmin && selectedRmId ? merchants.filter((m) => String(m.rm_user_id) === String(selectedRmId)) : merchants;
    const total = source.length;
    const urgent = source.filter((m) => m.priority === 'Urgent').length;
    const watch = source.filter((m) => m.priority === 'Watch').length;
    const value = source.reduce((s, m) => s + (m.grand_total || 0), 0);
    el.innerHTML = `
      <div class="stat-card"><div class="label">${isAdmin && selectedRmId ? 'This RM’s merchants' : 'Merchants to action'}</div><div class="value">${total}</div></div>
      <div class="stat-card"><div class="label">Urgent</div><div class="value warning" style="color:var(--danger);">${urgent}</div></div>
      <div class="stat-card"><div class="label">Watch</div><div class="value warning">${watch}</div></div>
      <div class="stat-card"><div class="label">Value at risk</div><div class="value">${fmtMoney(value)}</div></div>
    `;
  }

  function renderRmGrid() {
    const el = document.getElementById('tr-rm-grid');
    if (!el) return;
    const rows = rmSummaryRows();
    if (!rows.length) { el.innerHTML = `<div class="muted">No RM data in this snapshot.</div>`; return; }
    el.innerHTML = rows.map((r) => `
      <button class="rm-pick-card ${String(r.rmId) === String(selectedRmId) ? 'active' : ''}" data-rm="${r.rmId ?? ''}">
        <div class="name">${escapeHtml(r.rmName)}</div>
        <div class="row"><span>Accounts</span><b>${r.total}</b></div>
        <div class="row"><span>Urgent</span><b class="urgent-tag">${r.urgent}</b></div>
        <div class="row"><span>Value</span><b>${fmtMoney(r.value)}</b></div>
      </button>
    `).join('');
    el.querySelectorAll('.rm-pick-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rm = btn.getAttribute('data-rm');
        selectedRmId = String(selectedRmId) === rm ? '' : rm;
        renderStats();
        renderRmGrid();
        renderList();
      });
    });
  }

  function renderList() {
    document.querySelectorAll('#tr-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.p === selectedPriority));
    const tbody = document.getElementById('tr-tbody');
    const empty = document.getElementById('tr-empty');
    if (!tbody) return;
    const rows = filteredSorted();
    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = rows.map((m) => `
      <tr>
        <td data-label="Priority"><span class="pill ${m.priority.toLowerCase()}">${m.priority}</span></td>
        <td data-label="MID">${escapeHtml(m.mid)}</td>
        <td data-label="Merchant">${escapeHtml(m.merchant_name)}</td>
        ${isAdmin ? `<td data-label="RM">${escapeHtml(m.rm_name || 'Unassigned')}</td>` : ''}
        <td data-label="Status">${escapeHtml(m.status_label) || '<span class="muted">—</span>'}</td>
        <td data-label="Last Active">${escapeHtml(m.last_active_label) || '<span class="muted">—</span>'}</td>
        <td class="num" data-label="Days Inactive">${m.days_inactive ?? '—'}</td>
        <td class="num" data-label="Value at risk">${fmtMoney(m.grand_total)}</td>
        <td data-label="Action" class="muted" style="font-size:12.5px; white-space:nowrap;">${actionText(m.priority)}</td>
      </tr>
    `).join('');
  }

  function wireControls() {
    const batchSel = document.getElementById('tr-batch-select') || document.getElementById('tr-batch-select-rm');
    if (batchSel) {
      batchSel.addEventListener('change', async (e) => {
        selectedBatchId = Number(e.target.value);
        selectedRmId = '';
        selectedPriority = 'All';
        await render();
      });
    }
    const chips = document.getElementById('tr-chips');
    if (chips) {
      chips.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        selectedPriority = btn.dataset.p;
        renderList();
      });
    }
    const sortSel = document.getElementById('tr-sort');
    if (sortSel) {
      sortSel.value = sortMode;
      sortSel.addEventListener('change', (e) => { sortMode = e.target.value; renderList(); });
    }
  }

  function wireUpload() {
    const btn = document.getElementById('tr-submit');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const dateLabel = document.getElementById('tr-date').value.trim();
      const rangeLabel = document.getElementById('tr-range').value.trim();
      const fileInput = document.getElementById('tr-file');
      const resultEl = document.getElementById('tr-up-result');
      if (!dateLabel || !rangeLabel || !fileInput.files[0]) {
        toast('Please fill in the date, period, and choose a file', 'error');
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Uploading…';
      resultEl.innerHTML = '';
      const fd = new FormData();
      fd.append('dateLabel', dateLabel);
      fd.append('rangeLabel', rangeLabel);
      fd.append('file', fileInput.files[0]);
      try {
        const data = await api('/api/tracking/upload', { method: 'POST', body: fd });
        let html = `<div class="error-msg" style="background:var(--success-bg); color:var(--success);">Uploaded "${escapeHtml(data.batch.date_label)}" with <b>${data.inserted}</b> merchants.</div>`;
        if (data.unmatchedRmNames && data.unmatchedRmNames.length) {
          html += `<div class="error-msg">These RM names didn't match any account and were left unassigned: <b>${data.unmatchedRmNames.map(escapeHtml).join(', ')}</b>.</div>`;
        }
        resultEl.innerHTML = html;
        toast('Snapshot uploaded', 'success');
        fileInput.value = '';
        selectedBatchId = data.batch.id;
        await loadBatches();
        await render();
      } catch (err) {
        resultEl.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Upload snapshot';
      }
    });
  }

  function wireSnapshotDelete() {
    const btn = document.getElementById('tr-delete-batch');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const current = batches.find((b) => b.id === selectedBatchId);
      if (!current) return;
      if (!confirm(`Delete the "${current.date_label}" snapshot and all its merchants? This cannot be undone.`)) return;
      try {
        await api('/api/tracking/batches/' + selectedBatchId, { method: 'DELETE' });
        toast('Snapshot deleted', 'success');
        selectedBatchId = null;
        await loadBatches();
        await render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  init();
})();
