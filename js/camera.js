// Front camera, frame grabbing and screen wake lock.
let stream = null;
let wakeLock = null;
let wantWake = false;

export async function startCamera(videoEl) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
    });
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    return true;
  } catch (e) {
    console.warn('camera unavailable', e);
    return false;
  }
}

export function cameraLive() {
  return !!stream && stream.getVideoTracks().some(t => t.readyState === 'live');
}

export function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
}

/** Downscaled JPEG of the current video frame with a caption bottom-left. */
export function grabFrame(videoEl, maxEdge = 360, quality = 0.6, caption = '') {
  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  if (!vw || !vh) return Promise.resolve(null);
  const r = Math.min(1, maxEdge / Math.max(vw, vh));
  const w = Math.round(vw * r), h = Math.round(vh * r);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.translate(w, 0); ctx.scale(-1, 1); // mirror like the preview
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (caption) {
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    const tw = ctx.measureText(caption).width;
    ctx.fillStyle = 'rgba(11,15,23,.7)'; ctx.fillRect(4, h - 20, tw + 10, 16);
    ctx.fillStyle = '#f5c451'; ctx.fillText(caption, 9, h - 8);
  }
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', quality));
}

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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake && !wakeLock) acquireWakeLock();
});
