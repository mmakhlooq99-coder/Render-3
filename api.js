const { sendJson, readJsonBody, readRawBody, setCookie } = require('./http-helpers');
const { parseMultipart } = require('./multipart');
const { parseCsv } = require('./csv-reader');
const { parseXlsxBuffer } = require('./xlsx-reader');
const auth = require('./auth');
const q = require('./queries');

function requireAuth(req, res) {
  if (!req.user) {
    sendJson(res, 401, { error: 'Not authenticated' });
    return false;
  }
  return true;
}

function requireAdmin(req, res) {
  if (!requireAuth(req, res)) return false;
  if (req.user.role !== 'ADMIN') {
    sendJson(res, 403, { error: 'Admin access required' });
    return false;
  }
  return true;
}

function safeHandler(fn) {
  return async (req, res, ...rest) => {
    try {
      await fn(req, res, ...rest);
    } catch (err) {
      const status = err.statusCode || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: err.message || 'Internal server error' });
    }
  };
}

function register(router) {
  // ---------- Auth ----------
  router.post('/api/login', safeHandler(async (req, res) => {
    const body = await readJsonBody(req);
    const username = (body.username || '').trim();
    const password = body.password || '';
    if (!username || !password) {
      sendJson(res, 400, { error: 'Username and password are required' });
      return;
    }
    const user = q.getUserByUsername(username);
    if (!user || !user.active) {
      sendJson(res, 401, { error: 'Invalid username or password' });
      return;
    }
    const ok = auth.verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) {
      sendJson(res, 401, { error: 'Invalid username or password' });
      return;
    }
    const session = auth.createSession(user.id);
    setCookie(res, 'session', session.token, { expires: new Date(session.expiresAt) });
    sendJson(res, 200, { redirect: user.role === 'ADMIN' ? '/admin' : '/rm' });
  }));

  router.post('/api/logout', safeHandler(async (req, res) => {
    const cookies = auth.parseCookies(req);
    if (cookies.session) auth.destroySession(cookies.session);
    setCookie(res, 'session', '', { maxAge: 0 });
    sendJson(res, 200, { ok: true });
  }));

  router.get('/api/me', safeHandler(async (req, res) => {
    if (!requireAuth(req, res)) return;
    const { id, name, username, role } = req.user;
    sendJson(res, 200, { id, name, username, role });
  }));

  router.post('/api/me/password', safeHandler(async (req, res) => {
    if (!requireAuth(req, res)) return;
    const body = await readJsonBody(req);
    if (!body.currentPassword || !body.newPassword) {
      sendJson(res, 400, { error: 'Current and new password are required' });
      return;
    }
    const ok = auth.verifyPassword(body.currentPassword, req.user.password_salt, req.user.password_hash);
    if (!ok) { sendJson(res, 401, { error: 'Current password is incorrect' }); return; }
    if (String(body.newPassword).length < 4) { sendJson(res, 400, { error: 'New password is too short' }); return; }
    const { hash, salt } = auth.hashPassword(body.newPassword);
    q.updateUser(req.user.id, { password_hash: hash, password_salt: salt });
    sendJson(res, 200, { ok: true });
  }));

  // ---------- Merchants ----------
  router.get('/api/merchants', safeHandler(async (req, res, params, query) => {
    if (!requireAuth(req, res)) return;
    const filters = {
      batchId: query.batchId ? Number(query.batchId) : undefined,
      status: query.status || undefined,
      mid: query.mid || undefined,
      name: query.name || undefined,
      latestBatchOnly: query.latest === '1',
    };
    if (req.user.role === 'ADMIN') {
      if (query.rmId) filters.rmUserId = Number(query.rmId);
    } else {
      filters.rmUserId = req.user.id; // RMs only ever see their own merchants
    }
    const rows = q.listMerchants(filters);
    sendJson(res, 200, { merchants: rows });
  }));

  router.put('/api/merchants/:id', safeHandler(async (req, res, params) => {
    if (!requireAuth(req, res)) return;
    const body = await readJsonBody(req);
    const updated = q.updateMerchantFeedback(Number(params.id), body.feedback ?? '', {
      allowUserId: req.user.id,
      isAdmin: req.user.role === 'ADMIN',
    });
    if (!updated) { sendJson(res, 404, { error: 'Merchant not found' }); return; }
    sendJson(res, 200, { merchant: updated });
  }));

  router.put('/api/merchants/:id/reassign', safeHandler(async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const body = await readJsonBody(req);
    const rmUserId = body.rmUserId ? Number(body.rmUserId) : null;
    const updated = q.reassignMerchant(Number(params.id), rmUserId);
    sendJson(res, 200, { merchant: updated });
  }));

  router.put('/api/merchants/:id/edit', safeHandler(async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const body = await readJsonBody(req);
    const fields = {};
    if (body.mid !== undefined) fields.mid = String(body.mid);
    if (body.merchantName !== undefined) fields.merchant_name = String(body.merchantName);
    if (body.valueWorth !== undefined) fields.value_worth = Number(body.valueWorth) || 0;
    const updated = q.editMerchantFields(Number(params.id), fields);
    sendJson(res, 200, { merchant: updated });
  }));

  // ---------- Batches ----------
  router.get('/api/batches', safeHandler(async (req, res) => {
    if (!requireAuth(req, res)) return;
    const batches = q.listBatches().map((b) => ({ ...b, stats: q.batchStats(b.id) }));
    sendJson(res, 200, { batches });
  }));

  router.get('/api/batches/:id/stats', safeHandler(async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const batchId = Number(params.id);
    sendJson(res, 200, {
      batch: q.getBatchById(batchId),
      stats: q.batchStats(batchId),
      perRm: q.perRmStatsForBatch(batchId),
    });
  }));

  router.post('/api/batches', safeHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      sendJson(res, 400, { error: 'Expected multipart/form-data upload with a file field' });
      return;
    }
    const buf = await readRawBody(req);
    const { fields, files } = parseMultipart(buf, contentType);
    const label = (fields.label || '').trim();
    const weekStart = (fields.weekStart || '').trim();
    if (!label || !weekStart) {
      sendJson(res, 400, { error: 'Batch label and week start date are required' });
      return;
    }
    const file = files.find((f) => f.fieldName === 'file');
    if (!file) {
      sendJson(res, 400, { error: 'No file uploaded' });
      return;
    }

    let rows;
    const lowerName = file.filename.toLowerCase();
    if (lowerName.endsWith('.xlsx')) {
      rows = parseXlsxBuffer(file.data);
    } else {
      rows = parseCsv(file.data.toString('utf8'));
    }
    if (!rows.length) { sendJson(res, 400, { error: 'The uploaded file is empty' }); return; }

    // Identify header row + column positions (flexible matching).
    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const findCol = (...names) => header.findIndex((h) => names.includes(h));
    const colRm = findCol('rm', 'relationship manager', 'rm name');
    const colMid = findCol('mid', 'merchant id');
    const colName = findCol('merchant name', 'merchant', 'name');
    const colValue = findCol('value', 'worth', 'value/worth', 'value / worth', 'amount');

    if (colMid === -1 || colName === -1) {
      sendJson(res, 400, {
        error: 'Could not find required columns. Expected headers: RM, MID, Merchant Name, Value/Worth',
      });
      return;
    }

    const activeRms = q.listUsers().filter((u) => u.role === 'RM');
    const rmByName = new Map(activeRms.map((u) => [u.name.trim().toLowerCase(), u]));
    const rmByUsername = new Map(activeRms.map((u) => [u.username.trim().toLowerCase(), u]));

    const batch = q.createBatch({ label, weekStart, createdBy: req.user.id });

    let inserted = 0;
    const unmatchedRmNames = new Set();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every((c) => String(c).trim() === '')) continue;
      const mid = colMid !== -1 ? String(r[colMid] ?? '').trim() : '';
      const merchantName = colName !== -1 ? String(r[colName] ?? '').trim() : '';
      if (!mid && !merchantName) continue;
      const rmRaw = colRm !== -1 ? String(r[colRm] ?? '').trim() : '';
      const valueRaw = colValue !== -1 ? String(r[colValue] ?? '').trim() : '0';
      const valueWorth = Number(String(valueRaw).replace(/[,$\s]/g, '')) || 0;

      let matchedUser = null;
      if (rmRaw) {
        matchedUser = rmByName.get(rmRaw.toLowerCase()) || rmByUsername.get(rmRaw.toLowerCase()) || null;
        if (!matchedUser) unmatchedRmNames.add(rmRaw);
      }

      q.insertMerchant({
        batchId: batch.id,
        rmUserId: matchedUser ? matchedUser.id : null,
        rmNameRaw: rmRaw || null,
        mid,
        merchantName,
        valueWorth,
      });
      inserted++;
    }

    sendJson(res, 200, {
      batch,
      inserted,
      unmatchedRmNames: Array.from(unmatchedRmNames),
    });
  }));

  // ---------- Stats ----------
  router.get('/api/stats', safeHandler(async (req, res, params, query) => {
    if (!requireAdmin(req, res)) return;
    const batchId = query.batchId ? Number(query.batchId) : undefined;
    sendJson(res, 200, {
      overall: q.overallStats({ batchId }),
      perRm: batchId ? q.perRmStatsForBatch(batchId) : [],
    });
  }));

  // ---------- Users (RM management) ----------
  router.get('/api/users', safeHandler(async (req, res, params, query) => {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { users: q.listUsers({ includeInactive: query.all === '1' }) });
  }));

  router.post('/api/users', safeHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = await readJsonBody(req);
    const name = (body.name || '').trim();
    const username = (body.username || '').trim();
    const password = body.password || '';
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'RM';
    if (!name || !username || !password) {
      sendJson(res, 400, { error: 'Name, username, and password are required' });
      return;
    }
    if (q.getUserByUsername(username)) {
      sendJson(res, 409, { error: 'That username is already taken' });
      return;
    }
    const { hash, salt } = auth.hashPassword(password);
    const user = q.insertUser({ name, username, passwordHash: hash, passwordSalt: salt, role });
    sendJson(res, 200, { user: { id: user.id, name: user.name, username: user.username, role: user.role, active: user.active } });
  }));

  router.put('/api/users/:id', safeHandler(async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const body = await readJsonBody(req);
    const fields = {};
    if (body.name !== undefined) fields.name = String(body.name).trim();
    if (body.username !== undefined) fields.username = String(body.username).trim();
    if (body.role !== undefined) fields.role = body.role === 'ADMIN' ? 'ADMIN' : 'RM';
    if (body.active !== undefined) fields.active = body.active ? 1 : 0;
    if (body.password) {
      const { hash, salt } = auth.hashPassword(body.password);
      fields.password_hash = hash;
      fields.password_salt = salt;
    }
    const updated = q.updateUser(Number(params.id), fields);
    sendJson(res, 200, { user: { id: updated.id, name: updated.name, username: updated.username, role: updated.role, active: updated.active } });
  }));

  router.del('/api/users/:id', safeHandler(async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    q.setUserActive(Number(params.id), false);
    sendJson(res, 200, { ok: true });
  }));
}

module.exports = { register };
