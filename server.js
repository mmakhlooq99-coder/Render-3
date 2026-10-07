const http = require('node:http');
const url = require('node:url');
const path = require('node:path');

const { Router } = require('./router');
const { serveStatic, sendJson } = require('./http-helpers');
const auth = require('./auth');
const pages = require('./pages');
const api = require('./api');

const router = new Router();
pages.register(router);
api.register(router);

// Flat layout: public assets sit next to the server code, not in their own
// folder. Serve only this exact allowlist under /static/ so app source files
// (auth.js, db.js, etc., which also live in this directory) are never exposed.
const PUBLIC_DIR = __dirname;
const STATIC_ALLOWLIST = new Set(['styles.css', 'common.js', 'app-rm.js', 'app-admin.js', 'app-tracking.js', 'favicon.svg']);

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    // Static files
    if (pathname.startsWith('/static/')) {
      const rel = pathname.replace('/static/', '');
      if (!STATIC_ALLOWLIST.has(rel)) { sendJson(res, 404, { error: 'Not found' }); return; }
      serveStatic(res, path.join(PUBLIC_DIR, rel));
      return;
    }

    // Attach authenticated user (if any) to the request
    const cookies = auth.parseCookies(req);
    req.user = auth.getUserBySession(cookies.session);

    const match = router.match(req.method, pathname);
    if (!match) {
      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found' });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1><p><a href="/">Go home</a></p>');
      }
      return;
    }

    await match.handler(req, res, match.params, parsed.query);
  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Reactivation Merchant Platform listening on http://0.0.0.0:${PORT}`);
});

module.exports = server;
