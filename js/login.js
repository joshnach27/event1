import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { $, rules, showToast, setButtonLoading, friendlyError } from './common.js';

const flash = sessionStorage.getItem('flash');
if (flash) {
  sessionStorage.removeItem('flash');
  showToast(flash, 'error');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim().toLowerCase();
  const password = $('#password').value;
  const btn = $('#loginBtn');

  if (!rules.email(email)) return showToast('Enter a valid email address.', 'error');
  if (!password) return showToast('Password is required.', 'error');

  setButtonLoading(btn, true, 'Signing in...');
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    const profile = snap.exists() ? snap.data() : null;

    if (!profile || !['admin', 'student'].includes(profile.role) || profile.status === 'disabled') {
      await signOut(auth);
      throw new Error('This account is not active or has no profile. Contact the administrator.');
    }
    showToast('Signed in successfully.');
    location.replace(profile.role === 'admin' ? 'admin.html' : 'student.html');
  } catch (err) {
    showToast(friendlyError(err), 'error');
    setButtonLoading(btn, false);
  }
});
