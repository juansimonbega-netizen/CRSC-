/*
 * Data layer for the CRSC app.
 *
 * Two implementations behind one interface:
 *  - Demo store: everything in localStorage. Used when firebase-config.js
 *    has no config. Great for previewing / testing the UI.
 *  - Firebase store: Firestore with realtime listeners. Used in production.
 *
 * Interface:
 *   store.mode                  -> 'demo' | 'live'
 *   store.init(onChange)        -> starts listeners; onChange(state) fires on every change
 *   store.watchEvent(eventId)   -> subscribe to an event's signups
 *   store.unwatchEvent(eventId)
 *   store.saveSettings(patch)
 *   store.saveEvent(event)      -> create or update (event.id required)
 *   store.deleteEvent(eventId)
 *   store.addSignups(eventId, [signup, ...])
 *   store.updateSignup(eventId, signupId, patch)
 *   store.deleteSignup(eventId, signupId)
 *
 * state = { settings, events: [...], signups: { [eventId]: [...] } }
 */

export const DEFAULT_SETTINGS = {
  clubName: 'CRSC',
  clubFullName: 'Concordia Recreational Sports Club',
  etransferEmail: 'concordiaRSclub@gmail.com',
  instagram: 'crsc_concordia',
  location: 'Collège de Maisonneuve, 2701 rue Nicolet, H1X 1Z8, 3rd floor',
  execPin: '1234',
  seasonEnd: '2026-12-26',
  lateFeeNote: '+5$ late fee if payment is made after the event',
  lateFeeAmount: 5,
  cancelLockHours: 24,
  battlePassNote: 'Volleyball season pass — 4h (both slots) 135$ instead of 165$ · 2h 75$ instead of 88$. E-transfer the club and an exec activates it on your profile.',
  policies: [
    'For e-Transfer make sure to mention the name of the person(s) you are paying for.',
    'Please note that the host might move your name to the appropriate level.',
    'Your spot is not confirmed until payment is received.',
    "If you can't attend an event you have to remove your name from the list.",
    "You will get reimbursed or play for free next time if you can't attend.",
  ],
};

export const SPORTS = {
  /* Volleyball games: at most 4 teams of at most 7 players each. Team rules
   * for basketball and football are still to be decided by the club. */
  volleyball: { label: 'Volleyball', emoji: '🏐', color: '#2f7dd1', maxTeams: 4, teamSize: 7 },
  basketball: { label: 'Basketball', emoji: '🏀', color: '#e0762c' },
  football:   { label: 'Football',   emoji: '⚽', color: '#2f9e44' },
  badminton:  { label: 'Badminton',  emoji: '🏸', color: '#9c36b5' },
  other:      { label: 'Other',      emoji: '🎽', color: '#64748b' },
};

export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function deviceId() {
  let id = null;
  try { id = localStorage.getItem('crsc-device-id'); } catch (e) { /* ignore */ }
  if (!id) {
    id = uid('dev_');
    try { localStorage.setItem('crsc-device-id', id); } catch (e) { /* ignore */ }
  }
  return id;
}

/* A ready-to-use Saturday template mirroring the club's current sheet. */
export function makeTemplateEvent(dateStr, title) {
  const lists = [
    { id: uid('l'), sessionId: 's1', sport: 'basketball', label: 'Mixed',      cap: 12, priceE: 10, priceC: 10, teamCount: 0 },
    { id: uid('l'), sessionId: 's1', sport: 'basketball', label: 'Men',        cap: 12, priceE: 10, priceC: 10, teamCount: 0 },
    { id: uid('l'), sessionId: 's1', sport: 'football',   label: '5v5',        cap: 15, priceE: 10, priceC: 10, teamCount: 0 },
    { id: uid('l'), sessionId: 's1', sport: 'volleyball', label: 'Advanced +', cap: 14, priceE: 8,  priceC: 10, teamCount: 2 },
    { id: uid('l'), sessionId: 's1', sport: 'volleyball', label: 'Advanced',   cap: 14, priceE: 8,  priceC: 10, teamCount: 2 },
    { id: uid('l'), sessionId: 's2', sport: 'volleyball', label: 'Advanced',   cap: 28, priceE: 8,  priceC: 10, teamCount: 4 },
    { id: uid('l'), sessionId: 's2', sport: 'volleyball', label: 'Advanced +', cap: 28, priceE: 8,  priceC: 10, teamCount: 4 },
  ];
  return {
    id: uid('ev'),
    title: title || 'Saturday Drop-in',
    date: dateStr,
    status: 'open',
    location: DEFAULT_SETTINGS.location,
    sessions: [
      { id: 's1', label: '5:30 – 7:30 PM' },
      { id: 's2', label: '7:30 – 9:30 PM' },
    ],
    lists,
    bundles: [
      { sport: 'volleyball', label: 'Volleyball 4h (both time slots)', priceE: 15, priceC: 15 },
    ],
    createdAt: Date.now(),
  };
}

