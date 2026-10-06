// Seeds an initial admin account (idempotent) and, optionally, demo RMs/merchants.
// Usage: node scripts/seed.js [--demo]
const auth = require('./auth');
const q = require('./queries');

function ensureAdmin() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const existing = q.getUserByUsername(username);
  if (existing) {
    console.log(`Admin user "${username}" already exists (id=${existing.id}). Skipping.`);
    return existing;
  }
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const { hash, salt } = auth.hashPassword(password);
  const user = q.insertUser({ name: 'Admin', username, passwordHash: hash, passwordSalt: salt, role: 'ADMIN' });
  console.log(`Created admin user: username="${username}" password="${password}" (CHANGE THIS after first login)`);
  return user;
}

function ensureDemoData(admin) {
  const demoRms = [
    { name: 'Sara Al-Khalifa', username: 'sara.k' },
    { name: 'Ahmed Mansoor', username: 'ahmed.m' },
    { name: 'Fatima Noor', username: 'fatima.n' },
  ];
  const rmUsers = [];
  for (const rm of demoRms) {
    let u = q.getUserByUsername(rm.username);
    if (!u) {
      const { hash, salt } = auth.hashPassword('Welcome123!');
      u = q.insertUser({ name: rm.name, username: rm.username, passwordHash: hash, passwordSalt: salt, role: 'RM' });
      console.log(`Created demo RM: ${rm.name} (username="${rm.username}" password="Welcome123!")`);
    }
    rmUsers.push(u);
  }

  const existingBatches = q.listBatches();
  if (existingBatches.length > 0) {
    console.log('Demo batches already exist. Skipping merchant seed.');
    return;
  }

  const sampleMerchants = [
    ['123456', 'Al Noor Grocers', 12500],
    ['123457', 'Manama Spice Traders', 8400],
    ['123458', 'Gulf Fashion House', 21000],
    ['123459', 'Harbor View Cafe', 6700],
    ['123460', 'Pearl City Electronics', 33250],
    ['123461', 'Seef Mobile Zone', 9100],
    ['123462', 'Dilmun Home Furnishings', 15200],
    ['123463', 'Royal Bakery & Sweets', 4300],
    ['123464', 'Al Hidd Auto Parts', 18900],
    ['123465', 'Capital Pharmacy', 7600],
  ];

  const batch = q.createBatch({ label: 'Reactivation – Week of October 5, 2026', weekStart: '2026-10-05', createdBy: admin.id });
  sampleMerchants.forEach(([mid, name, value], i) => {
    const rm = rmUsers[i % rmUsers.length];
    q.insertMerchant({ batchId: batch.id, rmUserId: rm.id, rmNameRaw: rm.name, mid, merchantName: name, valueWorth: value });
  });
  console.log(`Seeded demo batch "${batch.label}" with ${sampleMerchants.length} merchants.`);
}

const admin = ensureAdmin();
if (process.argv.includes('--demo')) {
  ensureDemoData(admin);
}
console.log('Seed complete.');
