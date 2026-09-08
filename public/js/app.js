import {
  createStore, SPORTS, uid, deviceId, makeTemplateEvent, nextSaturday,
} from './store.js';

/* ================================================================== */
/* Small utilities                                                     */
/* ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtMoney(n) {
  return (n === Math.floor(n) ? n : n.toFixed(2)) + '$';
}

function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

/* Modal helper: returns the overlay element. */
function openModal(html, { wide = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  $$('[data-close]', overlay).forEach(b => b.addEventListener('click', () => overlay.remove()));
  return overlay;
}

function confirmModal(message, confirmLabel = 'Confirm') {
  return new Promise(resolve => {
    const ov = openModal(`
      <div class="modal-body">
        <p class="confirm-msg">${esc(message)}</p>
        <div class="row gap">
          <button class="btn btn-ghost grow" data-close>Cancel</button>
          <button class="btn btn-danger grow" id="cf-yes">${esc(confirmLabel)}</button>
        </div>
      </div>`);
    $('#cf-yes', ov).addEventListener('click', () => { ov.remove(); resolve(true); });
    ov.addEventListener('click', e => { if (e.target === ov) resolve(false); });
    $$('[data-close]', ov).forEach(b => b.addEventListener('click', () => resolve(false)));
  });
}

/* ================================================================== */
/* Local identity                                                      */
/* ================================================================== */

function getProfile() {
  try { return JSON.parse(localStorage.getItem('crsc-profile')) || null; } catch (e) { return null; }
}
function saveProfile(p) {
  try { localStorage.setItem('crsc-profile', JSON.stringify(p)); } catch (e) { /* ignore */ }
}

function isExec() { return sessionStorage.getItem('crsc-exec') === '1'; }
function setExec(on) {
  if (on) sessionStorage.setItem('crsc-exec', '1');
  else sessionStorage.removeItem('crsc-exec');
}

/* Downscale a chosen image file to a small square thumbnail data URL. */
function fileToThumb(file, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ================================================================== */
/* App state                                                           */
/* ================================================================== */

let store = null;
let state = { settings: {}, events: [], signups: {} };
const DEVICE = deviceId();

/* ================================================================== */
/* Domain helpers                                                      */
/* ================================================================== */

function eventSignups(eventId) {
  return state.signups[eventId] || [];
}

function listEntries(eventId, listId) {
  return eventSignups(eventId)
    .filter(s => s.listId === listId)
    .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
}

function splitByCap(entries, cap) {
  return { confirmed: entries.slice(0, cap), waitlist: entries.slice(cap) };
}

function mySignups(eventId) {
  return eventSignups(eventId).filter(s => s.deviceId === DEVICE);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* An event whose Saturday has passed becomes a read-only record automatically. */
function isPastEvent(ev) {
  return !!ev.date && ev.date < todayStr();
}

function isEventOpen(ev) {
  return ev.status === 'open' && !isPastEvent(ev);
}

function listById(event, listId) {
  return (event.lists || []).find(l => l.id === listId);
}
function sessionById(event, sessionId) {
  return (event.sessions || []).find(s => s.id === sessionId);
}

/*
 * Price for a set of lists (one person, one event), applying bundles:
 * if a bundle exists for a sport and the person plays that sport in 2+
 * time slots, the bundle price replaces the per-slot prices for that sport.
 */
function computePrice(event, listIds, method) {
  const key = method === 'cash' ? 'priceC' : 'priceE';
  const bySport = {};
  let total = 0;
  const parts = [];
  for (const id of listIds) {
    const l = listById(event, id);
    if (!l) continue;
    (bySport[l.sport] = bySport[l.sport] || []).push(l);
  }
  for (const [sport, lists] of Object.entries(bySport)) {
    const sessions = new Set(lists.map(l => l.sessionId));
    const bundle = (event.bundles || []).find(b => b.sport === sport);
    if (bundle && sessions.size >= 2) {
      total += bundle[key] ?? 0;
      parts.push({ label: bundle.label || (SPORTS[sport].label + ' bundle'), price: bundle[key] ?? 0 });
    } else {
      for (const l of lists) {
        total += l[key] ?? 0;
        parts.push({
          label: `${SPORTS[l.sport]?.label || l.sport} — ${l.label}`,
          price: l[key] ?? 0,
        });
      }
    }
  }
  return { total, parts };
}

/* One-line price recap for an event: each distinct sport price shown once. */
function pricesSummary(ev) {
  const seen = new Set();
  const parts = [];
  for (const l of ev.lists || []) {
    const sport = SPORTS[l.sport] || SPORTS.other;
    const price = `${fmtMoney(l.priceE ?? 0)}${(l.priceC ?? l.priceE) !== l.priceE ? ` (${fmtMoney(l.priceC)} cash)` : ''}`;
    const key = l.sport + '|' + price;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`${sport.emoji} ${esc(sport.label)} <strong>${price}</strong>`);
  }
  for (const b of ev.bundles || []) {
    const sport = SPORTS[b.sport] || SPORTS.other;
    parts.push(`${sport.emoji} both slots <strong>${fmtMoney(b.priceE ?? 0)}</strong>`);
  }
  return parts.join(' · ');
}

/* Expected amount for one person's existing signups (used by exec summary). */
function personKey(s) {
  return s.deviceId !== 'exec-added' && s.deviceId ? s.deviceId + '|' + s.name.toLowerCase() : 'name|' + s.name.toLowerCase();
}

/* ================================================================== */
/* Rendering: shell + routing                                          */
/* ================================================================== */

function route() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/event\/([^/]+)/);
  if (m) return { view: 'event', eventId: m[1] };
  return { view: 'home' };
}

