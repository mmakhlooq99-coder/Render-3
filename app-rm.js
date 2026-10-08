(async function () {
  const root = document.getElementById('page-root');
  let merchants = [];
  let pollTimer = null;

  function statusPill(status) {
    return status === 'COMPLETED'
      ? '<span class="pill completed">● Completed</span>'
      : '<span class="pill pending">● Pending</span>';
  }

  function render() {
    const total = merchants.length;
    const completed = merchants.filter((m) => m.status === 'COMPLETED').length;
    const pending = total - completed;

    root.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="label">Assigned to me</div><div class="value">${total}</div></div>
        <div class="stat-card"><div class="label">Completed</div><div class="value success">${completed}</div></div>
        <div class="stat-card"><div class="label">Pending</div><div class="value warning">${pending}</div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>My assigned merchants</h3>
          <div class="toolbar" style="margin:0;">
            <select id="batch-filter"></select>
            <select id="status-filter">
              <option value="">All statuses</option>
              <option value="PENDING">Pending only</option>
              <option value="COMPLETED">Completed only</option>
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="data-table stack-mobile" id="merchant-table">
              <thead>
                <tr><th>MID</th><th>Merchant Name</th><th class="num">Value/Worth</th><th>Service Type</th><th>Current Rate</th><th>Contact 1</th><th>Contact 2</th><th>Contact 3</th><th>Status</th><th style="min-width:280px;">Feedback</th><th></th></tr>
              </thead>
              <tbody id="merchant-tbody"></tbody>
            </table>
          </div>
          <div id="empty-state" class="empty-state" style="display:none;">No merchants match the current filters.</div>
        </div>
      </div>
    `;

    document.getElementById('status-filter').addEventListener('change', renderRows);
    document.getElementById('batch-filter').addEventListener('change', load);
    populateBatchFilter();
    renderRows();
  }

  let batches = [];
  async function populateBatchFilter() {
    try {
      batches = (await api('/api/batches')).batches;
    } catch (e) { batches = []; }
    const sel = document.getElementById('batch-filter');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML =
      '<option value="">All weeks</option>' +
      batches.map((b) => `<option value="${b.id}">${escapeHtml(b.label)}</option>`).join('');
    if (current) sel.value = current;
  }

  function renderRows() {
    const statusFilter = document.getElementById('status-filter')?.value || '';
    const tbody = document.getElementById('merchant-tbody');
    const emptyState = document.getElementById('empty-state');
    const filtered = merchants.filter((m) => !statusFilter || m.status === statusFilter);
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered
      .map(
        (m) => `
      <tr data-id="${m.id}">
        <td data-label="MID">${escapeHtml(m.mid)}</td>
        <td data-label="Merchant"><div>${escapeHtml(m.merchant_name)}</div><div class="muted" style="font-size:11.5px;">${escapeHtml(m.batch_label)}</div></td>
        <td class="num" data-label="Value/Worth">${fmtMoney(m.value_worth)}</td>
        <td data-label="Service Type">${escapeHtml(m.service_type) || '<span class="muted">—</span>'}</td>
        <td data-label="Current Rate">${escapeHtml(m.current_rate) || '<span class="muted">—</span>'}</td>
        <td data-label="Contact 1">${escapeHtml(m.contact_1) || '<span class="muted">—</span>'}</td>
        <td data-label="Contact 2">${escapeHtml(m.contact_2) || '<span class="muted">—</span>'}</td>
        <td data-label="Contact 3">${escapeHtml(m.contact_3) || '<span class="muted">—</span>'}</td>
        <td data-label="Status" data-role="status-cell">${statusPill(m.status)}</td>
        <td class="feedback-cell" data-label="Feedback">
          <textarea placeholder="Write feedback here…">${escapeHtml(m.feedback)}</textarea>
          <div class="feedback-save-row">
            <span class="save-status" data-role="status"></span>
            <button class="btn small save-btn">Save</button>
          </div>
        </td>
        <td class="muted" style="font-size:11.5px; white-space:nowrap;" data-label="Updated">${m.feedback_updated_at ? 'Updated ' + fmtDate(m.feedback_updated_at) : ''}</td>
      </tr>
    `
      )
      .join('');

    tbody.querySelectorAll('tr').forEach((tr) => {
      const id = tr.getAttribute('data-id');
      const textarea = tr.querySelector('textarea');
      const btn = tr.querySelector('.save-btn');
      const statusEl = tr.querySelector('[data-role="status"]');
      btn.addEventListener('click', () => saveFeedback(id, textarea.value, btn, statusEl, tr));
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveFeedback(id, textarea.value, btn, statusEl, tr);
      });
    });
  }

  async function saveFeedback(id, feedback, btn, statusEl, tr) {
    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
    statusEl.textContent = '';
    statusEl.className = 'save-status';
    try {
      const { merchant } = await api('/api/merchants/' + id, { method: 'PUT', body: { feedback } });
      const idx = merchants.findIndex((m) => String(m.id) === String(id));
      if (idx !== -1) merchants[idx] = merchant;
      statusEl.textContent = 'Saved ✓';
      statusEl.className = 'save-status ok';
      const statusCell = tr.querySelector('[data-role="status-cell"]');
      if (statusCell) statusCell.innerHTML = statusPill(merchant.status);
      toast('Feedback saved', 'success');
    } catch (err) {
      statusEl.textContent = 'Failed to save';
      statusEl.className = 'save-status err';
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function load() {
    try {
      const batchId = document.getElementById('batch-filter')?.value || '';
      const qs = batchId ? ('?batchId=' + encodeURIComponent(batchId)) : '';
      const data = await api('/api/merchants' + qs);
      merchants = data.merchants;
      render();
    } catch (err) {
      root.innerHTML = `<div class="empty-state">Could not load your merchants: ${escapeHtml(err.message)}</div>`;
    }
  }

  await load();
  pollTimer = setInterval(load, 20000); // light polling so admin-side reassignments show up
})();
