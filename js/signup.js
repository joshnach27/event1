import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, deleteUser } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { $, rules, passwordProblem, showToast, setButtonLoading, friendlyError } from './common.js';

$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = $('#fullName').value.trim().replace(/\s+/g, ' ');
  const rollNumber = $('#rollNumber').value.trim().toUpperCase();
  const email = $('#signupEmail').value.trim().toLowerCase();
  const password = $('#signupPassword').value;
  const confirm = $('#confirmPassword').value;

  let problem = '';
  if (!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(fullName)) problem = 'Enter your full name (letters only, 2–100 characters).';
  else if (!rules.roll(rollNumber)) problem = 'Roll number must be 4–20 characters: letters, numbers or hyphens.';
  else if (!rules.email(email)) problem = 'Enter a valid email address.';
  else if (passwordProblem(password)) problem = passwordProblem(password);
  else if (password !== confirm) problem = 'Passwords do not match.';
  if (problem) return showToast(problem, 'error');

  const btn = $('#signupBtn');
  setButtonLoading(btn, true, 'Creating account...');
  let cred = null;
  try {
    // 1. Create the Auth account. Firebase Auth itself rejects duplicate emails.
    cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const rollRef = doc(db, 'rollNumbers', rollNumber);
    const userRef = doc(db, 'users', uid);

    // 2. Reserve the roll number and create the profile atomically. The transaction
    //    re-reads the roll doc at commit time, so two simultaneous sign-ups with the same
    //    roll number cannot both succeed. Rules also forbid updating or deleting reservations.
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(rollRef);
      if (existing.exists()) throw new Error('ROLL_TAKEN');
      tx.set(rollRef, { uid, createdAt: serverTimestamp() });
      tx.set(userRef, {
        fullName, rollNumber, email, role: 'student', status: 'active', createdAt: serverTimestamp(),
      });
    });

    showToast('Account created! Redirecting...');
    setTimeout(() => location.replace('student.html'), 800);
  } catch (err) {
    // Roll back the Auth account so the email is not left orphaned.
    if (cred) {
      try { await deleteUser(cred.user); } catch { /* ignore */ }
    }
    showToast(friendlyError(err), 'error');
    setButtonLoading(btn, false);
  }
});
