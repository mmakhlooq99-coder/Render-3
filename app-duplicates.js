(function () {
  const root = document.getElementById('page-root');
  let scope = 'batch', groups = [], extra = 0;
  const E = escapeHtml;
  const dash = (v) => E(v) || '<span class="muted">—</span>';

  async function load() {
    root.innerHTML = '<div class="empty-state">Looking for duplicates…</div>';
    try {
      const d = await api('/api/duplicates?scope=' + scope);
      groups = d.groups; extra = d.extra;
    } catch (e) { root.innerHTML = `<div class="empty-state">${E(e.message)}</div>`; return; }
    draw();
  }

  function csvBackup(rowsToSave) {
    const head = ['Week', 'RM', 'MID', 'Merchant', 'Value', 'Service Type', 'Current Rate', 'Contact 1', 'Contact 2', 'Contact 3', 'Status', 'Outcome', 'Feedback', 'Updated'];
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [head.map(cell).join(',')].concat(rowsToSave.map((m) => [m.batch_label, m.rm_name || m.rm_name_raw || '', m.mid, m.merchant_name, m.value_worth, m.service_type, m.current_rate, m.contact_1, m.contact_2, m.contact_3, m.status, m.feedback_category, m.feedback, m.feedback_updated_at || ''].map(cell).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deleted_duplicates_backup.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function draw() {
    root.innerHTML = `
      <div class="toolbar">
        <select id="dp-scope">
          <option value="batch" ${scope === 'batch' ? 'selected' : ''}>Same MID twice in the same week</option>
          <option value="all" ${scope === 'all' ? 'selected' : ''}>Same MID in any week (includes normal weekly repeats)</option>
        </select>
        <div class="spacer"></div>
        <button class="btn secondary small" id="dp-refresh">Refresh</button>
        <button class="btn danger small" id="dp-clean" ${groups.length ? '' : 'disabled'}>Clean all duplicates</button>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="label">MIDs with duplicates</div><div class="value">${groups.length}</div></div>
        <div class="stat-card"><div class="label">Extra records to remove</div><div class="value warning">${extra}</div></div>
      </div>
      <p class="muted" style="font-size:13px; margin:0 0 14px;">For each MID the copy RMs already worked on (latest feedback) is suggested to keep; if none, the newest upload. Deleting removes the whole record: name, contacts, rate, feedback. A backup CSV is downloaded before any bulk clean.</p>
      <div id="dp-list"></div>`;
    document.getElementById('dp-scope').addEventListener('change', (e) => { scope = e.target.value; load(); });
    document.getElementById('dp-refresh').addEventListener('click', load);
    document.getElementById('dp-clean').addEventListener('click', cleanAll);
    const list = document.getElementById('dp-list');
    if (!groups.length) { list.innerHTML = '<div class="card"><div class="card-body empty-state">No duplicate MIDs found 🎉</div></div>'; return; }
    list.innerHTML = groups.map((g, gi) => `
      <div class="card" style="margin-bottom:14px;" data-g="${gi}">
        <div class="card-header"><h3>MID ${E(g.mid)} <span class="muted" style="font-weight:400;">· ${g.rows.length} copies</span></h3>
          <button class="btn secondary small" data-clean-group="${gi}">Keep suggested, delete others</button></div>
        <div class="card-body"><div class="table-wrap"><table class="data-table">
          <thead><tr><th></th><th>Week</th><th>RM</th><th>Merchant</th><th class="num">Value</th><th>Service</th><th>Rate</th><th>Contact 1</th><th>Contact 2</th><th>Contact 3</th><th>Outcome</th><th>Feedback</th><th></th></tr></thead>
          <tbody>${g.rows.map((m) => `<tr>
            <td>${m.id === g.keeperId ? '<span class="pill completed">Keep</span>' : ''}</td>
            <td class="muted" style="white-space:nowrap;">${E(m.batch_label)}</td>
            <td>${dash(m.rm_name || m.rm_name_raw)}</td><td>${E(m.merchant_name)}</td><td class="num">${fmtMoney(m.value_worth)}</td>
            <td>${dash(m.service_type)}</td><td>${dash(m.current_rate)}</td>
            <td style="white-space:nowrap;">${dash(m.contact_1)}</td><td style="white-space:nowrap;">${dash(m.contact_2)}</td><td style="white-space:nowrap;">${dash(m.contact_3)}</td>
            <td style="white-space:nowrap;">${dash(m.feedback_category)}</td>
            <td style="max-width:240px; white-space:pre-wrap;">${dash(m.feedback)}</td>
            <td><button class="btn danger small" data-del="${m.id}" data-g="${gi}">Delete</button></td></tr>`).join('')}</tbody>
        </table></div></div></div>`).join('');
    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const g = groups[Number(b.dataset.g)]; const m = g.rows.find((r) => String(r.id) === b.dataset.del);
      if (!confirm(`Delete this record of MID ${m.mid} (${m.merchant_name}, ${m.batch_label})? This cannot be undone.`)) return;
      csvBackup([m]);
      try { await api('/api/duplicates/merchant/' + m.id, { method: 'DELETE' }); toast('Record deleted', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    list.querySelectorAll('[data-clean-group]').forEach((b) => b.addEventListener('click', async () => {
      const g = groups[Number(b.dataset.cleanGroup)];
      const toDelete = g.rows.filter((r) => r.id !== g.keeperId);
      if (!confirm(`Keep the suggested copy of MID ${g.mid} and delete ${toDelete.length} other record(s)? This cannot be undone.`)) return;
      csvBackup(toDelete);
      try { const r = await api('/api/duplicates/clean', { method: 'POST', body: { scope, key: g.key } }); toast(r.deleted + ' deleted', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }

  async function cleanAll() {
    if (!confirm(`Delete ${extra} duplicate record(s) across ${groups.length} MIDs, keeping the suggested copy of each? A backup CSV will download first. This cannot be undone.`)) return;
    csvBackup(groups.flatMap((g) => g.rows.filter((r) => r.id !== g.keeperId)));
    try { const r = await api('/api/duplicates/clean', { method: 'POST', body: { scope } }); toast(r.deleted + ' duplicate records deleted', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  load();
})();
