// App state: shape, defaults, migration and IndexedDB persistence.
import { COURSES } from './courses-data.js';

export const SCHEMA = 1;
const clone = o => JSON.parse(JSON.stringify(o));

export function defaultCareer() {
  return {
    xp: 0, lifetime: 0, cash: 0, prestige: 0,
    why: ['Make money', 'Land the internship', "Grades I'm proud of"],
    streak: { count: 0, best: 0, lastDay: null, pto: 0, brokenFrom: 0 },
    owned: {}, equipped: {}, achievements: {},
    contracts: { day: null, ids: [], done: [], allPaid: false, behind: null },
    contractsCompleted: 0,
    lastReviewWeek: null, lastBackup: null, filedMarks: {}, beatMarks: {},
    tipsShown: {},
  };
}

export function defaultSettings() {
  return { sound: true, capMB: 300 };
}

export function defaultState() {
  return {
    schema: SCHEMA,
    career: defaultCareer(),
    settings: defaultSettings(),
    term: { id: 'F26', courses: clone(COURSES) },
    sessions: [],
    active: null,
  };
}

// Fill any missing keys from defaults (forward-compatible), recursively for plain objects.
function fill(target, defaults) {
  for (const k of Object.keys(defaults)) {
    const dv = defaults[k];
    if (target[k] === undefined) target[k] = clone(dv);
    else if (dv && typeof dv === 'object' && !Array.isArray(dv) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k]))
      fill(target[k], dv);
  }
  return target;
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.schema !== 'number' || raw.schema < 1 || raw.schema > SCHEMA)
    throw new Error('bad-backup');
  const s = clone(raw);
  // Future: if (s.schema === 1) { ...; s.schema = 2; }
  const d = defaultState();
  fill(s, { ...d, term: d.term });
  if (!Array.isArray(s.sessions)) s.sessions = [];
  if (!s.term || !Array.isArray(s.term.courses)) s.term = d.term;
  if (s.active === undefined) s.active = null;
  return s;
}

/** Stored record → state. Only a truly empty record becomes a fresh state; anything unreadable throws. */
export function interpretStored(raw) {
  if (raw === undefined || raw === null) return defaultState();
  try { return migrate(raw); } catch { throw new Error('load-failed'); }
}

export function withTimeout(promise, ms) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })])
    .finally(() => clearTimeout(t));
}

// ---- IndexedDB ----
const DB = 'billable', STORE = 'kv', KEY = 'state';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => {
        const d = r.result;
        d.onclose = () => { dbp = null; }; // iOS can drop the connection; reopen next time
        res(d);
      };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
    });
    dbp.catch(() => { dbp = null; }); // never cache a failed open
  }
  return dbp;
}

/** Throws Error('load-failed') if the saved data exists but can't be read. Never returns defaults over real data. */
export async function loadState() {
  let raw;
  try {
    const d = await withTimeout(db(), 8000);
    raw = await withTimeout(new Promise((res, rej) => {
      const q = d.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    }), 8000);
  } catch (e) {
    console.error('loadState failed', e);
    dbp = null;
    throw new Error('load-failed');
  }
  return interpretStored(raw);
}

export async function saveState(s) {
  const d = await withTimeout(db(), 8000);
  await withTimeout(new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(s, KEY);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  }), 8000).catch(e => { dbp = null; throw e; });
}

export async function requestPersist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
  catch { return false; }
}
