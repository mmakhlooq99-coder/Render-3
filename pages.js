const { page, loginPage } = require('./layout');
const { sendHtml } = require('./http-helpers');

function register(router) {
  router.get('/login', async (req, res, params, query) => {
    if (req.user) {
      sendHtml(res, 302, '');
      res.writeHead(302, { Location: req.user.role === 'ADMIN' ? '/admin' : '/rm' });
      res.end();
      return;
    }
    sendHtml(res, 200, loginPage({ error: query.error }));
  });

  router.get('/', async (req, res) => {
    if (!req.user) { res.writeHead(302, { Location: '/login' }); res.end(); return; }
    res.writeHead(302, { Location: req.user.role === 'ADMIN' ? '/admin' : '/rm' });
    res.end();
  });

  // ---------- RM dashboard ----------
  router.get('/rm', async (req, res) => {
    if (!req.user) { res.writeHead(302, { Location: '/login' }); res.end(); return; }
    const body = `
      <div id="page-root" data-page="rm"></div>
    `;
    sendHtml(res, 200, page({ title: 'My Merchants', user: req.user, activeNav: 'dashboard', bodyHtml: body, script: '/static/app-rm.js' }));
  });

  // ---------- Admin pages ----------
  function adminPage(req, res, { title, activeNav, dataPage }) {
    if (!req.user) { res.writeHead(302, { Location: '/login' }); res.end(); return; }
    if (req.user.role !== 'ADMIN') { res.writeHead(302, { Location: '/rm' }); res.end(); return; }
    const body = `<div id="page-root" data-page="${dataPage}"></div>`;
    sendHtml(res, 200, page({ title, user: req.user, activeNav, bodyHtml: body, script: '/static/app-admin.js' }));
  }

  router.get('/admin', async (req, res) => adminPage(req, res, { title: 'Overview', activeNav: 'overview', dataPage: 'overview' }));
  router.get('/admin/merchants', async (req, res) => adminPage(req, res, { title: 'All Merchants', activeNav: 'merchants', dataPage: 'merchants' }));
  router.get('/admin/history', async (req, res) => adminPage(req, res, { title: 'Weekly History', activeNav: 'history', dataPage: 'history' }));
  router.get('/admin/rms', async (req, res) => adminPage(req, res, { title: 'RM Management', activeNav: 'rms', dataPage: 'rms' }));
  router.get('/admin/upload', async (req, res) => adminPage(req, res, { title: 'Weekly Upload', activeNav: 'upload', dataPage: 'upload' }));

  // ---------- Merchant Tracking (shared page — content adapts by role) ----------
  router.get('/tracking', async (req, res) => {
    if (!req.user) { res.writeHead(302, { Location: '/login' }); res.end(); return; }
    const body = `<div id="page-root" data-page="tracking"></div>`;
    sendHtml(res, 200, page({ title: 'Merchant Tracking', user: req.user, activeNav: 'tracking', bodyHtml: body, script: '/static/app-tracking.js' }));
  });
}

module.exports = { register };
