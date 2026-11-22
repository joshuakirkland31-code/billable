// Synthesized sounds (no audio files). Respect the sound setting.
let ctx = null;
let enabled = () => true;
export function setSoundEnabled(fn) { enabled = fn; }

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.12) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

export function unlockAudio() { ac(); }
export function playCash() { if (!enabled()) return; tone(1318, 0, .08, 'square', .06); tone(1760, .07, .25, 'square', .06); tone(2637, .12, .3, 'sine', .05); }
export function playPromo() { if (!enabled()) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .12, .35, 'triangle', .1)); }
export function playFail() { if (!enabled()) return; tone(220, 0, .3, 'sawtooth', .06); tone(165, .25, .5, 'sawtooth', .06); }
export function playTick() { if (!enabled()) return; tone(880, 0, .05, 'sine', .04); }
