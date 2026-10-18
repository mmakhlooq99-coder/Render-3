// "Explore the Update" API — compares a tracking snapshot with the one before it.
const { sendJson } = require('./http-helpers');
const q = require('./queries');

function safe(fn) {
  return async (req, res, params, query) => {
    try { await fn(req, res, params, query); }
    catch (e) { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: 'Server error' }); }
  };
}

function register(router) {
  router.get('/api/explore/changes', safe(async (req, res, params, query) => {
    if (!req.user) return sendJson(res, 401, { error: 'Not authenticated' });
    const batches = q.listTrackingBatches(); // newest first
    if (!batches.length) return sendJson(res, 200, { batch: null, previous: null, newMids: [], worsenedMids: [], recovered: [] });
    const batchId = query.batchId ? Number(query.batchId) : batches[0].id;
    const idx = batches.findIndex((b) => b.id === batchId);
    if (idx < 0) return sendJson(res, 404, { error: 'Snapshot not found' });
    const batch = batches[idx];
    const previous = batches[idx + 1] || null; // next older snapshot
    if (!previous) return sendJson(res, 200, { batch, previous: null, newMids: [], worsenedMids: [], recovered: [] });

    const scope = (id) => {
      const f = { batchId: id };
      if (req.user.role !== 'ADMIN') f.rmUserId = req.user.id; // RMs only see their own book
      return q.listTrackingMerchants(f);
    };
    const cur = scope(batch.id);
    const prev = scope(previous.id);
    const prevMap = new Map(prev.map((m) => [String(m.mid), m]));
    const curMap = new Map(cur.map((m) => [String(m.mid), m]));
    const rank = { Recent: 0, Watch: 1, Urgent: 2 };

    const newMids = [];
    const worsenedMids = [];
    for (const m of cur) {
      const p = prevMap.get(String(m.mid));
      if (!p) newMids.push(String(m.mid));
      else if ((rank[m.priority] ?? 0) > (rank[p.priority] ?? 0)) worsenedMids.push(String(m.mid));
    }
    const recovered = prev
      .filter((p) => !curMap.has(String(p.mid)))
      .map((p) => ({ mid: p.mid, merchant_name: p.merchant_name, rm_name: p.rm_name, priority: p.priority, grand_total: p.grand_total }));

    sendJson(res, 200, { batch, previous, newMids, worsenedMids, recovered });
  }));
}

module.exports = { register };
