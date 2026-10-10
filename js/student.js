import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, getDocs, doc, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  $, escapeHtml, showToast, confirmDialog, requireRole, logout, setButtonLoading,
  friendlyError, formatDate, todayISO, removeRegistration,
} from './common.js';

let session;
let events = [];
let myEventIds = new Set();
let currentEventId = null;

const detailModal = () => bootstrap.Modal.getOrCreateInstance($('#eventModal'));
const uid = () => session.user.uid;

// ---------- Data ----------
async function loadData() {
  const [evSnap, regSnap] = await Promise.all([
    getDocs(query(collection(db, 'events'), orderBy('date'))),
    getDocs(query(collection(db, 'registrations'), where('userId', '==', uid()))),
  ]);
  events = evSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  myEventIds = new Set(regSnap.docs.map((d) => d.data().eventId));
  render();
}

// Registration: one transaction checks for an existing registration (duplicate guard),
// checks remaining capacity, creates a deterministic registration doc (id = eventId_uid),
// and increments the seat counter. Concurrent sign-ups cannot overbook the event.
async function registerForEvent(eventId) {
  const regRef = doc(db, 'registrations', `${eventId}_${uid()}`);
  const eventRef = doc(db, 'events', eventId);
  await runTransaction(db, async (tx) => {
    const ev = await tx.get(eventRef);
    if (!ev.exists()) throw new Error('This event no longer exists.');
    const reg = await tx.get(regRef);
    if (reg.exists()) throw new Error('ALREADY');
    const data = ev.data();
    const count = data.registeredCount || 0;
    if (count >= data.capacity) throw new Error('FULL');
    tx.set(regRef, {
      eventId,
      userId: uid(),
      eventTitle: data.title,
      studentName: session.profile.fullName,
      rollNumber: session.profile.rollNumber,
      createdAt: serverTimestamp(),
    });
    tx.update(eventRef, { registeredCount: count + 1 });
  });
}

async function cancelRegistration(eventId) {
  await removeRegistration(`${eventId}_${uid()}`, eventId);
}

// ---------- Rendering ----------
function render() {
  const today = todayISO();
  const upcoming = events.filter((e) => e.date >= today);
  const mine = events.filter((e) => myEventIds.has(e.id));

  $('#statAvailable').textContent = upcoming.filter((e) => !myEventIds.has(e.id)).length;
  $('#statRegistered').textContent = myEventIds.size;
  $('#statUpcoming').textContent = mine.filter((e) => e.date >= today).length;

  populateCategories(upcoming);
  renderExplore(upcoming);
  renderMine(mine);
  $('#skeleton').classList.add('d-none');
}

