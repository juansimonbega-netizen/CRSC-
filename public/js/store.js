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
  lateFeeNote: '+5$ late fee if payment is made after the event',
  policies: [
    'For e-Transfer make sure to mention the name of the person(s) you are paying for.',
    'Please note that the host might move your name to the appropriate level.',
    'Your spot is not confirmed until payment is received.',
    "If you can't attend an event you have to remove your name from the list.",
    "You will get reimbursed or play for free next time if you can't attend.",
  ],
};

export const SPORTS = {
  volleyball: { label: 'Volleyball', emoji: '🏐', color: '#2f7dd1' },
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
    { id: uid('l'), sessionId: 's1', sport: 'basketball', label: 'Mixed',       cap: 12, priceE: 10, priceC: 10 },
    { id: uid('l'), sessionId: 's1', sport: 'basketball', label: 'Men',         cap: 12, priceE: 10, priceC: 10 },
    { id: uid('l'), sessionId: 's1', sport: 'football',   label: '5v5',         cap: 15, priceE: 10, priceC: 10 },
    { id: uid('l'), sessionId: 's1', sport: 'volleyball', label: 'Advanced +',  cap: 14, priceE: 8,  priceC: 10 },
    { id: uid('l'), sessionId: 's1', sport: 'volleyball', label: 'Advanced',    cap: 14, priceE: 8,  priceC: 10 },
    { id: uid('l'), sessionId: 's2', sport: 'volleyball', label: 'Advanced (court 1)', cap: 14, priceE: 8, priceC: 10 },
    { id: uid('l'), sessionId: 's2', sport: 'volleyball', label: 'Advanced (court 2)', cap: 14, priceE: 8, priceC: 10 },
    { id: uid('l'), sessionId: 's2', sport: 'volleyball', label: 'Advanced + (court 1)', cap: 14, priceE: 8, priceC: 10 },
    { id: uid('l'), sessionId: 's2', sport: 'volleyball', label: 'Advanced + (court 2)', cap: 14, priceE: 8, priceC: 10 },
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

export function nextSaturday(offsetWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Demo store (localStorage)                                          */
/* ------------------------------------------------------------------ */

const DEMO_KEY = 'crsc-demo-v2';

function demoSeed() {
  const seedSignups = (ev, listIdx, names, { paid = false } = {}) => names.map(([name, insta], i) => ({
    id: uid('su'),
    listId: ev.lists[listIdx].id,
    name, insta,
    photo: '',
    deviceId: 'demo-seed',
    method: i % 2 ? 'cash' : 'etransfer',
    paid: paid || i < 2,
    checkedIn: paid,
    order: Date.now() + i,
    createdAt: Date.now() + i,
    addedByExec: false,
  }));

  // This week + next week to choose from, plus last week as a record.
  const ev1 = makeTemplateEvent(nextSaturday(), 'Saturday Drop-in');
  const ev2 = makeTemplateEvent(nextSaturday(1), 'Saturday Drop-in');
  const past = makeTemplateEvent(nextSaturday(-1), 'Saturday Drop-in');
  past.status = 'closed';

  return {
    settings: { ...DEFAULT_SETTINGS },
    events: [past, ev1, ev2],
    signups: {
      [ev1.id]: seedSignups(ev1, 0, [
        ['Essma', 'essma.mtl'], ['Rayan', ''], ['Maya', 'maya.mrshl'], ['Huy', ''],
      ]),
      [ev2.id]: [],
      [past.id]: seedSignups(past, 3, [
        ['Giulio', ''], ['Heejin', ''], ['Anthony', ''], ['Cami', ''], ['Deniz', ''],
      ], { paid: true }),
    },
  };
}

function createDemoStore() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(DEMO_KEY));
  } catch (e) { state = null; }
  if (!state || !state.settings || !Array.isArray(state.events)) state = demoSeed();
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
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

  const state = { settings: { ...DEFAULT_SETTINGS }, events: [], signups: {} };
  let onChange = () => {};
  const eventWatchers = {}; // eventId -> unsubscribe

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
