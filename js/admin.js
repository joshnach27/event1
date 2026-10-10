import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, getDocs, doc, addDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  $, escapeHtml, showToast, confirmDialog, requireRole, logout, setButtonLoading,
  friendlyError, formatDate, todayISO, removeRegistration,
} from './common.js';

const CATEGORIES = ['Technical', 'Cultural', 'Sports', 'Workshop', 'Seminar', 'Other'];

let session;
let events = [];
let students = [];
let registrations = [];

const eventModal = () => bootstrap.Modal.getOrCreateInstance($('#eventModal'));
const attendeesModal = () => bootstrap.Modal.getOrCreateInstance($('#attendeesModal'));

// ---------- Data ----------
async function loadAll() {
  const [evSnap, stSnap, regSnap] = await Promise.all([
    getDocs(query(collection(db, 'events'), orderBy('date'))),
    getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
    getDocs(collection(db, 'registrations')),
  ]);
  events = evSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  students = stSnap.docs.map((d) => ({ ...d.data(), uid: d.id }));
  registrations = regSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  renderStats();
  renderEvents();
  renderStudents();
}

async function deleteInBatches(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

// ---------- Stats ----------
function renderStats() {
  const today = todayISO();
  $('#statEvents').textContent = events.length;
  $('#statUpcoming').textContent = events.filter((e) => e.date >= today).length;
  $('#statStudents').textContent = students.length;
  $('#statRegs').textContent = registrations.length;
}

// ---------- Events ----------
function renderEvents() {
  const q = $('#eventSearch').value.trim().toLowerCase();
  const list = events.filter((e) => !q || `${e.title} ${e.location} ${e.category}`.toLowerCase().includes(q));
  $('#eventsEmpty').classList.toggle('d-none', events.length > 0);
  $('#eventsTable').innerHTML = list.length ? `
    <div class="glass p-3"><div class="table-responsive">
      <table class="table table-glass align-middle mb-0">
        <thead><tr><th>Event</th><th>Date</th><th>Seats</th><th class="text-end">Actions</th></tr></thead>
        <tbody>
          ${list.map((e) => `
            <tr class="fade-up">
              <td><div class="fw-semibold">${escapeHtml(e.title)}</div>
                  <small class="muted">${escapeHtml(e.category || '')} · ${escapeHtml(e.location)}</small></td>
              <td>${formatDate(e.date)}<br><small class="muted">${escapeHtml(e.time || '')}</small></td>
              <td>${e.registeredCount || 0} / ${e.capacity}</td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-info" data-action="attendees" data-id="${e.id}" title="Attendees"><i class="bi bi-people"></i></button>
                <button class="btn btn-sm btn-outline-light" data-action="edit" data-id="${e.id}" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${e.id}" title="Delete"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>` : (events.length ? '<p class="muted text-center py-4 mb-0">No events match your search.</p>' : '');
}

function openEventForm(ev = null) {
  $('#eventForm').reset();
  $('#eventId').value = ev?.id || '';
  $('#eventModalTitle').textContent = ev ? 'Edit event' : 'New event';
  $('#evCategory').innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
  if (ev) {
    $('#evTitle').value = ev.title || '';
    $('#evCategory').value = ev.category || 'Other';
    $('#evDate').value = ev.date || '';
    $('#evTime').value = ev.time || '';
    $('#evLocation').value = ev.location || '';
    $('#evCapacity').value = ev.capacity || '';
    $('#evDescription').value = ev.description || '';
  }
  $('#evDate').min = ev ? '' : todayISO();
  eventModal().show();
}

function validateEvent(d, isNew) {
  if (d.title.length < 3 || d.title.length > 120) return 'Title must be 3–120 characters.';
  if (!CATEGORIES.includes(d.category)) return 'Choose a valid category.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Select a valid date.';
  if (isNew && d.date < todayISO()) return 'The event date cannot be in the past.';
  if (!d.time) return 'Select a start time.';
  if (d.location.length < 3 || d.location.length > 150) return 'Location must be 3–150 characters.';
  if (!Number.isInteger(d.capacity) || d.capacity < 1 || d.capacity > 5000) return 'Capacity must be a whole number from 1 to 5000.';
  if (d.description.length > 1000) return 'Description must be under 1000 characters.';
  return '';
}

async function saveEvent(e) {
  e.preventDefault();
  const id = $('#eventId').value;
  const data = {
    title: $('#evTitle').value.trim(),
    category: $('#evCategory').value,
    date: $('#evDate').value,
    time: $('#evTime').value,
    location: $('#evLocation').value.trim(),
    capacity: Number($('#evCapacity').value),
    description: $('#evDescription').value.trim(),
  };
  const problem = validateEvent(data, !id);
  if (problem) return showToast(problem, 'error');

  const existing = id ? events.find((x) => x.id === id) : null;
  if (existing && data.capacity < (existing.registeredCount || 0)) {
    return showToast(`Capacity cannot be below the ${existing.registeredCount} students already registered.`, 'error');
  }

  const btn = $('#saveEventBtn');
  setButtonLoading(btn, true, 'Saving...');
  try {
    if (id) {
      await updateDoc(doc(db, 'events', id), { ...data, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, 'events'), {
        ...data, registeredCount: 0, createdBy: session.user.uid, createdAt: serverTimestamp(),
      });
    }
    eventModal().hide();
    showToast(id ? 'Event updated.' : 'Event created.');
    await loadAll();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function deleteEvent(ev) {
  const count = ev.registeredCount || 0;
  const ok = await confirmDialog(
    `Delete "${ev.title}"${count ? ` and its ${count} registration(s)` : ''}? This cannot be undone.`,
    { title: 'Delete event', confirmText: 'Delete event', danger: true });
  if (!ok) return;
  try {
    const regs = await getDocs(query(collection(db, 'registrations'), where('eventId', '==', ev.id)));
    await deleteInBatches(regs.docs.map((d) => d.ref));
    await deleteDoc(doc(db, 'events', ev.id));
    showToast('Event deleted.', 'info');
    await loadAll();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Attendees ----------
function openAttendees(ev) {
  $('#attendeesTitle').textContent = `Attendees · ${ev.title}`;
  renderAttendees(ev.id);
  attendeesModal().show();
}

function renderAttendees(eventId) {
  const list = registrations.filter((r) => r.eventId === eventId);
  $('#attendeesBody').innerHTML = list.length ? `
    <div class="table-responsive">
      <table class="table table-glass align-middle mb-0">
        <thead><tr><th>Student</th><th>Roll number</th><th class="text-end"></th></tr></thead>
        <tbody>
          ${list.map((r) => `
            <tr>
              <td>${escapeHtml(r.studentName)}</td>
              <td><code>${escapeHtml(r.rollNumber)}</code></td>
              <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-action="unregister" data-id="${r.id}" data-event="${eventId}"><i class="bi bi-x-lg me-1"></i>Remove</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<div class="empty-state"><i class="bi bi-people"></i><p class="mt-2 mb-0">No registrations yet.</p></div>`;
}

async function unregisterStudent(regId, eventId) {
  const ok = await confirmDialog('Remove this student from the event? Their seat will be freed.',
    { title: 'Remove registration', confirmText: 'Remove', danger: true });
  if (!ok) return;
  try {
    await removeRegistration(regId, eventId);
    showToast('Registration removed.', 'info');
    await loadAll();
    renderAttendees(eventId);
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Students ----------
function renderStudents() {
  const q = $('#studentSearch').value.trim().toLowerCase();
  const counts = {};
  registrations.forEach((r) => { counts[r.userId] = (counts[r.userId] || 0) + 1; });
  const list = students.filter((s) =>
    !q || `${s.fullName} ${s.rollNumber} ${s.email}`.toLowerCase().includes(q));

  $('#studentsEmpty').classList.toggle('d-none', students.length > 0);
  $('#studentsTable').innerHTML = list.length ? `
    <div class="glass p-3"><div class="table-responsive">
      <table class="table table-glass align-middle mb-0">
        <thead><tr><th>Name</th><th>Roll</th><th>Email</th><th>Status</th><th>Registrations</th><th class="text-end">Actions</th></tr></thead>
        <tbody>
          ${list.map((s) => `
            <tr class="fade-up">
              <td class="fw-semibold">${escapeHtml(s.fullName)}</td>
              <td><code>${escapeHtml(s.rollNumber)}</code></td>
              <td>${escapeHtml(s.email)}</td>
              <td><span class="badge ${s.status === 'disabled' ? 'bg-danger' : 'bg-success'}">${escapeHtml(s.status || 'active')}</span></td>
              <td>${counts[s.uid] || 0}</td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-warning" data-action="toggle" data-uid="${s.uid}">${s.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                <button class="btn btn-sm btn-outline-danger" data-action="remove" data-uid="${s.uid}" title="Remove"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>` : (students.length ? '<p class="muted text-center py-4 mb-0">No students match your search.</p>' : '');
}

async function toggleStudent(s) {
  const disabling = s.status !== 'disabled';
  const ok = await confirmDialog(
    disabling ? `Disable ${s.fullName}? They will not be able to sign in until re-enabled.` : `Enable ${s.fullName}?`,
    { title: disabling ? 'Disable account' : 'Enable account', confirmText: disabling ? 'Disable' : 'Enable', danger: disabling });
  if (!ok) return;
  try {
    await updateDoc(doc(db, 'users', s.uid), { status: disabling ? 'disabled' : 'active' });
    showToast(`Account ${disabling ? 'disabled' : 'enabled'}.`, 'info');
    await loadAll();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function removeStudent(s) {
  const ok = await confirmDialog(
    `Permanently remove ${s.fullName} (${s.rollNumber})? Their registrations will be cancelled and their roll number released.`,
    { title: 'Remove student', confirmText: 'Remove student', danger: true });
  if (!ok) return;
  try {
    // 1. Cancel every registration and free seats.
    const mine = registrations.filter((r) => r.userId === s.uid);
    for (const r of mine) await removeRegistration(r.id, r.eventId);
    // 2. Release the roll number reservation.
    if (s.rollNumber) await deleteDoc(doc(db, 'rollNumbers', s.rollNumber));
    // 3. Delete the profile. This blocks sign-in, because login and the role guard require a profile.
    await deleteDoc(doc(db, 'users', s.uid));
    showToast('Student removed. To delete the login too, run scripts/admin-tools.mjs delete-auth-user (see README).', 'info');
    await loadAll();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

// ---------- Init ----------
function bindEvents() {
  $('#logoutBtn').addEventListener('click', logout);
  $('#newEventBtn').addEventListener('click', () => openEventForm());
  $('#eventForm').addEventListener('submit', saveEvent);
  $('#eventSearch').addEventListener('input', renderEvents);
  $('#studentSearch').addEventListener('input', renderStudents);

  $('#eventsTable').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const ev = events.find((x) => x.id === btn.dataset.id);
    if (!ev) return;
    if (btn.dataset.action === 'edit') openEventForm(ev);
    if (btn.dataset.action === 'attendees') openAttendees(ev);
    if (btn.dataset.action === 'delete') deleteEvent(ev);
  });

  $('#studentsTable').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const s = students.find((x) => x.uid === btn.dataset.uid);
    if (!s) return;
    if (btn.dataset.action === 'toggle') toggleStudent(s);
    if (btn.dataset.action === 'remove') removeStudent(s);
  });

  $('#attendeesBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="unregister"]');
    if (btn) unregisterStudent(btn.dataset.id, btn.dataset.event);
  });
}

(async function init() {
  session = await requireRole('admin');
  $('#adminName').textContent = session.profile.fullName || 'Admin';
  bindEvents();
  try {
    await loadAll();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  } finally {
    $('#globalLoader').classList.add('d-none');
  }
})();
