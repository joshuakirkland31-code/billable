// Time-lapse: periodic frames in IndexedDB, retention/cap purge, playback, video export.
import { grabFrame } from './camera.js';

export const FRAME_INTERVAL_MS = 6000;
export const RETENTION_MS = 7 * 86400000;
const DBN = 'billable-media';
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('frames');
      r.result.createObjectStore('meta', { keyPath: 'sessionId' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  }));
}

const fkey = (id, i) => `${id}#${String(i).padStart(6, '0')}`;
const range = id => IDBKeyRange.bound(id + '#', id + '#￿');

export const saveFrame = (id, i, blob) => tx('frames', 'readwrite', s => s.put(blob, fkey(id, i)));
export const loadFrames = id => tx('frames', 'readonly', s => s.getAll(range(id)));
export const saveMeta = m => tx('meta', 'readwrite', s => s.put(m));
export const listMeta = () => tx('meta', 'readonly', s => s.getAll());
export const getMeta = id => tx('meta', 'readonly', s => s.get(id));

export async function deleteTimelapse(id) {
  await tx('frames', 'readwrite', s => s.delete(range(id)));
  await tx('meta', 'readwrite', s => s.delete(id));
}

export async function setStarred(id, starred) {
  const m = await getMeta(id);
  if (m) await saveMeta({ ...m, starred });
}

/** Pure: which unstarred time-lapses to delete (expired first, then oldest until under cap). */
export function planPurge(metas, now, capBytes) {
  const del = new Set();
  for (const m of metas) if (!m.starred && now - m.createdAt > RETENTION_MS) del.add(m.sessionId);
  let total = metas.filter(m => !del.has(m.sessionId)).reduce((a, m) => a + m.bytes, 0);
  const oldest = metas.filter(m => !m.starred && !del.has(m.sessionId)).sort((a, b) => a.createdAt - b.createdAt);
  for (const m of oldest) {
    if (total <= capBytes) break;
    del.add(m.sessionId); total -= m.bytes;
  }
  return metas.filter(m => del.has(m.sessionId)).map(m => m.sessionId);
}

export function wouldExceedCap(metas, capBytes) {
  return metas.filter(m => m.starred).reduce((a, m) => a + m.bytes, 0) > capBytes;
}

/** Pure: session ids that have frames but no meta (and aren't the live session). */
export function orphanIds(frameKeys, metaIds, keepId = null) {
  const have = new Set(metaIds);
  return [...new Set(frameKeys.map(k => String(k).split('#')[0]))].filter(id => !have.has(id) && id !== keepId);
}

export async function sweepOrphans(keepId = null) {
  try {
    const keys = await tx('frames', 'readonly', s => s.getAllKeys());
    const metas = await listMeta();
    for (const id of orphanIds(keys, metas.map(m => m.sessionId), keepId)) await deleteTimelapse(id);
  } catch (e) { console.warn('sweep failed', e); }
}

export async function purge(now, capBytes) {
  try {
    const ids = planPurge(await listMeta(), now, capBytes);
    for (const id of ids) await deleteTimelapse(id);
    return ids;
  } catch (e) { console.warn('purge failed', e); return []; }
}

export async function usage() {
  try {
    const m = await listMeta();
    return { bytes: m.reduce((a, x) => a + x.bytes, 0), count: m.length };
  } catch { return { bytes: 0, count: 0 }; }
}

/** Starts capturing frames every FRAME_INTERVAL_MS. overlay() returns the caption text. */
export function startRecorder(sessionId, videoEl, overlay, { onError } = {}) {
  let idx = 0, bytes = 0, failed = false, busy = false;
  const capture = async () => {
    if (failed || busy || !videoEl.videoWidth) return;
    busy = true;
    try {
      const blob = await grabFrame(videoEl, 360, 0.6, overlay());
      if (blob) { await saveFrame(sessionId, idx, blob); idx++; bytes += blob.size; }
    } catch (e) {
      failed = true;
      if (onError) onError(e);
    } finally { busy = false; }
  };
  const first = setTimeout(capture, 1500);
  const timer = setInterval(capture, FRAME_INTERVAL_MS);
  return {
    get failed() { return failed; },
    capture,
    async stop() {
      clearTimeout(first); clearInterval(timer);
      if (idx > 0) {
        try { await saveMeta({ sessionId, createdAt: Date.now(), bytes, frames: idx, starred: false }); }
        catch (e) { failed = true; }
      }
      return { frames: idx, bytes };
    },
  };
}

async function decode(blob) {
  if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch {} }
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(blob);
  });
}

function drawFit(ctx, img, w, h) {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r, dh = img.height * r;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Player over a canvas. Returns {play, pause, seek, playing, length, destroy}. */
export function playTimelapse(canvas, frames, { fps = 30, onFrame } = {}) {
  const ctx = canvas.getContext('2d');
  let i = 0, timer = null, alive = true;
  const show = async (k) => {
    if (!frames.length) return;
    i = Math.max(0, Math.min(frames.length - 1, k));
    const img = await decode(frames[i]);
    if (!alive) return;
    if (canvas.width !== img.width) { canvas.width = img.width; canvas.height = img.height; }
    drawFit(ctx, img, canvas.width, canvas.height);
    if (onFrame) onFrame(i);
  };
  const step = async () => {
    if (!alive) return;
    await show(i);
    if (i >= frames.length - 1) { timer = null; return; }
    i++;
    timer = setTimeout(step, 1000 / fps);
  };
  show(0);
  return {
    play() { if (!timer) { if (i >= frames.length - 1) i = 0; step(); } },
    pause() { clearTimeout(timer); timer = null; },
    seek(k) { this.pause(); show(k); },
    get playing() { return !!timer; },
    length: frames.length,
    destroy() { alive = false; clearTimeout(timer); },
  };
}

export function canExportVideo() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

/** Renders frames to a video File (mp4 if supported). Returns null if unsupported. */
export async function exportVideo(sessionId, { fps = 30, label = 'timelapse' } = {}) {
  if (!canExportVideo()) return null;
  const frames = await loadFrames(sessionId);
  if (!frames.length) return null;
  const first = await decode(frames[0]);
  const canvas = document.createElement('canvas');
  canvas.width = first.width - (first.width % 2); canvas.height = first.height - (first.height % 2);
  const ctx = canvas.getContext('2d');
  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) return null;
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => (rec.onstop = r));
  rec.start(250);
  for (const f of frames) {
    drawFit(ctx, await decode(f), canvas.width, canvas.height);
    await new Promise(r => setTimeout(r, 1000 / fps));
  }
  await new Promise(r => setTimeout(r, 300));
  rec.stop();
  await done;
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  return new File(chunks, `${label}.${ext}`, { type: mime.split(';')[0] });
}

export async function shareVideo(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Study time-lapse' });
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  return false;
}