function render() {
  const r = route();
  renderHeader();
  if (r.view === 'event') {
    const ev = state.events.find(e => e.id === r.eventId);
    if (ev) { store.watchEvent(ev.id); renderEvent(ev); }
    else $('#view').innerHTML = `<div class="empty">Event not found. <a href="#/">Back home</a></div>`;
  } else {
    renderHome();
  }
}

function renderHeader() {
  const s = state.settings;
  $('#header').innerHTML = `
    <a class="brand" href="#/">
      <span class="brand-badge">🏐</span>
      <span>
        <strong>${esc(s.clubName || 'CRSC')}</strong>
        <small>${esc(s.clubFullName || '')}</small>
      </span>
    </a>
    <div class="header-actions">
      ${store.mode === 'demo' ? '<span class="chip chip-demo" title="Running without Firebase — data stays on this device">DEMO</span>' : ''}
      ${isExec()
        ? `<button class="btn btn-small btn-exec" id="btn-exec-off">Exec ✓</button>`
        : `<button class="btn btn-small btn-ghost" id="btn-exec-on">Exec</button>`}
    </div>`;
  const on = $('#btn-exec-on');
  if (on) on.addEventListener('click', openPinModal);
  const off = $('#btn-exec-off');
  if (off) off.addEventListener('click', () => { setExec(false); toast('Exec mode off'); render(); });
}

/* ================================================================== */
/* Home view                                                           */
/* ================================================================== */

