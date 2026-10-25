// "Explore the Update" API — Reactivation feedback explorer + CSV download. Read-only.
const { sendJson } = require('./http-helpers');
const q = require('./queries');

function safe(fn) {
  return async (req, res, params, query) => {
    try { await fn(req, res, params, query); }
    catch (e) { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: 'Server error' }); }
  };
}

// Same scoping rule as /api/merchants: RMs only ever get their own merchants.
function fetchRows(req, query) {
  const f = { limit: 200000 };
  if (query.batchId && query.batchId !== 'all') f.batchId = Number(query.batchId);
  if (req.user.role === 'ADMIN') { if (query.rmId) f.rmUserId = Number(query.rmId); }
  else f.rmUserId = req.user.id;
  if (query.status === 'PENDING' || query.status === 'COMPLETED') f.status = query.status;
  return q.listMerchants(f);
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}

function register(router) {
  router.get('/api/explore/feedback', safe(async (req, res, params, query) => {
    if (!req.user) return sendJson(res, 401, { error: 'Not authenticated' });
    const batches = q.listBatches();
    if (!query.batchId && batches.length) query.batchId = String(batches[0].id);
    sendJson(res, 200, { batches, merchants: fetchRows(req, query) });
  }));

  router.get('/api/explore/download', safe(async (req, res, params, query) => {
    if (!req.user) return sendJson(res, 401, { error: 'Not authenticated' });
    const rows = fetchRows(req, query);
    const head = ['Batch', 'Week Start', 'RM', 'MID', 'Merchant Name', 'Value Worth', 'Status', 'Outcome', 'Feedback', 'Feedback Updated'];
    const lines = [head.map(csvCell).join(',')];
    for (const m of rows) {
      lines.push([m.batch_label, m.batch_week_start, m.rm_name || m.rm_name_raw || 'Unassigned', m.mid, m.merchant_name,
        m.value_worth, m.status === 'COMPLETED' ? 'Completed' : 'Pending', m.feedback_category || '', m.feedback, m.feedback_updated_at || ''].map(csvCell).join(','));
    }
    const body = '﻿' + lines.join('\r\n'); // BOM so Excel reads Arabic/UTF-8 correctly
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="reactivation_feedback.csv"',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  }));
}

module.exports = { register };
