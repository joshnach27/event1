import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function showToast(message, type = 'success') {
  let container = $('#toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = 3000;
    document.body.appendChild(container);
  }
  const icon = { success: 'bi-check-circle-fill', error: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }[type];
  const color = { success: 'success', error: 'danger', info: 'info' }[type];
  const el = document.createElement('div');
  el.className = `toast align-items-center border-0 mb-2 glass-toast border-start border-4 border-${color}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body"><i class="bi ${icon} me-2 text-${color}"></i>${escapeHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  container.appendChild(el);
  el.addEventListener('hidden.bs.toast', () => el.remove());
  new bootstrap.Toast(el, { delay: 4000 }).show();
}

export function setButtonLoading(btn, isLoading, loadingText = 'Please wait...') {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${escapeHtml(loadingText)}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function confirmDialog(message, { title = 'Please confirm', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let modalEl = $('#confirmModal');
    if (!modalEl) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="confirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content glass-modal">
              <div class="modal-header border-0"><h5 class="modal-title fw-bold" id="confirmTitle"></h5></div>
              <div class="modal-body" id="confirmMessage"></div>
              <div class="modal-footer border-0">
                <button type="button" class="btn btn-outline-light" data-action="cancel">Cancel</button>
                <button type="button" class="btn" id="confirmOk"></button>
              </div>
            </div>
          </div>
        </div>`);
      modalEl = $('#confirmModal');
    }
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    const ok = $('#confirmOk');
    ok.textContent = confirmText;
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-neon'}`;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let confirmed = false;
    ok.onclick = () => { confirmed = true; modal.hide(); };
    modalEl.querySelector('[data-action="cancel"]').onclick = () => modal.hide();
    modalEl.addEventListener('hidden.bs.modal', () => resolve(confirmed), { once: true });
    modal.show();
  });
}

// ---- Validation (UX layer only; Firestore rules enforce the same constraints) ----
export const rules = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
  roll: (v) => /^[A-Z0-9-]{4,20}$/.test(v),
};

export function passwordProblem(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return 'Use both uppercase and lowercase letters.';
  if (!/\d/.test(pw)) return 'Include at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Include at least one special character.';
  return '';
}

const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/weak-password': 'Password is too weak.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'permission-denied': 'You do not have permission to do that.',
  ROLL_TAKEN: 'That roll number is already registered.',
  ALREADY: 'You are already registered for this event.',
  FULL: 'This event is full.',
};

export function friendlyError(err) {
  return ERROR_MESSAGES[err?.code] || ERROR_MESSAGES[err?.message] || err?.message || 'Something went wrong. Please try again.';
}

// ---- Auth / role guard ----
export function requireRole(expectedRole) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) return location.replace('login.html');
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const profile = snap.exists() ? snap.data() : null;
        if (!profile || profile.role !== expectedRole || profile.status === 'disabled') {
          sessionStorage.setItem('flash', 'Access denied for this account.');
          await signOut(auth);
          return location.replace('login.html');
        }
        resolve({ user, profile });
      } catch (err) {
        sessionStorage.setItem('flash', friendlyError(err));
        await signOut(auth);
        location.replace('login.html');
      }
    });
  });
}

export async function logout() {
  await signOut(auth);
  location.replace('login.html');
}

// ---- Shared registration helper ----
// Removes a registration and decrements the event's seat count atomically.
export async function removeRegistration(regId, eventId) {
  const regRef = doc(db, 'registrations', regId);
  const eventRef = doc(db, 'events', eventId);
  await runTransaction(db, async (tx) => {
    const reg = await tx.get(regRef);
    if (!reg.exists()) return;
    const ev = await tx.get(eventRef);
    tx.delete(regRef);
    const count = ev.exists() ? (ev.data().registeredCount || 0) : 0;
    if (count > 0) tx.update(eventRef, { registeredCount: count - 1 });
  });
}
