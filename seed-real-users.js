// Seeds the real RM/Admin accounts for the Reactivation Merchant platform.
// Idempotent: safe to re-run — existing usernames are left untouched (use
// RM Management in the app to change a password afterward, not this script).
// Usage: node scripts/seed-real-users.js
const auth = require('./auth');
const q = require('./queries');

// Username = firstname.lastname, lowercase, derived from the "User name" column.
const users = [
  { name: 'Abdulla Adel',        password: '1010', role: 'RM' },
  { name: 'Abdulrasool Hussain', password: '2010', role: 'RM' },
  { name: 'Adham Alalami',       password: '6719', role: 'ADMIN' },
  { name: 'Adnan Khan',          password: '9278', role: 'RM' },
  { name: 'Ali Alabyooki',       password: '3826', role: 'RM' },
  { name: 'Amjad Abdulla',       password: '3047', role: 'RM' },
  { name: 'Hussain Alawi',       password: '4722', role: 'RM' },
  { name: 'Lynn',                password: '4782', role: 'RM' },
  { name: 'Mustafa Rahma',       password: '8728', role: 'RM' },
  { name: 'Pranay Upadhyay',     password: '1000', role: 'ADMIN' },
  { name: 'Walaa Alaradi',       password: '2917', role: 'RM' },
  { name: 'Mohd Makhlooq',       password: '1999', role: 'ADMIN' },
];

function usernameFor(name) {
  const parts = name.trim().toLowerCase().split(/\s+/);
  return parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
}

let created = 0, skipped = 0;
for (const u of users) {
  const username = usernameFor(u.name);
  const existing = q.getUserByUsername(username);
  if (existing) {
    console.log(`SKIP   ${u.name.padEnd(22)} username="${username}" already exists (id=${existing.id}, role=${existing.role}).`);
    skipped++;
    continue;
  }
  const { hash, salt } = auth.hashPassword(u.password);
  const created_user = q.insertUser({ name: u.name, username, passwordHash: hash, passwordSalt: salt, role: u.role });
  console.log(`CREATE ${u.name.padEnd(22)} username="${username}" password="${u.password}" role=${u.role} (id=${created_user.id})`);
  created++;
}

console.log(`\nDone. ${created} created, ${skipped} skipped (already existed).`);
console.log('Tell each person their username + initial password; the sidebar has "Change password" for them to set their own.');
