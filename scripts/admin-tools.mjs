// EventHub admin tools (Firebase Admin SDK). Runs on YOUR machine with your own credentials.
// The service account is never shipped to the browser.
//
// Setup (once):
//   gcloud auth application-default login      (or set GOOGLE_APPLICATION_CREDENTIALS)
//   cd scripts && npm install
//
// Usage:
//   node admin-tools.mjs create-admin "admin@example.com" "Str0ng!Passw0rd" "Jane Admin"
//   node admin-tools.mjs delete-auth-user <uid>
//   node admin-tools.mjs promote-to-admin <uid>      (sets role=admin on an existing profile)

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault(), projectId: 'event-a1159' });
const auth = getAuth();
const db = getFirestore();

const [, , command, ...args] = process.argv;

function isStrongPassword(pw) {
  return pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

async function createAdmin(email, password, fullName) {
  if (!email || !password || !fullName) throw new Error('Usage: create-admin <email> <password> "<Full Name>"');
  if (!isStrongPassword(password)) throw new Error('Password must be 8+ chars with upper, lower, number and symbol.');

  const user = await auth.createUser({ email: email.toLowerCase(), password, displayName: fullName });
  await db.collection('users').doc(user.uid).set({
    fullName,
    email: email.toLowerCase(),
    role: 'admin',
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`Admin created. UID: ${user.uid}`);
}

async function deleteAuthUser(uid) {
  if (!uid) throw new Error('Usage: delete-auth-user <uid>');
  await auth.deleteUser(uid);
  console.log(`Auth account ${uid} deleted.`);
}

async function promoteToAdmin(uid) {
  if (!uid) throw new Error('Usage: promote-to-admin <uid>');
  await db.collection('users').doc(uid).update({ role: 'admin', status: 'active' });
  console.log(`User ${uid} is now an admin.`);
}

try {
  if (command === 'create-admin') await createAdmin(...args);
  else if (command === 'delete-auth-user') await deleteAuthUser(args[0]);
  else if (command === 'promote-to-admin') await promoteToAdmin(args[0]);
  else console.log('Commands: create-admin | delete-auth-user | promote-to-admin');
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
}
