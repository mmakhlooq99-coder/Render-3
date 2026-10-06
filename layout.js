function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page({ title, user, activeNav, bodyHtml, script }) {
  const isAdmin = user && user.role === 'ADMIN';
  const navItems = isAdmin
    ? [
        ['overview', '/admin', 'Overview'],
        ['merchants', '/admin/merchants', 'All Merchants'],
        ['history', '/admin/history', 'Weekly History'],
        ['rms', '/admin/rms', 'RM Management'],
        ['upload', '/admin/upload', 'Weekly Upload'],
      ]
    : [['dashboard', '/rm', 'My Merchants']];

  const navHtml = navItems
    .map(
      ([key, href, label]) =>
        `<div class="nav-item ${activeNav === key ? 'active' : ''}" onclick="location.href='${href}'">${escapeHtml(label)}</div>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · Reactivation Merchant Platform</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
<div id="toast-root"></div>
<div class="app">
  <div class="sidebar">
    <div class="brand">Reactivation Platform<small>Merchant Reactivation Tracking</small></div>
    ${navHtml}
    <div class="sidebar-footer">
      <div class="who"><b>${escapeHtml(user ? user.name : '')}</b>${isAdmin ? 'Administrator' : 'Relationship Manager'}</div>
      <button class="btn secondary block small" style="margin-bottom:8px;" onclick="openChangePasswordModal()">Change password</button>
      <button class="btn secondary block small" onclick="logout()">Log out</button>
    </div>
  </div>
  <div class="main">
    <div class="topbar">
      <h2>${escapeHtml(title)}</h2>
    </div>
    <div class="content" id="content">
      ${bodyHtml}
    </div>
  </div>
</div>
<script src="/static/common.js"></script>
${script ? `<script src="${script}"></script>` : ''}
</body>
</html>`;
}

function loginPage({ error }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Log in · Reactivation Merchant Platform</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <h1>Reactivation Merchant Platform</h1>
    <p class="sub">Sign in to continue</p>
    ${error ? `<div class="error-msg">${escapeHtml(error)}</div>` : ''}
    <form id="login-form">
      <div class="field">
        <label>Username</label>
        <input type="text" name="username" autocomplete="username" required autofocus />
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" autocomplete="current-password" required />
      </div>
      <button class="btn block" type="submit" id="login-btn">Log in</button>
    </form>
  </div>
</div>
<script>
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in…';
  const form = new FormData(e.target);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    location.href = data.redirect || '/';
  } catch (err) {
    location.href = '/login?error=' + encodeURIComponent(err.message);
  }
});
</script>
</body>
</html>`;
}

module.exports = { page, loginPage, escapeHtml };