function eventCard(ev, { record = false } = {}) {
  const sports = [...new Set((ev.lists || []).map(l => l.sport))];
  const total = eventSignups(ev.id).length;
  const capTotal = (ev.lists || []).reduce((a, l) => a + (l.cap || 0), 0);
  const mine = mySignups(ev.id);
  const open = isEventOpen(ev);
  const soon = ev.date === nextSaturday() || ev.date === todayStr();

  let recordLine = '';
  if (record) {
    const people = personTotals(ev);
    const collected = people.filter(p => p.paid).reduce((a, p) => a + p.total, 0);
    const outstanding = people.filter(p => !p.paid).reduce((a, p) => a + p.total, 0);
    recordLine = `<div class="event-record">${people.length} players · <span class="rec-good">${fmtMoney(collected)} collected</span>${outstanding ? ` · <span class="rec-bad">${fmtMoney(outstanding)} unpaid</span>` : ''}</div>`;
  }

  return `
    <a class="card event-card ${!open ? 'event-closed' : ''}" href="#/event/${esc(ev.id)}">
      <div class="event-card-top">
        <div>
          <div class="event-date">${esc(fmtDate(ev.date))}</div>
          <div class="event-title">${esc(ev.title || '')}</div>
        </div>
        ${!open ? `<span class="chip chip-muted">${isPastEvent(ev) ? 'Past' : 'Closed'}</span>` : (soon ? '<span class="chip chip-soon">This Saturday</span>' : '')}
      </div>
      <div class="event-sports">${sports.map(sp => `<span class="chip" style="--c:${SPORTS[sp]?.color || '#888'}">${SPORTS[sp]?.emoji || ''} ${esc(SPORTS[sp]?.label || sp)}</span>`).join('')}</div>
      <div class="event-meta">
        <span>${total} signed up${capTotal && open ? ` · ${capTotal} spots` : ''}</span>
        ${mine.length ? `<span class="chip chip-mine">You're in ✓</span>` : ''}
      </div>
      ${recordLine}
    </a>`;
}

function renderHome() {
  const exec = isExec();
  const upcoming = state.events
    .filter(isEventOpen)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  const past = state.events
    .filter(e => !isEventOpen(e))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  // Keep every week's lists and payments live: watch upcoming Saturdays for
  // everyone, and recent past weeks for the exec records.
  upcoming.forEach(e => store.watchEvent(e.id));
  if (exec) past.slice(0, 12).forEach(e => store.watchEvent(e.id));
  const s = state.settings;
  const profile = getProfile();

  $('#view').innerHTML = `
    <section class="hero">
      <h1>Saturday drop-in sports</h1>
      <p>Sign up, show up, play. Volleyball · Basketball · Football</p>
    </section>

    ${profile ? `
      <div class="profile-strip">
        ${avatarHtml(profile)}
        <div class="grow">
          <strong>${esc(profile.name)}</strong>
          ${profile.insta ? `<small>@${esc(profile.insta)}</small>` : ''}
        </div>
        <button class="btn btn-small btn-ghost" id="btn-edit-profile">Edit</button>
      </div>` : ''}

    <h2 class="section-title">Choose your Saturday</h2>
    ${upcoming.length ? upcoming.map(e => eventCard(e)).join('') : `<div class="empty">No open events right now. Check back soon, or follow <a href="https://instagram.com/${esc(s.instagram || '')}" target="_blank" rel="noopener">@${esc(s.instagram || '')}</a>.</div>`}

    ${exec ? `
      <div class="exec-panel">
        <h2 class="section-title">Exec tools</h2>
        <div class="row gap wrap">
          <button class="btn btn-primary" id="btn-new-event">＋ New event</button>
          ${state.events.length ? `<button class="btn btn-ghost" id="btn-dup-event">＋ Next Saturday (copy latest)</button>` : ''}
          <button class="btn btn-ghost" id="btn-settings">Club settings</button>
          ${store.mode === 'demo' ? `<button class="btn btn-ghost" id="btn-reset-demo">Reset demo data</button>` : ''}
        </div>
        ${past.length ? `<h3 class="section-sub">Week by week record</h3>${past.map(e => eventCard(e, { record: true })).join('')}` : ''}
      </div>` : ''}

    <footer class="info-box">
      <h3>Important info</h3>
      <p><strong>📍 Location:</strong> ${esc(s.location || '')}</p>
      <p><strong>💸 Payment:</strong> Cash on site, or e-transfer to <strong>${esc(s.etransferEmail || '')}</strong></p>
      <ul>${(s.policies || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <p class="late-fee">⚠️ ${esc(s.lateFeeNote || '')}</p>
    </footer>`;

  const ep = $('#btn-edit-profile');
  if (ep) ep.addEventListener('click', () => openProfileModal());
  const ne = $('#btn-new-event');
  if (ne) ne.addEventListener('click', () => openEventEditor(null));
  const de = $('#btn-dup-event');
  if (de) de.addEventListener('click', duplicateLatestEvent);
  const st = $('#btn-settings');
  if (st) st.addEventListener('click', openSettingsModal);
  const rd = $('#btn-reset-demo');
  if (rd) rd.addEventListener('click', async () => {
    if (await confirmModal('Reset all demo data back to the sample event?', 'Reset')) {
      store.resetDemo(); toast('Demo data reset');
    }
  });
}

function avatarHtml(p, size = '') {
  if (p.photo) return `<img class="avatar ${size}" src="${p.photo}" alt="">`;
  const initial = (p.name || '?').trim().charAt(0).toUpperCase();
  return `<span class="avatar avatar-letter ${size}">${esc(initial)}</span>`;
}

/* ================================================================== */
/* Event view                                                          */
/* ================================================================== */

function paymentChip(s) {
  if (s.paid) return `<span class="chip chip-paid">Paid ✓</span>`;
  return `<span class="chip chip-unpaid">${s.method === 'cash' ? 'Cash on site' : 'E-transfer'} · unpaid</span>`;
}

function entryRow(ev, s, { waitlistPos = null, exec = false } = {}) {
  const mine = s.deviceId === DEVICE;
  return `
    <div class="entry ${mine ? 'entry-mine' : ''} ${exec ? 'entry-clickable' : ''}" ${exec ? `data-signup="${esc(s.id)}"` : ''}>
      ${avatarHtml(s, 'avatar-sm')}
      <div class="grow entry-name">
        <span>${esc(s.name)} ${mine ? '<em>(you)</em>' : ''}</span>
        ${s.insta ? `<small>@${esc(s.insta)}</small>` : ''}
      </div>
      ${waitlistPos !== null ? `<span class="chip chip-wl">WL #${waitlistPos}</span>` : ''}
      ${exec ? `${s.checkedIn ? '<span class="chip chip-in">Here</span>' : ''}${paymentChip(s)}` : (mine ? paymentChip(s) : (s.paid ? '<span class="chip chip-paid">✓</span>' : ''))}
      ${mine && !exec ? `<button class="btn btn-tiny btn-ghost" data-cancel="${esc(s.id)}" title="Remove my name">✕</button>` : ''}
    </div>`;
}

function renderEvent(ev) {
  const exec = isExec();
  const s = state.settings;
  const mine = mySignups(ev.id);
  const isOpen = isEventOpen(ev);

  const sessionsHtml = (ev.sessions || []).map(sess => {
    const lists = (ev.lists || []).filter(l => l.sessionId === sess.id);
    if (!lists.length) return '';
    return `
      <section class="session">
        <h2 class="session-title">🕐 ${esc(sess.label)}</h2>
        <div class="lists-grid">
          ${lists.map(l => {
            const entries = listEntries(ev.id, l.id);
            const { confirmed, waitlist } = splitByCap(entries, l.cap || 0);
            const spotsLeft = Math.max(0, (l.cap || 0) - confirmed.length);
            const full = spotsLeft === 0;
            const sport = SPORTS[l.sport] || SPORTS.other;
            const iAmIn = entries.some(e => e.deviceId === DEVICE);
            return `
              <div class="card list-card" style="--c:${sport.color}">
                <div class="list-head">
                  <span class="list-sport">${sport.emoji} ${esc(sport.label)}</span>
                  <span class="list-level">${esc(l.label)}</span>
                </div>
                <div class="list-cap">
                  <div class="capbar"><div class="capbar-fill ${full ? 'full' : ''}" style="width:${l.cap ? Math.min(100, confirmed.length / l.cap * 100) : 0}%"></div></div>
                  <span class="cap-text">${confirmed.length}/${l.cap || 0}${full ? ' · FULL' : ` · ${spotsLeft} left`}</span>
                </div>
                <div class="entries">
                  ${confirmed.map(e => entryRow(ev, e, { exec })).join('') || '<div class="empty-list">No one yet — be first!</div>'}
                  ${waitlist.length ? `<div class="wl-divider">Waitlist</div>${waitlist.map((e, i) => entryRow(ev, e, { waitlistPos: i + 1, exec })).join('')}` : ''}
                </div>
                ${isOpen && !iAmIn ? `<button class="btn ${full ? 'btn-ghost' : 'btn-primary'} btn-join" data-join="${esc(l.id)}">${full ? 'Join waitlist' : 'Join'}</button>` : ''}
                ${exec ? `<button class="btn btn-tiny btn-ghost" data-exec-add="${esc(l.id)}">＋ Add player</button>` : ''}
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');

  $('#view').innerHTML = `
    <a class="back" href="#/">← All events</a>
    <div class="event-head card">
      <div class="row gap wrap">
        <div class="grow">
          <h1 class="event-h1">${esc(fmtDate(ev.date))}</h1>
          <div class="event-sub">${esc(ev.title || '')} · ${esc(ev.location || s.location || '')}</div>
          <div class="event-prices">${pricesSummary(ev)}</div>
        </div>
        ${!isOpen ? `<span class="chip chip-muted">${isPastEvent(ev) ? 'Past event' : 'Closed'}</span>` : ''}
      </div>
      ${mine.length ? `
        <div class="my-spots">
          <strong>Your spots:</strong>
          ${mine.map(m => {
            const l = listById(ev, m.listId);
            const sess = l ? sessionById(ev, l.sessionId) : null;
            return `<span class="chip chip-mine">${SPORTS[l?.sport]?.emoji || ''} ${esc(l ? l.label : '?')}${sess ? ' · ' + esc(sess.label) : ''}</span>`;
          }).join('')}
          ${mine.some(m => !m.paid) ? `<button class="btn btn-small btn-warn" id="btn-how-pay">How to pay</button>` : '<span class="chip chip-paid">All paid ✓</span>'}
        </div>` : ''}
      ${exec ? `
        <div class="row gap wrap exec-toolbar">
          <button class="btn btn-small btn-ghost" id="btn-edit-event">Edit event</button>
          <button class="btn btn-small btn-ghost" id="btn-summary">💰 Payments</button>
          <button class="btn btn-small btn-ghost" id="btn-csv">Export CSV</button>
          <button class="btn btn-small btn-ghost" id="btn-toggle-open">${isOpen ? 'Close sign-ups' : 'Reopen sign-ups'}</button>
        </div>` : ''}
    </div>
    ${sessionsHtml}
  `;

  $$('[data-join]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    openJoinSheet(ev, b.dataset.join);
  }));
  $$('[data-cancel]').forEach(b => b.addEventListener('click', async e => {
    e.preventDefault();
    const su = eventSignups(ev.id).find(x => x.id === b.dataset.cancel);
    if (!su) return;
    if (await confirmModal(`Remove ${su.name} from this list?`, 'Remove me')) {
      await store.deleteSignup(ev.id, su.id);
      toast('You were removed from the list');
    }
  }));
  const hp = $('#btn-how-pay');
  if (hp) hp.addEventListener('click', () => openPayInfoModal(ev));

  if (exec) {
    $$('[data-signup]').forEach(row => row.addEventListener('click', e => {
      if (e.target.closest('[data-cancel]')) return;
      const su = eventSignups(ev.id).find(x => x.id === row.dataset.signup);
      if (su) openPlayerAdminModal(ev, su);
    }));
    $$('[data-exec-add]').forEach(b => b.addEventListener('click', () => openExecAddModal(ev, b.dataset.execAdd)));
    $('#btn-edit-event')?.addEventListener('click', () => openEventEditor(ev));
    $('#btn-summary')?.addEventListener('click', () => openSummaryModal(ev));
    $('#btn-csv')?.addEventListener('click', () => exportCsv(ev));
    $('#btn-toggle-open')?.addEventListener('click', async () => {
      await store.saveEvent({ ...ev, status: isOpen ? 'closed' : 'open' });
      toast(isOpen ? 'Sign-ups closed' : 'Sign-ups reopened');
    });
  }
}

/* ================================================================== */
/* Join flow                                                           */
/* ================================================================== */

function profileFieldsHtml(p) {
  return `
    <div class="row gap center">
      <label class="avatar-pick" title="Add a photo (optional)">
        <span id="pf-avatar">${p ? avatarHtml(p) : '<span class="avatar avatar-letter">📷</span>'}</span>
        <input type="file" accept="image/*" id="pf-photo" hidden>
      </label>
      <div class="grow stack">
        <input class="input" id="pf-name" placeholder="Your name *" value="${esc(p?.name || '')}" maxlength="40">
        <input class="input" id="pf-insta" placeholder="Instagram (optional, no @)" value="${esc(p?.insta || '')}" maxlength="40">
      </div>
    </div>`;
}

let pendingPhoto = null;

function wireProfileFields(ov, existing) {
  pendingPhoto = existing?.photo || '';
  $('#pf-photo', ov).addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      pendingPhoto = await fileToThumb(f);
      $('#pf-avatar', ov).innerHTML = `<img class="avatar" src="${pendingPhoto}" alt="">`;
    } catch (err) { toast('Could not read that image', 'err'); }
  });
}

function readProfileFields(ov) {
  const name = $('#pf-name', ov).value.trim();
  const insta = $('#pf-insta', ov).value.trim().replace(/^@/, '');
  if (!name) { toast('Please enter your name', 'err'); return null; }
  return { name, insta, photo: pendingPhoto || '' };
}

function openProfileModal() {
  const p = getProfile();
  const ov = openModal(`
    <div class="modal-body">
      <h2>Your profile</h2>
      <p class="hint">Saved on this device so next week is one tap.</p>
      ${profileFieldsHtml(p)}
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>Cancel</button>
        <button class="btn btn-primary grow" id="pf-save">Save</button>
      </div>
    </div>`);
  wireProfileFields(ov, p);
  $('#pf-save', ov).addEventListener('click', () => {
    const np = readProfileFields(ov);
    if (!np) return;
    saveProfile(np);
    ov.remove(); toast('Profile saved'); render();
  });
}

function openJoinSheet(ev, preselectedListId) {
  const p = getProfile();
  const myIds = new Set(mySignups(ev.id).map(m => m.listId));
  const s = state.settings;

  const listCheckboxes = (ev.sessions || []).map(sess => {
    const lists = (ev.lists || []).filter(l => l.sessionId === sess.id && !myIds.has(l.id));
    if (!lists.length) return '';
    return `
      <div class="join-session">
        <div class="join-session-label">${esc(sess.label)}</div>
        ${lists.map(l => {
          const entries = listEntries(ev.id, l.id);
          const full = entries.length >= (l.cap || 0);
          const sport = SPORTS[l.sport] || SPORTS.other;
          return `
            <label class="join-list ${full ? 'join-full' : ''}">
              <input type="checkbox" data-list="${esc(l.id)}" ${l.id === preselectedListId ? 'checked' : ''}>
              <span class="grow">${sport.emoji} ${esc(sport.label)} — ${esc(l.label)}</span>
              ${full ? '<span class="chip chip-wl">waitlist</span>' : ''}
            </label>`;
        }).join('')}
      </div>`;
  }).join('');

  const ov = openModal(`
    <div class="modal-body">
      <h2>Sign up — ${esc(fmtDate(ev.date))}</h2>
      ${profileFieldsHtml(p)}
      <h3 class="section-sub">Pick your list(s)</h3>
      <div class="prices-once">${pricesSummary(ev)}</div>
      ${listCheckboxes || '<p class="hint">You are already on every list 😄</p>'}
      <h3 class="section-sub">Payment method</h3>
      <div class="row gap">
        <label class="pay-opt"><input type="radio" name="paym" value="etransfer" checked> <span>📧 E-transfer</span></label>
        <label class="pay-opt"><input type="radio" name="paym" value="cash"> <span>💵 Cash on site</span></label>
      </div>
      <div class="price-box" id="join-price"></div>
      <div class="pay-instructions" id="join-payinfo"></div>
      <p class="hint">ℹ️ The host might move your name to the appropriate level. Your spot is confirmed once payment is received.</p>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>Cancel</button>
        <button class="btn btn-primary grow" id="join-confirm">Confirm sign-up</button>
      </div>
    </div>`);

  wireProfileFields(ov, p);

  function refreshPrice() {
    const method = $('input[name="paym"]:checked', ov).value;
    const chosen = $$('input[data-list]:checked', ov).map(c => c.dataset.list);
    // include lists I'm already on, so bundles apply across the whole event
    const already = [...myIds];
    const { total: totalAll } = computePrice(ev, [...chosen, ...already], method);
    const { total: totalOld } = computePrice(ev, already, method);
    const due = totalAll - totalOld;
    const { parts } = computePrice(ev, chosen.length ? [...chosen, ...already] : [], method);
    $('#join-price', ov).innerHTML = chosen.length
      ? `${parts.map(pt => `<div class="price-line"><span>${esc(pt.label)}</span><span>${fmtMoney(pt.price)}</span></div>`).join('')}
         <div class="price-line price-total"><span>To pay${already.length ? ' (new total for this event)' : ''}</span><span>${fmtMoney(already.length ? totalAll : due)}</span></div>`
      : '<p class="hint">Select at least one list.</p>';
    $('#join-payinfo', ov).innerHTML = method === 'etransfer'
      ? `<p>📧 Send your e-transfer to <strong>${esc(s.etransferEmail)}</strong><br><small>Mention <strong>your name</strong> in the transfer message!</small></p>`
      : `<p>💵 Bring cash and pay an exec at the gym. <small>${esc(s.lateFeeNote || '')}</small></p>`;
  }
  $$('input[data-list], input[name="paym"]', ov).forEach(i => i.addEventListener('change', refreshPrice));
  refreshPrice();

  $('#join-confirm', ov).addEventListener('click', async () => {
    const np = readProfileFields(ov);
    if (!np) return;
    const chosen = $$('input[data-list]:checked', ov).map(c => c.dataset.list);
    if (!chosen.length) { toast('Pick at least one list', 'err'); return; }
    const method = $('input[name="paym"]:checked', ov).value;
    saveProfile(np);
    const now = Date.now();
    const signups = chosen.map((listId, i) => ({
      id: uid('su'),
      listId,
      name: np.name,
      insta: np.insta,
      photo: np.photo,
      deviceId: DEVICE,
      method,
      paid: false,
      checkedIn: false,
      order: now + i,
      createdAt: now + i,
      addedByExec: false,
    }));
    try {
      await store.addSignups(ev.id, signups);
      ov.remove();
      toast('You\'re on the list! 🎉');
      openPayInfoModal(ev, method);
    } catch (err) {
      console.error(err);
      toast('Something went wrong — try again', 'err');
    }
  });
}

function openPayInfoModal(ev, method) {
  const s = state.settings;
  const mine = mySignups(ev.id).filter(m => !m.paid);
  const m = method || (mine[0]?.method) || 'etransfer';
  const ids = mySignups(ev.id).map(x => x.listId);
  const { total } = computePrice(ev, ids, m);
  openModal(`
    <div class="modal-body">
      <h2>How to pay</h2>
      <div class="price-box">
        <div class="price-line price-total"><span>Your total for ${esc(fmtDate(ev.date))}</span><span>${fmtMoney(total)}</span></div>
      </div>
      ${m === 'etransfer' ? `
        <p>📧 E-transfer to:</p>
        <p class="pay-email">${esc(s.etransferEmail)}</p>
        <p class="hint">Mention <strong>your name</strong> (and anyone you're paying for) in the message.</p>` : `
        <p>💵 You chose <strong>cash</strong> — pay an exec at the gym before you play.</p>`}
      <p class="hint">⚠️ ${esc(s.lateFeeNote || '')}</p>
      <button class="btn btn-primary wide" data-close>Got it</button>
    </div>`);
}

/* ================================================================== */
/* Exec: PIN                                                           */
/* ================================================================== */

function openPinModal() {
  const ov = openModal(`
    <div class="modal-body">
      <h2>Exec access</h2>
      <input class="input input-pin" id="pin-input" type="password" inputmode="numeric" placeholder="Club PIN" maxlength="12" autofocus>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>Cancel</button>
        <button class="btn btn-primary grow" id="pin-go">Unlock</button>
      </div>
    </div>`);
  const tryPin = () => {
    const val = $('#pin-input', ov).value.trim();
    if (val && val === String(state.settings.execPin || '')) {
      setExec(true); ov.remove(); toast('Exec mode on 🔓'); render();
    } else {
      toast('Wrong PIN', 'err');
    }
  };
  $('#pin-go', ov).addEventListener('click', tryPin);
  $('#pin-input', ov).addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });
  $('#pin-input', ov).focus();
}

/* ================================================================== */
/* Exec: player admin                                                  */
/* ================================================================== */

function openPlayerAdminModal(ev, su) {
  const listsOptions = (ev.lists || []).map(l => {
    const sess = sessionById(ev, l.sessionId);
    return `<option value="${esc(l.id)}" ${l.id === su.listId ? 'selected' : ''}>${esc(sess ? sess.label : '')} · ${SPORTS[l.sport]?.emoji || ''} ${esc(l.label)}</option>`;
  }).join('');
  const ov = openModal(`
    <div class="modal-body">
      <div class="row gap center">
        ${avatarHtml(su)}
        <div class="grow">
          <h2 class="m0">${esc(su.name)}</h2>
          ${su.insta ? `<a href="https://instagram.com/${esc(su.insta)}" target="_blank" rel="noopener">@${esc(su.insta)}</a>` : '<small class="hint">no instagram</small>'}
        </div>
      </div>
      <div class="row gap">
        <button class="btn grow ${su.paid ? 'btn-success' : 'btn-ghost'}" id="pa-paid">${su.paid ? 'Paid ✓' : 'Mark paid'}</button>
        <button class="btn grow ${su.checkedIn ? 'btn-success' : 'btn-ghost'}" id="pa-in">${su.checkedIn ? 'Here ✓' : 'Check in'}</button>
      </div>
      <p class="hint">Payment: ${su.method === 'cash' ? '💵 cash' : '📧 e-transfer'}${su.addedByExec ? ' · added by exec' : ''}</p>
      <label class="field-label">Move to another list</label>
      <select class="input" id="pa-move">${listsOptions}</select>
      <div class="row gap">
        <button class="btn btn-ghost grow" id="pa-top">⬆ Top of list</button>
        <button class="btn btn-danger grow" id="pa-remove">Remove</button>
      </div>
      <button class="btn btn-ghost wide" data-close>Done</button>
    </div>`);

  $('#pa-paid', ov).addEventListener('click', async () => {
    await store.updateSignup(ev.id, su.id, { paid: !su.paid, paidAt: !su.paid ? Date.now() : null });
    su.paid = !su.paid;
    $('#pa-paid', ov).className = `btn grow ${su.paid ? 'btn-success' : 'btn-ghost'}`;
    $('#pa-paid', ov).textContent = su.paid ? 'Paid ✓' : 'Mark paid';
  });
  $('#pa-in', ov).addEventListener('click', async () => {
    await store.updateSignup(ev.id, su.id, { checkedIn: !su.checkedIn });
    su.checkedIn = !su.checkedIn;
    $('#pa-in', ov).className = `btn grow ${su.checkedIn ? 'btn-success' : 'btn-ghost'}`;
    $('#pa-in', ov).textContent = su.checkedIn ? 'Here ✓' : 'Check in';
  });
  $('#pa-move', ov).addEventListener('change', async e => {
    await store.updateSignup(ev.id, su.id, { listId: e.target.value, order: Date.now() });
    toast(`${su.name} moved`);
    ov.remove();
  });
  $('#pa-top', ov).addEventListener('click', async () => {
    const first = listEntries(ev.id, su.listId)[0];
    const newOrder = first ? (first.order ?? first.createdAt) - 1000 : Date.now();
    await store.updateSignup(ev.id, su.id, { order: newOrder });
    toast(`${su.name} moved to top`);
    ov.remove();
  });
  $('#pa-remove', ov).addEventListener('click', async () => {
    ov.remove();
    if (await confirmModal(`Remove ${su.name} from the list?`, 'Remove')) {
      await store.deleteSignup(ev.id, su.id);
      toast(`${su.name} removed`);
    }
  });
}

function openExecAddModal(ev, listId) {
  const l = listById(ev, listId);
  const ov = openModal(`
    <div class="modal-body">
      <h2>Add player</h2>
      <p class="hint">${SPORTS[l?.sport]?.emoji || ''} ${esc(l?.label || '')}</p>
      <div class="stack">
        <input class="input" id="ea-name" placeholder="Name *" maxlength="40">
        <input class="input" id="ea-insta" placeholder="Instagram (optional)" maxlength="40">
        <label class="pay-opt"><input type="checkbox" id="ea-paid"> <span>Already paid</span></label>
      </div>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>Cancel</button>
        <button class="btn btn-primary grow" id="ea-save">Add</button>
      </div>
    </div>`);
  $('#ea-save', ov).addEventListener('click', async () => {
    const name = $('#ea-name', ov).value.trim();
    if (!name) { toast('Name required', 'err'); return; }
    await store.addSignups(ev.id, [{
      id: uid('su'),
      listId,
      name,
      insta: $('#ea-insta', ov).value.trim().replace(/^@/, ''),
      photo: '',
      deviceId: 'exec-added',
      method: 'cash',
      paid: $('#ea-paid', ov).checked,
      checkedIn: false,
      order: Date.now(),
      createdAt: Date.now(),
      addedByExec: true,
    }]);
    ov.remove();
    toast(`${name} added`);
  });
}

/* ================================================================== */
/* Exec: payments summary + CSV                                        */
/* ================================================================== */

function personTotals(ev) {
  /* Group signups per person, compute expected price with bundles. */
  const persons = {};
  for (const su of eventSignups(ev.id)) {
    const k = personKey(su);
    if (!persons[k]) persons[k] = { name: su.name, insta: su.insta, method: su.method, signups: [] };
    persons[k].signups.push(su);
  }
  return Object.values(persons).map(p => {
    const { total } = computePrice(ev, p.signups.map(x => x.listId), p.method);
    return { ...p, total, paid: p.signups.every(x => x.paid), checkedIn: p.signups.some(x => x.checkedIn) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function openSummaryModal(ev) {
  const people = personTotals(ev);
  const paid = people.filter(p => p.paid);
  const unpaid = people.filter(p => !p.paid);
  const collected = paid.reduce((a, p) => a + p.total, 0);
  const outstanding = unpaid.reduce((a, p) => a + p.total, 0);
  openModal(`
    <div class="modal-body">
      <h2>Payments — ${esc(fmtDate(ev.date))}</h2>
      <div class="stat-row">
        <div class="stat"><strong>${people.length}</strong><span>players</span></div>
        <div class="stat stat-good"><strong>${fmtMoney(collected)}</strong><span>collected</span></div>
        <div class="stat stat-bad"><strong>${fmtMoney(outstanding)}</strong><span>outstanding</span></div>
      </div>
      ${unpaid.length ? `
        <h3 class="section-sub">Not paid yet (${unpaid.length})</h3>
        <div class="summary-list">
          ${unpaid.map(p => `<div class="entry"><span class="grow">${esc(p.name)}${p.insta ? ` <small>@${esc(p.insta)}</small>` : ''}</span><span class="chip chip-unpaid">${p.method === 'cash' ? '💵' : '📧'} ${fmtMoney(p.total)}</span></div>`).join('')}
        </div>` : '<p class="hint">Everyone paid 🎉</p>'}
      ${paid.length ? `
        <h3 class="section-sub">Paid (${paid.length})</h3>
        <div class="summary-list">
          ${paid.map(p => `<div class="entry"><span class="grow">${esc(p.name)}</span><span class="chip chip-paid">${fmtMoney(p.total)} ✓</span></div>`).join('')}
        </div>` : ''}
      <button class="btn btn-primary wide" data-close>Close</button>
    </div>`, { wide: true });
}

function exportCsv(ev) {
  const rows = [['Name', 'Instagram', 'Session', 'List', 'Sport', 'Status', 'Payment method', 'Paid', 'Checked in']];
  for (const l of ev.lists || []) {
    const sess = sessionById(ev, l.sessionId);
    const entries = listEntries(ev.id, l.id);
    const { confirmed, waitlist } = splitByCap(entries, l.cap || 0);
    for (const su of confirmed) rows.push([su.name, su.insta, sess?.label || '', l.label, SPORTS[l.sport]?.label || l.sport, 'confirmed', su.method, su.paid ? 'yes' : 'NO', su.checkedIn ? 'yes' : '']);
    for (const su of waitlist) rows.push([su.name, su.insta, sess?.label || '', l.label, SPORTS[l.sport]?.label || l.sport, 'waitlist', su.method, su.paid ? 'yes' : 'NO', su.checkedIn ? 'yes' : '']);
  }
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crsc-${ev.date || 'event'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ================================================================== */
/* Exec: event editor                                                  */
/* ================================================================== */

function duplicateLatestEvent() {
  const src = [...state.events].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!src) return;
  const d = new Date((src.date || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
  d.setDate(d.getDate() + 7);
  const copy = {
    ...JSON.parse(JSON.stringify(src)),
    id: uid('ev'),
    date: d.toISOString().slice(0, 10),
    status: 'open',
    createdAt: Date.now(),
  };
  copy.lists = copy.lists.map(l => ({ ...l, id: uid('l') }));
  openEventEditor(copy, { isNew: true });
}

function sportOptions(sel) {
  return Object.entries(SPORTS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('');
}

function openEventEditor(ev, { isNew = false } = {}) {
  const creating = !ev || isNew;
  const draft = ev ? JSON.parse(JSON.stringify(ev)) : makeTemplateEvent(nextSaturday(), 'Saturday Drop-in');
  if (!ev) draft.lists = draft.lists || [];

  const ov = openModal(`
    <div class="modal-body">
      <h2>${creating ? 'New event' : 'Edit event'}</h2>
      <div class="stack">
        <label class="field-label">Title</label>
        <input class="input" id="ee-title" value="${esc(draft.title || '')}" maxlength="60">
        <label class="field-label">Date</label>
        <input class="input" id="ee-date" type="date" value="${esc(draft.date || '')}">
        <label class="field-label">Location</label>
        <input class="input" id="ee-location" value="${esc(draft.location || state.settings.location || '')}" maxlength="120">
        <div class="row gap">
          <div class="grow stack">
            <label class="field-label">Slot 1 label</label>
            <input class="input" id="ee-s1" value="${esc(draft.sessions?.[0]?.label || '5:30 – 7:30 PM')}">
          </div>
          <div class="grow stack">
            <label class="field-label">Slot 2 label</label>
            <input class="input" id="ee-s2" value="${esc(draft.sessions?.[1]?.label || '7:30 – 9:30 PM')}">
          </div>
        </div>
      </div>
      <h3 class="section-sub">Lists</h3>
      <div id="ee-lists"></div>
      <button class="btn btn-ghost wide" id="ee-addlist">＋ Add list</button>
      <h3 class="section-sub">Bundle price (playing a sport in both slots)</h3>
      <div class="row gap center">
        <select class="input grow" id="ee-bsport">
          <option value="">No bundle</option>
          ${sportOptions(draft.bundles?.[0]?.sport)}
        </select>
        <input class="input input-num" id="ee-bprice" type="number" min="0" step="1" placeholder="$" value="${esc(draft.bundles?.[0]?.priceE ?? '')}">
      </div>
      <div class="row gap sticky-actions">
        <button class="btn btn-ghost grow" data-close>Cancel</button>
        ${!creating ? '<button class="btn btn-danger" id="ee-delete">Delete</button>' : ''}
        <button class="btn btn-primary grow" id="ee-save">${creating ? 'Create event' : 'Save changes'}</button>
      </div>
    </div>`, { wide: true });

  function renderLists() {
    $('#ee-lists', ov).innerHTML = draft.lists.map((l, i) => `
      <div class="ee-list" data-i="${i}">
        <div class="row gap">
          <select class="input" data-f="sessionId">
            <option value="s1" ${l.sessionId === 's1' ? 'selected' : ''}>Slot 1</option>
            <option value="s2" ${l.sessionId === 's2' ? 'selected' : ''}>Slot 2</option>
          </select>
          <select class="input grow" data-f="sport">${sportOptions(l.sport)}</select>
          <button class="btn btn-tiny btn-danger" data-del="${i}">✕</button>
        </div>
        <div class="row gap">
          <input class="input grow" data-f="label" placeholder="Level / label" value="${esc(l.label)}">
          <input class="input input-num" data-f="cap" type="number" min="0" step="1" title="Capacity" value="${esc(l.cap)}">
          <input class="input input-num" data-f="priceE" type="number" min="0" step="1" title="Price e-transfer" value="${esc(l.priceE)}">
          <input class="input input-num" data-f="priceC" type="number" min="0" step="1" title="Price cash" value="${esc(l.priceC)}">
        </div>
        <div class="ee-cols"><span>slot / sport</span><span>label · cap · e-transfer $ · cash $</span></div>
      </div>`).join('');
    $$('.ee-list', ov).forEach(row => {
      const i = +row.dataset.i;
      $$('[data-f]', row).forEach(inp => inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        draft.lists[i][f] = (f === 'cap' || f === 'priceE' || f === 'priceC') ? (parseFloat(inp.value) || 0) : inp.value;
      }));
    });
    $$('[data-del]', ov).forEach(b => b.addEventListener('click', () => {
      draft.lists.splice(+b.dataset.del, 1);
      renderLists();
    }));
  }
  renderLists();

  $('#ee-addlist', ov).addEventListener('click', () => {
    draft.lists.push({ id: uid('l'), sessionId: 's1', sport: 'volleyball', label: '', cap: 14, priceE: 8, priceC: 10 });
    renderLists();
  });

  $('#ee-save', ov).addEventListener('click', async () => {
    draft.title = $('#ee-title', ov).value.trim() || 'Saturday Drop-in';
    draft.date = $('#ee-date', ov).value;
    draft.location = $('#ee-location', ov).value.trim();
    draft.sessions = [
      { id: 's1', label: $('#ee-s1', ov).value.trim() || 'Slot 1' },
      { id: 's2', label: $('#ee-s2', ov).value.trim() || 'Slot 2' },
    ];
    const bsport = $('#ee-bsport', ov).value;
    const bprice = parseFloat($('#ee-bprice', ov).value);
    draft.bundles = bsport && !isNaN(bprice)
      ? [{ sport: bsport, label: `${SPORTS[bsport].label} 4h (both time slots)`, priceE: bprice, priceC: bprice }]
      : [];
    if (!draft.date) { toast('Pick a date', 'err'); return; }
    if (!draft.lists.length) { toast('Add at least one list', 'err'); return; }
    draft.status = draft.status || 'open';
    await store.saveEvent(draft);
    ov.remove();
    toast(creating ? 'Event created 🎉' : 'Event saved');
    location.hash = '#/event/' + draft.id;
  });

  const del = $('#ee-delete', ov);
  if (del) del.addEventListener('click', async () => {
    ov.remove();
    if (await confirmModal('Delete this event and ALL its sign-ups? This cannot be undone.', 'Delete event')) {
      await store.deleteEvent(draft.id);
      location.hash = '#/';
      toast('Event deleted');
    }
  });
}

/* ================================================================== */
/* Exec: club settings                                                 */
/* ================================================================== */

function openSettingsModal() {
  const s = state.settings;
  const ov = openModal(`
    <div class="modal-body">
      <h2>Club settings</h2>
      <div class="stack">
        <label class="field-label">E-transfer email</label>
        <input class="input" id="cs-email" value="${esc(s.etransferEmail || '')}">
        <label class="field-label">Default location</label>
        <input class="input" id="cs-location" value="${esc(s.location || '')}">
        <label class="field-label">Instagram handle</label>
        <input class="input" id="cs-insta" value="${esc(s.instagram || '')}">
        <label class="field-label">Exec PIN</label>
        <input class="input" id="cs-pin" value="${esc(s.execPin || '')}" maxlength="12">
        <label class="field-label">Late fee note</label>
        <input class="input" id="cs-latefee" value="${esc(s.lateFeeNote || '')}">
        <label class="field-label">Policies (one per line)</label>
        <textarea class="input" id="cs-policies" rows="6">${esc((s.policies || []).join('\n'))}</textarea>
      </div>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>Cancel</button>
        <button class="btn btn-primary grow" id="cs-save">Save</button>
      </div>
    </div>`, { wide: true });
  $('#cs-save', ov).addEventListener('click', async () => {
    await store.saveSettings({
      etransferEmail: $('#cs-email', ov).value.trim(),
      location: $('#cs-location', ov).value.trim(),
      instagram: $('#cs-insta', ov).value.trim().replace(/^@/, ''),
      execPin: $('#cs-pin', ov).value.trim() || '1234',
      lateFeeNote: $('#cs-latefee', ov).value.trim(),
      policies: $('#cs-policies', ov).value.split('\n').map(x => x.trim()).filter(Boolean),
    });
    ov.remove();
    toast('Settings saved');
  });
}

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */

async function main() {
  store = await createStore();
  window.addEventListener('hashchange', render);
  await store.init(newState => {
    state = newState;
    render();
  });
}

main();
