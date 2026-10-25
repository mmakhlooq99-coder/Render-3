// Duplicate-MID tools (admin only). Finds merchants that appear more than once,
// shows every field of each copy, and deletes the copies the admin chooses.
const { sendJson, readJsonBody } = require('./http-helpers');
const db = require('./db');

function safe(fn) {
  return async (req, res, params, query) => {
    try { await fn(req, res, params, query); }
    catch (e) { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: 'Server error' }); }
  };
}
function admin(req, res) {
  if (!req.user) { sendJson(res, 401, { error: 'Not authenticated' }); return false; }
  if (req.user.role !== 'ADMIN') { sendJson(res, 403, { error: 'Admin access required' }); return false; }
  return true;
}

// 000123 and 123 are the same MID; stray spaces are ignored.
const normMid = (mid) => String(mid || '').trim().replace(/^0+/, '').toLowerCase();

function loadGroups(scope) {
  const rows = db.prepare(`
    SELECT m.*, u.name AS rm_name, b.label AS batch_label, b.week_start AS batch_week_start
    FROM merchants m
    LEFT JOIN users u ON u.id = m.rm_user_id
    JOIN batches b ON b.id = m.batch_id
    ORDER BY m.id`).all();
  const map = new Map();
  for (const r of rows) {
    const key = (scope === 'all' ? '' : r.batch_id + '|') + normMid(r.mid);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const groups = [];
  for (const [key, list] of map) {
    if (list.length < 2) continue;
    // Suggested copy to keep: the one RMs already worked on (latest feedback), else the newest upload.
    const worked = list.filter((r) => r.status === 'COMPLETED' || (r.feedback && r.feedback.trim()) || r.feedback_category);
    const pool = worked.length ? worked : list;
    const keeper = pool.slice().sort((a, b) =>
      String(b.feedback_updated_at || '').localeCompare(String(a.feedback_updated_at || '')) || b.id - a.id)[0];
    groups.push({ key, mid: list[0].mid, keeperId: keeper.id, rows: list });
  }
  groups.sort((a, b) => b.rows.length - a.rows.length || String(a.mid).localeCompare(String(b.mid)));
  return groups;
}

function register(router) {
  router.get('/api/duplicates', safe(async (req, res, params, query) => {
    if (!admin(req, res)) return;
    const scope = query.scope === 'all' ? 'all' : 'batch';
    const groups = loadGroups(scope);
    sendJson(res, 200, { scope, groups, extra: groups.reduce((s, g) => s + g.rows.length - 1, 0) });
  }));

  // Delete one specific copy.
  router.del('/api/duplicates/merchant/:id', safe(async (req, res, params) => {
    if (!admin(req, res)) return;
    const info = db.prepare('DELETE FROM merchants WHERE id = ?').run(Number(params.id));
    if (!info.changes) return sendJson(res, 404, { error: 'Merchant not found' });
    sendJson(res, 200, { ok: true, deleted: 1 });
  }));

  // Keep the suggested copy in each group (one group via `key`, or all) and delete the rest.
  router.post('/api/duplicates/clean', safe(async (req, res) => {
    if (!admin(req, res)) return;
    const body = await readJsonBody(req);
    const scope = body.scope === 'all' ? 'all' : 'batch';
    let groups = loadGroups(scope);
    if (body.key) groups = groups.filter((g) => g.key === body.key);
    const del = db.prepare('DELETE FROM merchants WHERE id = ?');
    let deleted = 0;
    db.exec('BEGIN');
    try {
      for (const g of groups) for (const r of g.rows) if (r.id !== g.keeperId) deleted += del.run(r.id).changes;
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    sendJson(res, 200, { ok: true, deleted, groups: groups.length });
  }));
}

module.exports = { register };
