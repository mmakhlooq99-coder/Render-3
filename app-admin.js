(function () {
  const root = document.getElementById('page-root');
  const pageName = root.dataset.page;

  const PAGES = {
    overview: initOverview,
    merchants: initMerchants,
    history: initHistory,
    rms: initRms,
    upload: initUpload,
  };
  (PAGES[pageName] || function () {})();

  // ======================================================================
  // OVERVIEW
  // ======================================================================
  async function initOverview() {
    root.innerHTML = `<div id="ov-stats"></div><div id="ov-batches" style="margin-top:22px;"></div>`;
    try {
      const [batchesRes, statsRes] = await Promise.all([api('/api/batches'), api('/api/stats')]);
      const batches = batchesRes.batches;
      const overall = statsRes.overall;

      document.getElementById('ov-stats').innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="label">Total Merchants</div><div class="value">${overall.total}</div></div>
          <div class="stat-card"><div class="label">Completed</div><div class="value success">${overall.completed}</div></div>
          <div class="stat-card"><div class="label">Pending</div><div class="value warning">${overall.pending}</div></div>
          <div class="stat-card"><div class="label">Completion Rate</div><div class="value">${overall.rate}%</div></div>
        </div>
      `;

      const latest = batches[0];
      let latestBlock = '';
      if (latest) {
        const perRm = await api('/api/batches/' + latest.id + '/stats');
        latestBlock = `
          <div class="card">
            <div class="card-header"><h3>Latest week — ${escapeHtml(latest.label)}</h3>
              <a href="/admin/history" class="btn secondary small">View all weeks</a>
            </div>
            <div class="card-body">
              <div class="row" style="margin-bottom:16px;">
                <div class="progress-bar" style="flex:1;"><div class="fill" style="width:${latest.stats.rate}%"></div></div>
                <span class="muted">${latest.stats.completed}/${latest.stats.total} complete (${latest.stats.rate}%)</span>
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>RM</th><th class="num">Assigned</th><th class="num">Completed</th><th class="num">Pending</th><th class="num">Rate</th></tr></thead>
                  <tbody>
                    ${perRm.perRm
                      .map(
                        (r) => `<tr>
                          <td>${escapeHtml(r.rmName)}</td>
                          <td class="num">${r.total}</td>
                          <td class="num">${r.completed}</td>
                          <td class="num">${r.pending}</td>
                          <td class="num">${r.rate}%</td>
                        </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      } else {
        latestBlock = `<div class="card"><div class="card-body empty-state">No weekly batches uploaded yet. <a href="/admin/upload">Upload the first weekly list →</a></div></div>`;
      }
      document.getElementById('ov-batches').innerHTML = latestBlock;
    } catch (err) {
      root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  // ======================================================================
  // ALL MERCHANTS
  // ======================================================================
  async function initMerchants() {
    root.innerHTML = `
      <div class="toolbar">
        <input type="text" id="f-mid" placeholder="Search MID…" />
        <input type="text" id="f-name" placeholder="Search merchant name…" />
        <select id="f-rm"><option value="">All RMs</option></select>
        <select id="f-batch"><option value="">All weeks</option></select>
        <select id="f-status">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <div class="spacer"></div>
        <button class="btn secondary small" id="refresh-btn">Refresh</button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Week</th><th>RM</th><th>MID</th><th>Merchant Name</th><th class="num">Value/Worth</th><th>Service Type</th><th>Current Rate</th><th>Status</th><th>Feedback</th><th>Updated</th></tr></thead>
              <tbody id="m-tbody"></tbody>
            </table>
          </div>
          <div id="m-empty" class="empty-state" style="display:none;">No merchants match these filters.</div>
        </div>
      </div>
    `;

    const [users, batches] = await Promise.all([api('/api/users'), api('/api/batches')]);
    const rms = users.users.filter((u) => u.role === 'RM');
    document.getElementById('f-rm').innerHTML += rms.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    document.getElementById('f-batch').innerHTML += batches.batches.map((b) => `<option value="${b.id}">${escapeHtml(b.label)}</option>`).join('');

    async function load() {
      const params = new URLSearchParams();
      const mid = document.getElementById('f-mid').value.trim();
      const name = document.getElementById('f-name').value.trim();
      const rmId = document.getElementById('f-rm').value;
      const batchId = document.getElementById('f-batch').value;
      const status = document.getElementById('f-status').value;
      if (mid) params.set('mid', mid);
      if (name) params.set('name', name);
      if (rmId) params.set('rmId', rmId);
      if (batchId) params.set('batchId', batchId);
      if (status) params.set('status', status);

      const data = await api('/api/merchants?' + params.toString());
      renderTable(data.merchants, rms);
    }

    function renderTable(merchants, rms) {
      const tbody = document.getElementById('m-tbody');
      const empty = document.getElementById('m-empty');
      if (!merchants.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';
      tbody.innerHTML = merchants
        .map(
          (m) => `
        <tr data-id="${m.id}">
          <td class="muted" style="white-space:nowrap;">${escapeHtml(m.batch_label)}</td>
          <td>
            <select class="rm-select" style="font-size:12.5px; padding:4px 6px;">
              <option value="">Unassigned</option>
              ${rms.map((r) => `<option value="${r.id}" ${r.id === m.rm_user_id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
            </select>
            ${m.rm_name_raw && !m.rm_user_id ? `<div class="muted" style="font-size:11px;">from file: "${escapeHtml(m.rm_name_raw)}"</div>` : ''}
          </td>
          <td>${escapeHtml(m.mid)}</td>
          <td>${escapeHtml(m.merchant_name)}</td>
          <td class="num">${fmtMoney(m.value_worth)}</td>
          <td>${escapeHtml(m.service_type) || '<span class="muted">—</span>'}</td>
          <td>${escapeHtml(m.current_rate) || '<span class="muted">—</span>'}</td>
          <td>${m.status === 'COMPLETED' ? '<span class="pill completed">● Completed</span>' : '<span class="pill pending">● Pending</span>'}</td>
          <td style="max-width:260px; white-space:pre-wrap;">${escapeHtml(m.feedback) || '<span class="muted">—</span>'}</td>
          <td class="muted" style="font-size:11.5px; white-space:nowrap;">${m.feedback_updated_at ? fmtDate(m.feedback_updated_at) : '—'}</td>
        </tr>
      `
        )
        .join('');

      tbody.querySelectorAll('.rm-select').forEach((sel) => {
        sel.addEventListener('change', async (e) => {
          const tr = e.target.closest('tr');
          const id = tr.getAttribute('data-id');
          try {
            await api('/api/merchants/' + id + '/reassign', { method: 'PUT', body: { rmUserId: e.target.value || null } });
            toast('Merchant reassigned', 'success');
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    }

    ['f-mid', 'f-name'].forEach((id) => document.getElementById(id).addEventListener('input', debounce(load, 350)));
    ['f-rm', 'f-batch', 'f-status'].forEach((id) => document.getElementById(id).addEventListener('change', load));
    document.getElementById('refresh-btn').addEventListener('click', load);

    await load();
  }

  // ======================================================================
  // WEEKLY HISTORY
  // ======================================================================
  async function initHistory() {
    root.innerHTML = `<div id="hist-list"></div>`;
    const { batches } = await api('/api/batches');
    if (!batches.length) {
      document.getElementById('hist-list').innerHTML = `<div class="card"><div class="card-body empty-state">No weekly batches yet.</div></div>`;
      return;
    }
    document.getElementById('hist-list').innerHTML = batches
      .map(
        (b, i) => `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header">
          <div style="cursor:pointer; flex:1;" data-toggle="${b.id}">
            <h3>${escapeHtml(b.label)}</h3>
            <div class="muted" style="font-size:12.5px; margin-top:2px;">Week start: ${escapeHtml(b.week_start)} · ${b.stats.total} merchants · ${b.stats.completed} completed · ${b.stats.pending} pending</div>
          </div>
          <div class="row">
            <div class="progress-bar" style="width:140px;"><div class="fill" style="width:${b.stats.rate}%"></div></div>
            <span class="muted">${b.stats.rate}%</span>
            <span class="muted" id="chev-${b.id}" data-toggle="${b.id}" style="cursor:pointer;">▾</span>
            <button class="btn danger small" data-delete-batch="${b.id}" title="Delete this whole batch">Delete</button>
          </div>
        </div>
        <div class="card-body" id="body-${b.id}" style="display:${i === 0 ? 'block' : 'none'};">
          <div class="muted">Loading…</div>
        </div>
      </div>
    `
      )
      .join('');

    document.querySelectorAll('[data-toggle]').forEach((header) => {
      header.addEventListener('click', async () => {
        const id = header.getAttribute('data-toggle');
        const body = document.getElementById('body-' + id);
        const chev = document.getElementById('chev-' + id);
        const show = body.style.display === 'none';
        body.style.display = show ? 'block' : 'none';
        chev.textContent = show ? '▴' : '▾';
        if (show && !body.dataset.loaded) {
          await loadBatchDetail(id, body);
          body.dataset.loaded = '1';
        }
      });
    });

    document.querySelectorAll('[data-delete-batch]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete-batch');
        const card = btn.closest('.card');
        const label = card.querySelector('h3').textContent;
        if (!confirm(`Delete "${label}" and all its merchants? This cannot be undone.`)) return;
        try {
          await api('/api/batches/' + id, { method: 'DELETE' });
          toast('Batch deleted', 'success');
          card.remove();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    // auto-expand first
    const first = batches[0];
    const firstBody = document.getElementById('body-' + first.id);
    await loadBatchDetail(first.id, firstBody);
    firstBody.dataset.loaded = '1';
  }

  async function loadBatchDetail(batchId, container) {
    const [detail, merchantsRes] = await Promise.all([
      api('/api/batches/' + batchId + '/stats'),
      api('/api/merchants?batchId=' + batchId),
    ]);
    container.innerHTML = `
      <div class="table-wrap" style="margin-bottom:18px;">
        <table class="data-table">
          <thead><tr><th>RM</th><th class="num">Assigned</th><th class="num">Completed</th><th class="num">Pending</th><th class="num">Rate</th></tr></thead>
          <tbody>
            ${detail.perRm
              .map(
                (r) => `<tr><td>${escapeHtml(r.rmName)}</td><td class="num">${r.total}</td><td class="num">${r.completed}</td><td class="num">${r.pending}</td><td class="num">${r.rate}%</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>MID</th><th>Merchant</th><th>RM</th><th class="num">Value</th><th>Service Type</th><th>Current Rate</th><th>Status</th><th>Feedback</th><th>Updated</th></tr></thead>
          <tbody>
            ${merchantsRes.merchants
              .map(
                (m) => `<tr>
                  <td>${escapeHtml(m.mid)}</td>
                  <td>${escapeHtml(m.merchant_name)}</td>
                  <td>${escapeHtml(m.rm_name || 'Unassigned')}</td>
                  <td class="num">${fmtMoney(m.value_worth)}</td>
                  <td>${escapeHtml(m.service_type) || '<span class="muted">—</span>'}</td>
                  <td>${escapeHtml(m.current_rate) || '<span class="muted">—</span>'}</td>
                  <td>${m.status === 'COMPLETED' ? '<span class="pill completed">● Completed</span>' : '<span class="pill pending">● Pending</span>'}</td>
                  <td style="max-width:240px; white-space:pre-wrap;">${escapeHtml(m.feedback) || '<span class="muted">—</span>'}</td>
                  <td class="muted" style="font-size:11.5px;">${m.feedback_updated_at ? fmtDate(m.feedback_updated_at) : '—'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ======================================================================
  // RM MANAGEMENT
  // ======================================================================
  async function initRms() {
    root.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Relationship Managers &amp; Admins</h3>
          <button class="btn small" id="add-rm-btn">+ Add user</button>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
              <tbody id="rm-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    async function load() {
      const { users } = await api('/api/users?all=1');
      document.getElementById('rm-tbody').innerHTML = users
        .map(
          (u) => `
        <tr data-id="${u.id}">
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.username)}</td>
          <td><span class="pill ${u.role === 'ADMIN' ? 'admin' : 'rm'}">${u.role}</span></td>
          <td>${u.active ? '<span class="pill completed">Active</span>' : '<span class="pill inactive">Inactive</span>'}</td>
          <td class="row">
            <button class="btn secondary small edit-btn">Edit</button>
            ${u.active ? '<button class="btn danger small deactivate-btn">Deactivate</button>' : ''}
          </td>
        </tr>
      `
        )
        .join('');

      document.querySelectorAll('.edit-btn').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          const id = e.target.closest('tr').getAttribute('data-id');
          const u = users.find((x) => String(x.id) === id);
          openUserModal(u, load);
        })
      );
      document.querySelectorAll('.deactivate-btn').forEach((btn) =>
        btn.addEventListener('click', async (e) => {
          const id = e.target.closest('tr').getAttribute('data-id');
          if (!confirm('Deactivate this user? They will no longer be able to log in. Their historical records are kept.')) return;
          try {
            await api('/api/users/' + id, { method: 'DELETE' });
            toast('User deactivated', 'success');
            load();
          } catch (err) {
            toast(err.message, 'error');
          }
        })
      );
    }

    document.getElementById('add-rm-btn').addEventListener('click', () => openUserModal(null, load));
    await load();
  }

  function openUserModal(user, onDone) {
    const isEdit = !!user;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit user' : 'Add user'}</h3>
          <span class="close-x">&times;</span>
        </div>
        <div class="modal-body">
          <div class="field"><label>Full name</label><input type="text" id="um-name" value="${isEdit ? escapeHtml(user.name) : ''}" /></div>
          <div class="field"><label>Username</label><input type="text" id="um-username" value="${isEdit ? escapeHtml(user.username) : ''}" /></div>
          <div class="field"><label>${isEdit ? 'Reset password (leave blank to keep current)' : 'Password'}</label><input type="text" id="um-password" placeholder="${isEdit ? '••••••••' : ''}" /></div>
          <div class="field"><label>Role</label>
            <select id="um-role">
              <option value="RM" ${isEdit && user.role === 'RM' ? 'selected' : ''}>Relationship Manager</option>
              <option value="ADMIN" ${isEdit && user.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
          <div class="help-text">Tip: set the password to match what this person already uses on your existing platform, so they don't need to learn a new one.</div>
        </div>
        <div class="modal-footer">
          <button class="btn secondary" id="um-cancel">Cancel</button>
          <button class="btn" id="um-save">${isEdit ? 'Save changes' : 'Create user'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.close-x').addEventListener('click', close);
    overlay.querySelector('#um-cancel').addEventListener('click', close);

    overlay.querySelector('#um-save').addEventListener('click', async () => {
      const name = document.getElementById('um-name').value.trim();
      const username = document.getElementById('um-username').value.trim();
      const password = document.getElementById('um-password').value;
      const role = document.getElementById('um-role').value;
      if (!name || !username || (!isEdit && !password)) {
        toast('Name, username, and password are required', 'error');
        return;
      }
      try {
        if (isEdit) {
          const body = { name, username, role };
          if (password) body.password = password;
          await api('/api/users/' + user.id, { method: 'PUT', body });
          toast('User updated', 'success');
        } else {
          await api('/api/users', { method: 'POST', body: { name, username, password, role } });
          toast('User created', 'success');
        }
        close();
        onDone();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ======================================================================
  // WEEKLY UPLOAD
  // ======================================================================
  async function initUpload() {
    const today = new Date();
    const defaultDate = today.toISOString().slice(0, 10);
    root.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Upload this week's merchant list</h3></div>
        <div class="card-body">
          <div class="field">
            <label>Batch label</label>
            <input type="text" id="up-label" value="Reactivation – Week of ${today.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}" />
          </div>
          <div class="field">
            <label>Week start date</label>
            <input type="date" id="up-date" value="${defaultDate}" />
          </div>
          <div class="field">
            <label>Merchant file (.xlsx or .csv)</label>
            <input type="file" id="up-file" accept=".csv,.xlsx" />
            <div class="help-text">Expected columns: <b>RM</b>, <b>MID</b>, <b>Merchant Name</b>, <b>Value/Worth</b>, <b>Service Type</b>, <b>Current Rate</b>. RM names are matched to existing user accounts automatically — anything that doesn't match stays unassigned so you can assign it manually. Uploaded the wrong file? You can delete the whole batch afterward from <a href="/admin/history">Weekly History</a>.</div>
          </div>
          <button class="btn" id="up-submit">Upload &amp; create weekly batch</button>
          <div id="up-result" style="margin-top:18px;"></div>
        </div>
      </div>
    `;

    document.getElementById('up-submit').addEventListener('click', async () => {
      const label = document.getElementById('up-label').value.trim();
      const weekStart = document.getElementById('up-date').value;
      const fileInput = document.getElementById('up-file');
      const resultEl = document.getElementById('up-result');
      if (!label || !weekStart || !fileInput.files[0]) {
        toast('Please fill in the label, date, and choose a file', 'error');
        return;
      }
      const btn = document.getElementById('up-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Uploading…';
      resultEl.innerHTML = '';

      const fd = new FormData();
      fd.append('label', label);
      fd.append('weekStart', weekStart);
      fd.append('file', fileInput.files[0]);

      try {
        const data = await api('/api/batches', { method: 'POST', body: fd });
        let html = `<div class="error-msg" style="background:var(--success-bg); color:var(--success);">
          Created "${escapeHtml(data.batch.label)}" with <b>${data.inserted}</b> merchants.
        </div>`;
        if (data.unmatchedRmNames && data.unmatchedRmNames.length) {
          html += `<div class="error-msg">
            These RM names in the file didn't match any user account and were left unassigned: <b>${data.unmatchedRmNames.map(escapeHtml).join(', ')}</b>.
            Go to <a href="/admin/merchants">All Merchants</a> to assign them manually, or add matching RM accounts in <a href="/admin/rms">RM Management</a>.
          </div>`;
        }
        html += `<a class="btn secondary" href="/admin/history">View in Weekly History</a>`;
        resultEl.innerHTML = html;
        toast('Weekly batch created', 'success');
        fileInput.value = '';
      } catch (err) {
        resultEl.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = "Upload & create weekly batch";
      }
    });
  }
})();
