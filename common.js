function toast(message, type) {
  type = type || 'info';
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 3200);
}

async function api(path, opts) {
  opts = opts || {};
  const headers = opts.headers || {};
  let body = opts.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(path, { method: opts.method || 'GET', headers, body });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const msg = (data && data.error) || ('Request failed (' + res.status + ')');
    if (res.status === 401) { location.href = '/login'; }
    throw new Error(msg);
  }
  return data;
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  location.href = '/login';
}

function fmtMoney(n) {
  n = Number(n) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function openChangePasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h3>Change password</h3><span class="close-x">&times;</span></div>
      <div class="modal-body">
        <div class="field"><label>Current password</label><input type="password" id="cp-current" /></div>
        <div class="field"><label>New password</label><input type="password" id="cp-new" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="cp-cancel">Cancel</button>
        <button class="btn" id="cp-save">Update password</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('#cp-cancel').addEventListener('click', close);
  overlay.querySelector('#cp-save').addEventListener('click', async () => {
    const currentPassword = document.getElementById('cp-current').value;
    const newPassword = document.getElementById('cp-new').value;
    if (!currentPassword || !newPassword) { toast('Both fields are required', 'error'); return; }
    try {
      await api('/api/me/password', { method: 'POST', body: { currentPassword, newPassword } });
      toast('Password updated', 'success');
      close();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