function populateCategories(list) {
  const select = $('#categoryFilter');
  const current = select.value;
  const categories = [...new Set(list.map((e) => e.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All categories</option>' +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = categories.includes(current) ? current : '';
}

function renderExplore(list) {
  const q = $('#searchInput').value.trim().toLowerCase();
  const cat = $('#categoryFilter').value;
  const filtered = list.filter((e) =>
    (!cat || e.category === cat) &&
    (!q || `${e.title} ${e.location}`.toLowerCase().includes(q)));
  $('#exploreGrid').innerHTML = filtered.map((e, i) => eventCard(e, i)).join('');
  $('#exploreEmpty').classList.toggle('d-none', filtered.length > 0);
}

function renderMine(list) {
  $('#mineGrid').innerHTML = list.map((e, i) => eventCard(e, i)).join('');
  $('#mineEmpty').classList.toggle('d-none', list.length > 0);
}

function eventCard(ev, index) {
  const registered = myEventIds.has(ev.id);
  const seatsLeft = ev.capacity - (ev.registeredCount || 0);
  let status;
  if (registered) status = '<span class="pill-badge purple"><i class="bi bi-check2 me-1"></i>Registered</span>';
  else if (seatsLeft <= 0) status = '<span class="pill-badge" style="color:#fca5a5;border-color:rgba(248,113,113,.4);background:rgba(248,113,113,.12)">Full</span>';
  else status = `<span class="pill-badge">${seatsLeft} seats left</span>`;

  return `
    <div class="col-md-6 col-xl-4 fade-up" style="animation-delay:${Math.min(index, 8) * 60}ms">
      <div class="card event-card" data-id="${ev.id}" role="button" tabindex="0">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
            <span class="pill-badge purple">${escapeHtml(ev.category || 'General')}</span>
            ${status}
          </div>
          <h5 class="fw-bold mb-2">${escapeHtml(ev.title)}</h5>
          <p class="small muted mb-1"><i class="bi bi-calendar-event me-1"></i>${formatDate(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</p>
          <p class="small muted mb-0"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(ev.location)}</p>
        </div>
      </div>
    </div>`;
}

function openDetails(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  currentEventId = id;
  const registered = myEventIds.has(id);
  const seatsLeft = ev.capacity - (ev.registeredCount || 0);
  const ended = ev.date < todayISO();

  $('#modalTitle').textContent = ev.title;
  $('#modalBody').innerHTML = `
    <div class="mb-3"><span class="pill-badge purple">${escapeHtml(ev.category || 'General')}</span></div>
    <div class="row g-3 mb-3">
      <div class="col-sm-6"><div class="small muted">Date</div><div>${formatDate(ev.date)}</div></div>
      <div class="col-sm-6"><div class="small muted">Time</div><div>${escapeHtml(ev.time || '–')}</div></div>
      <div class="col-sm-6"><div class="small muted">Location</div><div>${escapeHtml(ev.location)}</div></div>
      <div class="col-sm-6"><div class="small muted">Seats</div><div>${Math.max(seatsLeft, 0)} of ${ev.capacity} available</div></div>
    </div>
    <div class="small muted mb-1">About</div>
    <p class="mb-0" style="white-space:pre-line">${escapeHtml(ev.description || 'No description provided.')}</p>`;

  const btn = $('#modalActionBtn');
  btn.disabled = false;
  if (registered) {
    btn.className = 'btn btn-outline-danger';
    btn.textContent = 'Cancel registration';
    btn.dataset.mode = 'cancel';
  } else if (ended) {
    btn.className = 'btn btn-secondary';
    btn.textContent = 'Event has ended';
    btn.disabled = true;
    btn.dataset.mode = 'none';
  } else if (seatsLeft <= 0) {
    btn.className = 'btn btn-secondary';
    btn.textContent = 'Event full';
    btn.disabled = true;
    btn.dataset.mode = 'none';
  } else {
    btn.className = 'btn btn-neon';
    btn.textContent = 'Register now';
    btn.dataset.mode = 'register';
  }
  detailModal().show();
}

// ---------- Events ----------
function bindEvents() {
  $('#logoutBtn').addEventListener('click', logout);
  $('#searchInput').addEventListener('input', () => renderExplore(events.filter((e) => e.date >= todayISO())));
  $('#categoryFilter').addEventListener('change', () => renderExplore(events.filter((e) => e.date >= todayISO())));

  const openFromCard = (e) => {
    const card = e.target.closest('.event-card');
    if (card) openDetails(card.dataset.id);
  };
  $('#exploreGrid').addEventListener('click', openFromCard);
  $('#mineGrid').addEventListener('click', openFromCard);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList?.contains('event-card')) openDetails(e.target.dataset.id);
  });

  $('#modalActionBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ev = events.find((x) => x.id === currentEventId);
    if (!ev) return;

    if (btn.dataset.mode === 'register') {
      const ok = await confirmDialog(
        `Register for "${ev.title}" on ${formatDate(ev.date)}?`,
        { title: 'Confirm registration', confirmText: 'Register' });
      if (!ok) return;
      setButtonLoading(btn, true, 'Registering...');
      try {
        await registerForEvent(ev.id);
        detailModal().hide();
        showToast('You are registered! See you there.');
        await loadData();
      } catch (err) {
        showToast(friendlyError(err), 'error');
        setButtonLoading(btn, false);
      }
    }

    if (btn.dataset.mode === 'cancel') {
      const ok = await confirmDialog(
        `Cancel your registration for "${ev.title}"? Your seat may be taken by someone else.`,
        { title: 'Cancel registration', confirmText: 'Yes, cancel', danger: true });
      if (!ok) return;
      setButtonLoading(btn, true, 'Cancelling...');
      try {
        await cancelRegistration(ev.id);
        detailModal().hide();
        showToast('Registration cancelled.', 'info');
        await loadData();
      } catch (err) {
        showToast(friendlyError(err), 'error');
        setButtonLoading(btn, false);
      }
    }
  });
}

// ---------- Init ----------
(async function init() {
  session = await requireRole('student');
  $('#studentName').textContent = session.profile.fullName || 'Student';
  bindEvents();
  try {
    await loadData();
  } catch (err) {
    $('#skeleton').classList.add('d-none');
    showToast(friendlyError(err), 'error');
  }
})();
