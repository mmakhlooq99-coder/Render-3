const db = require('./db');

// ---------- Users ----------
function listUsers({ includeInactive = false } = {}) {
  const sql = includeInactive
    ? 'SELECT id, name, username, role, active, created_at FROM users ORDER BY role DESC, name ASC'
    : "SELECT id, name, username, role, active, created_at FROM users WHERE active = 1 ORDER BY role DESC, name ASC";
  return db.prepare(sql).all();
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function insertUser({ name, username, passwordHash, passwordSalt, role }) {
  const info = db
    .prepare('INSERT INTO users (name, username, password_hash, password_salt, role) VALUES (?,?,?,?,?)')
    .run(name, username, passwordHash, passwordSalt, role);
  return getUserById(Number(info.lastInsertRowid));
}

function updateUser(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return getUserById(id);
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getUserById(id);
}

function setUserActive(id, active) {
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

// ---------- Batches ----------
function createBatch({ label, weekStart, createdBy }) {
  const info = db
    .prepare('INSERT INTO batches (label, week_start, created_by) VALUES (?,?,?)')
    .run(label, weekStart, createdBy);
  return getBatchById(Number(info.lastInsertRowid));
}

function getBatchById(id) {
  return db.prepare('SELECT * FROM batches WHERE id = ?').get(id);
}

function listBatches() {
  return db.prepare('SELECT * FROM batches ORDER BY week_start DESC, id DESC').all();
}

function batchStats(batchId) {
  const total = db.prepare('SELECT COUNT(*) c FROM merchants WHERE batch_id = ?').get(batchId).c;
  const completed = db
    .prepare("SELECT COUNT(*) c FROM merchants WHERE batch_id = ? AND status = 'COMPLETED'")
    .get(batchId).c;
  return { total, completed, pending: total - completed, rate: total ? Math.round((completed / total) * 1000) / 10 : 0 };
}

function perRmStatsForBatch(batchId) {
  return db
    .prepare(
      `SELECT
         u.id as rm_id, u.name as rm_name,
         COUNT(m.id) as total,
         SUM(CASE WHEN m.status='COMPLETED' THEN 1 ELSE 0 END) as completed
       FROM merchants m
       LEFT JOIN users u ON u.id = m.rm_user_id
       WHERE m.batch_id = ?
       GROUP BY u.id
       ORDER BY rm_name IS NULL, rm_name ASC`
    )
    .all(batchId)
    .map((r) => ({
      rmId: r.rm_id,
      rmName: r.rm_name || 'Unassigned',
      total: r.total,
      completed: r.completed,
      pending: r.total - r.completed,
      rate: r.total ? Math.round((r.completed / r.total) * 1000) / 10 : 0,
    }));
}

// ---------- Merchants ----------
function insertMerchant({ batchId, rmUserId, rmNameRaw, mid, merchantName, valueWorth }) {
  const info = db
    .prepare(
      `INSERT INTO merchants (batch_id, rm_user_id, rm_name_raw, mid, merchant_name, value_worth)
       VALUES (?,?,?,?,?,?)`
    )
    .run(batchId, rmUserId || null, rmNameRaw || null, mid, merchantName, valueWorth || 0);
  return Number(info.lastInsertRowid);
}

function getMerchantById(id) {
  return db
    .prepare(
      `SELECT m.*, u.name as rm_name, b.label as batch_label, b.week_start as batch_week_start
       FROM merchants m
       LEFT JOIN users u ON u.id = m.rm_user_id
       JOIN batches b ON b.id = m.batch_id
       WHERE m.id = ?`
    )
    .get(id);
}

function listMerchants(filters = {}) {
  const where = [];
  const vals = [];
  if (filters.batchId) { where.push('m.batch_id = ?'); vals.push(filters.batchId); }
  if (filters.rmUserId) { where.push('m.rm_user_id = ?'); vals.push(filters.rmUserId); }
  if (filters.status) { where.push('m.status = ?'); vals.push(filters.status); }
  if (filters.mid) { where.push('m.mid LIKE ?'); vals.push(`%${filters.mid}%`); }
  if (filters.name) { where.push('m.merchant_name LIKE ?'); vals.push(`%${filters.name}%`); }
  if (filters.latestBatchOnly) { where.push('m.batch_id = (SELECT id FROM batches ORDER BY week_start DESC, id DESC LIMIT 1)'); }

  const sql = `
    SELECT m.*, u.name as rm_name, b.label as batch_label, b.week_start as batch_week_start
    FROM merchants m
    LEFT JOIN users u ON u.id = m.rm_user_id
    JOIN batches b ON b.id = m.batch_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY b.week_start DESC, m.id DESC
    LIMIT ${filters.limit ? Number(filters.limit) : 2000}
  `;
  return db.prepare(sql).all(...vals);
}

function updateMerchantFeedback(id, feedback, { allowUserId = null, isAdmin = false } = {}) {
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(id);
  if (!merchant) return null;
  if (!isAdmin && allowUserId != null && merchant.rm_user_id !== allowUserId) {
    const err = new Error('You are not assigned to this merchant');
    err.statusCode = 403;
    throw err;
  }
  const status = feedback && feedback.trim().length > 0 ? 'COMPLETED' : 'PENDING';
  db.prepare(
    `UPDATE merchants SET feedback = ?, status = ?, feedback_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(feedback, status, id);
  return getMerchantById(id);
}

function reassignMerchant(id, rmUserId) {
  db.prepare(`UPDATE merchants SET rm_user_id = ?, updated_at = datetime('now') WHERE id = ?`).run(rmUserId, id);
  return getMerchantById(id);
}

function editMerchantFields(id, fields) {
  const allowed = ['mid', 'merchant_name', 'value_worth'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(fields[key]);
    }
  }
  if (!sets.length) return getMerchantById(id);
  sets.push(`updated_at = datetime('now')`);
  vals.push(id);
  db.prepare(`UPDATE merchants SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getMerchantById(id);
}

function overallStats(filters = {}) {
  const where = [];
  const vals = [];
  if (filters.batchId) { where.push('batch_id = ?'); vals.push(filters.batchId); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM merchants ${whereSql}`).get(...vals).c;
  const completed = db
    .prepare(`SELECT COUNT(*) c FROM merchants ${whereSql ? whereSql + " AND status='COMPLETED'" : "WHERE status='COMPLETED'"}`)
    .get(...vals).c;
  return { total, completed, pending: total - completed, rate: total ? Math.round((completed / total) * 1000) / 10 : 0 };
}

module.exports = {
  listUsers, getUserByUsername, getUserById, insertUser, updateUser, setUserActive,
  createBatch, getBatchById, listBatches, batchStats, perRmStatsForBatch,
  insertMerchant, getMerchantById, listMerchants, updateMerchantFeedback, reassignMerchant,
  editMerchantFields, overallStats,
};