/* Local-time ISO date (YYYY-MM-DD). Never use toISOString() for calendar
 * dates: it converts to UTC, which in Montréal shifts evening dates to the
 * next day — turning Saturdays into Sundays. */
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nextSaturday(offsetWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + offsetWeeks * 7);
  return localISO(d);
}

/* Every Saturday from the next one through endDate (inclusive), as ISO dates. */
export function saturdaysUntil(endDate) {
  const out = [];
  for (let i = 0; ; i++) {
    const s = nextSaturday(i);
    if (!endDate || s > endDate) break;
    out.push(s);
    if (out.length > 60) break; // safety
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Demo store (localStorage)                                          */
/* ------------------------------------------------------------------ */

const DEMO_KEY = 'crsc-demo-v6';

function demoSeed() {
  const players = {};
  const seedSignups = (ev, listIdx, names, { paid = false, teamed = false } = {}) => names.map(([name, insta], i) => {
    const deviceId = 'demo-' + name.toLowerCase().replace(/\s+/g, '-');
    const email = name.toLowerCase().replace(/\s+/g, '.') + '@example.com';
    players[deviceId] = { deviceId, name, insta, email, phone: '', photo: '', lang: 'en', lastSeen: Date.now() };
    return {
      id: uid('su'),
      listId: ev.lists[listIdx].id,
      name, insta,
      email,
      phone: '',
      photo: '',
      deviceId,
      method: i % 2 ? 'cash' : 'etransfer',
      paid: paid || i < 2,
      checkedIn: paid,
      team: teamed ? (i % 2) + 1 : null,
      order: Date.now() + i,
      createdAt: Date.now() + i,
      addedByExec: false,
    };
  });

  // A whole season of Saturdays to pick from, plus last week as a record.
  const season = saturdaysUntil(DEFAULT_SETTINGS.seasonEnd).slice(0, 16)
    .map(d => makeTemplateEvent(d, 'Saturday Drop-in'));
  const past = makeTemplateEvent(nextSaturday(-1), 'Saturday Drop-in');
  past.status = 'closed';

  const signups = { [past.id]: seedSignups(past, 3, [
    ['Giulio', ''], ['Heejin', ''], ['Anthony', ''], ['Cami', ''], ['Deniz', ''],
  ], { paid: true, teamed: true }) };
  for (const ev of season) signups[ev.id] = [];
  signups[season[0].id] = seedSignups(season[0], 3, [
    ['Essma', 'essma.mtl'], ['Rayan', ''], ['Maya', 'maya.mrshl'], ['Huy', ''],
  ], { teamed: true });
  // Sample Battle Pass holders so the tag is visible in the demo.
  if (players['demo-rayan']) players['demo-rayan'].battlePass = '4h';
  if (players['demo-maya']) players['demo-maya'].battlePass = '2h';

  // Leave one past signup unpaid so the automatic late fee is visible,
  // and seed sample "received e-transfer" rows for the matcher UI.
  const pastSus = signups[past.id];
  if (pastSus[4]) { pastSus[4].paid = false; pastSus[4].checkedIn = false; }

  return {
    settings: { ...DEFAULT_SETTINGS },
    events: [past, ...season],
    signups,
    players,
    payments: [
      { id: 'demo-pay-1', sender: 'HUY NGUYEN', amount: 10, receivedAt: Date.now() - 3600000, matched: false },
      { id: 'demo-pay-2', sender: 'SOMEONE ELSE', amount: 8, receivedAt: Date.now() - 7200000, matched: false },
    ],
  };
}

function createDemoStore() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(DEMO_KEY));
  } catch (e) { state = null; }
  if (!state || !state.settings || !Array.isArray(state.events)) state = demoSeed();
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
  state.players = state.players || {};
  state.payments = state.payments || [];
  state.removals = state.removals || [];
  let onChange = () => {};

  function persist() {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    onChange(state);
  }

  return {
    mode: 'demo',
    async init(cb) { onChange = cb; onChange(state); },
    watchEvent() {},
    unwatchEvent() {},
    async saveSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      persist();
    },
    async saveEvent(event) {
      const i = state.events.findIndex(e => e.id === event.id);
      if (i >= 0) state.events[i] = event; else state.events.push(event);
      if (!state.signups[event.id]) state.signups[event.id] = [];
      persist();
    },
    async deleteEvent(eventId) {
      state.events = state.events.filter(e => e.id !== eventId);
      delete state.signups[eventId];
      persist();
    },
    async addSignups(eventId, signups) {
      if (!state.signups[eventId]) state.signups[eventId] = [];
      state.signups[eventId].push(...signups);
      persist();
    },
    async updateSignup(eventId, signupId, patch) {
      const list = state.signups[eventId] || [];
      const s = list.find(x => x.id === signupId);
      if (s) Object.assign(s, patch);
      persist();
    },
    async deleteSignup(eventId, signupId) {
      state.signups[eventId] = (state.signups[eventId] || []).filter(x => x.id !== signupId);
      persist();
    },
    async savePlayer(player) {
      state.players[player.deviceId] = { ...state.players[player.deviceId], ...player };
      persist();
    },
    watchPlayers() {},
    watchPayments() {},
    watchRemovals() {},
    async updatePayment(paymentId, patch) {
      const p = state.payments.find(x => x.id === paymentId);
      if (p) Object.assign(p, patch);
      persist();
    },
    async addRemoval(record) {
      state.removals.push(record);
      persist();
    },
    resetDemo() {
      state = demoSeed();
      persist();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Firebase store (Firestore)                                         */
/* ------------------------------------------------------------------ */

async function createFirebaseStore(config) {
  const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const app = appMod.initializeApp(config);
  const db = fs.getFirestore(app);

  const state = { settings: { ...DEFAULT_SETTINGS }, events: [], signups: {}, players: {}, payments: [], removals: [] };
  let onChange = () => {};
  const eventWatchers = {}; // eventId -> unsubscribe
  let playersWatcher = null;
  let paymentsWatcher = null;
  let removalsWatcher = null;

  function emit() { onChange(state); }

  return {
    mode: 'live',
    async init(cb) {
      onChange = cb;
      fs.onSnapshot(fs.doc(db, 'config', 'main'), snap => {
        state.settings = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
        emit();
      }, err => console.error('settings listener', err));
      fs.onSnapshot(fs.query(fs.collection(db, 'events')), snap => {
        state.events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.events.sort((a, b) => (a.date < b.date ? 1 : -1));
        emit();
      }, err => console.error('events listener', err));
      emit();
    },
    watchEvent(eventId) {
      if (eventWatchers[eventId]) return;
      eventWatchers[eventId] = fs.onSnapshot(
        fs.collection(db, 'events', eventId, 'signups'),
        snap => {
          state.signups[eventId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          emit();
        },
        err => console.error('signups listener', err)
      );
    },
    unwatchEvent(eventId) {
      if (eventWatchers[eventId]) { eventWatchers[eventId](); delete eventWatchers[eventId]; }
    },
    async saveSettings(patch) {
      await fs.setDoc(fs.doc(db, 'config', 'main'), patch, { merge: true });
    },
    async saveEvent(event) {
      const { id, ...data } = event;
      await fs.setDoc(fs.doc(db, 'events', id), data);
    },
    async deleteEvent(eventId) {
      // Delete signups first (client-side; fine at club scale).
      const snap = await fs.getDocs(fs.collection(db, 'events', eventId, 'signups'));
      await Promise.all(snap.docs.map(d => fs.deleteDoc(d.ref)));
      await fs.deleteDoc(fs.doc(db, 'events', eventId));
    },
    async addSignups(eventId, signups) {
      await Promise.all(signups.map(s => {
        const { id, ...data } = s;
        return fs.setDoc(fs.doc(db, 'events', eventId, 'signups', id), data);
      }));
    },
    async updateSignup(eventId, signupId, patch) {
      await fs.setDoc(fs.doc(db, 'events', eventId, 'signups', signupId), patch, { merge: true });
    },
    async deleteSignup(eventId, signupId) {
      await fs.deleteDoc(fs.doc(db, 'events', eventId, 'signups', signupId));
    },
    async savePlayer(player) {
      const { deviceId, ...data } = player;
      await fs.setDoc(fs.doc(db, 'players', deviceId), data, { merge: true });
    },
    watchPlayers() {
      if (playersWatcher) return;
      playersWatcher = fs.onSnapshot(fs.collection(db, 'players'), snap => {
        state.players = {};
        for (const d of snap.docs) state.players[d.id] = { deviceId: d.id, ...d.data() };
        emit();
      }, err => console.error('players listener', err));
    },
    watchPayments() {
      if (paymentsWatcher) return;
      paymentsWatcher = fs.onSnapshot(fs.collection(db, 'payments'), snap => {
        state.payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.payments.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
        emit();
      }, err => console.error('payments listener', err));
    },
    async updatePayment(paymentId, patch) {
      await fs.setDoc(fs.doc(db, 'payments', paymentId), patch, { merge: true });
    },
    watchRemovals() {
      if (removalsWatcher) return;
      removalsWatcher = fs.onSnapshot(fs.collection(db, 'removals'), snap => {
        state.removals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        emit();
      }, err => console.error('removals listener', err));
    },
    async addRemoval(record) {
      const { id, ...data } = record;
      await fs.setDoc(fs.doc(db, 'removals', id), data);
    },
  };
}

export async function createStore() {
  const cfg = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || null;
  if (cfg && cfg.apiKey) {
    try {
      return await createFirebaseStore(cfg);
    } catch (err) {
      console.error('Firebase unavailable, falling back to demo mode:', err);
    }
  }
  return createDemoStore();
}
