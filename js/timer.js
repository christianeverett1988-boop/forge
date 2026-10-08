// Shared timer helpers: beeps (Web Audio), screen wake lock, and the floating rest timer.
// Timers run from timestamps, not tick counts, so they stay accurate if the phone stutters.

let ctx = null;
/** Call from a tap (iOS only allows audio after a user gesture). */
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep({ freq = 880, ms = 160, gain = 0.25 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g).connect(ctx.destination);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}

export function buzz(pattern = [200, 100, 200]) {
  if (navigator.vibrate) navigator.vibrate(pattern); // ignored on iPhone; the native app (Phase 3) adds real haptics
}

let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}
// iOS drops the wake lock when the app goes to the background; take it back when we return.
let wantAwake = false;
export function setWantAwake(v) {
  wantAwake = v;
  keepAwake(v);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantAwake) keepAwake(true);
});

export const fmtClock = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- rest timer ----------
let rest = null; // { end, total, label }
let tick = null;
const listeners = new Set();
export const onRestChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function startRest(seconds, label = 'Rest') {
  rest = { end: Date.now() + seconds * 1000, total: seconds, label, warned: false };
  run();
}
export function adjustRest(delta) {
  if (!rest) return;
  rest.end += delta * 1000;
  rest.total = Math.max(5, rest.total + delta);
  run();
}
export function stopRest() {
  rest = null;
  run();
}
export const restRemaining = () => (rest ? (rest.end - Date.now()) / 1000 : 0);

function run() {
  clearInterval(tick);
  render();
  if (!rest) return;
  tick = setInterval(() => {
    const left = restRemaining();
    if (left <= 3.2 && !rest.warned) {
      rest.warned = true;
      beep({ freq: 660, ms: 120 });
    }
    if (left <= 0) {
      beep({ freq: 990, ms: 300 });
      buzz();
      rest = null;
      clearInterval(tick);
    }
    render();
  }, 250);
}

function render() {
  let bar = document.getElementById('restbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'restbar';
    bar.className = 'restbar';
    bar.setAttribute('role', 'timer');
    bar.innerHTML = `
      <div class="restfill"></div>
      <span class="restlabel"></span>
      <b class="restclock"></b>
      <div class="row gap">
        <button class="icon-btn" data-rest="-15" aria-label="15 seconds less">−15</button>
        <button class="icon-btn" data-rest="15" aria-label="15 seconds more">+15</button>
        <button class="icon-btn" data-rest="skip" aria-label="Skip rest">Skip</button>
      </div>`;
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rest]');
      if (!b) return;
      if (b.dataset.rest === 'skip') stopRest();
      else adjustRest(Number(b.dataset.rest));
    });
    document.body.appendChild(bar);
  }
  document.body.classList.toggle('resting', !!rest);
  if (!rest) {
    bar.classList.remove('show');
  } else {
    const left = restRemaining();
    bar.classList.add('show');
    bar.querySelector('.restlabel').textContent = rest.label;
    bar.querySelector('.restclock').textContent = fmtClock(left);
    bar.querySelector('.restfill').style.transform = `scaleX(${Math.max(0, Math.min(1, left / rest.total))})`;
  }
  listeners.forEach((fn) => fn(rest));
}
