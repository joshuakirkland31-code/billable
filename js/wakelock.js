// Keep the screen awake while a session runs (locking the phone counts as leaving the app).
let wakeLock = null;
let wantWake = false;
let pending = null;

export async function acquireWakeLock() {
  wantWake = true;
  if (wakeLock) return true;
  if (pending) return pending;
  if (!('wakeLock' in navigator)) return false;
  pending = (async () => {
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!wantWake) { lock.release().catch(() => {}); return false; } // released while we waited
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      return true;
    } catch { return false; }
    finally { pending = null; }
  })();
  return pending;
}

export function releaseWakeLock() {
  wantWake = false;
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
