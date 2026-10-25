const PRESETS = [10, 15, 20, 25, 30];
const COUNTDOWN_SECONDS = 10;
const MAX_BELLS = 10;

// Each sound is a set of partials (frequency ratios + gains) with an exponential decay.
const SOUNDS = {
  bowl:   { label: 'Singing bowl', base: 220, ratios: [1, 2.76, 5.4, 8.9],               gains: [1, .5, .25, .1],        decay: 6, gap: 6 },
  temple: { label: 'Temple bell',  base: 400, ratios: [.56, .92, 1.19, 1.71, 2, 2.74],   gains: [.6, 1, .5, .6, .4, .3], decay: 5, gap: 5 },
  chime:  { label: 'Chime',        base: 1320, ratios: [1, 2, 3.01],                     gains: [1, .3, .15],            decay: 3, gap: 3.5 },
  gong:   { label: 'Gong',         base: 110, ratios: [1, 1.5, 2.02, 2.76, 4.1],         gains: [1, .6, .5, .3, .15],    decay: 8, gap: 7, attack: .02 },
};

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

const settings = {
  minutes: store.get('minutes', 20),
  sound: store.get('sound', 'bowl'),
  bells: store.get('bells', 3),
};
if (!PRESETS.includes(settings.minutes)) settings.minutes = 20;
if (!SOUNDS[settings.sound]) settings.sound = 'bowl';
settings.bells = Math.min(Math.max(Math.round(settings.bells) || 3, 1), MAX_BELLS);

// --- audio ---
let ctx;
function unlockAudio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') ctx.resume();
}

function strike(sound, when) {
  const { base, ratios, gains, decay, attack = .005 } = SOUNDS[sound];
  const master = ctx.createGain();
  master.gain.value = .35;
  master.connect(ctx.destination);
  ratios.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = base * ratio;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gains[i] / ratios.length * 2, when + attack);
    env.gain.exponentialRampToValueAtTime(.0001, when + decay / (1 + i * .35));
    osc.connect(env).connect(master);
    osc.start(when);
    osc.stop(when + decay + .1);
  });
}

function playBells(sound, count) {
  unlockAudio();
  const start = ctx.currentTime + .05;
  for (let i = 0; i < count; i++) strike(sound, start + i * SOUNDS[sound].gap);
}

function tick(final) {
  const when = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = final ? 660 : 880;
  env.gain.setValueAtTime(.15, when);
  env.gain.exponentialRampToValueAtTime(.0001, when + .12);
  osc.connect(env).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + .15);
}

// --- setup UI ---
function choice(container, items, isSelected, onPick) {
  container.replaceChildren(...items.map(([value, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('selected', isSelected(value));
    b.addEventListener('click', () => { onPick(value); renderSetup(); });
    return b;
  }));
}

function renderSetup() {
  choice($('presets'), PRESETS.map((m) => [m, `${m} min`]), (m) => m === settings.minutes, (m) => { settings.minutes = m; store.set('minutes', m); });
  choice($('sounds'), Object.entries(SOUNDS).map(([k, s]) => [k, s.label]), (k) => k === settings.sound, (k) => { settings.sound = k; store.set('sound', k); });
  $('bells-count').textContent = settings.bells;
}

function changeBells(delta) {
  settings.bells = Math.min(Math.max(settings.bells + delta, 1), MAX_BELLS);
  store.set('bells', settings.bells);
  renderSetup();
}
$('bells-minus').addEventListener('click', () => changeBells(-1));
$('bells-plus').addEventListener('click', () => changeBells(1));
$('preview').addEventListener('click', () => playBells(settings.sound, 1));

// --- session ---
let timer = null;
let wakeLock = null;

async function holdScreen() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function releaseScreen() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer) holdScreen();
});

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function show(running) {
  $('setup').hidden = running;
  $('session').hidden = !running;
}

function startSession() {
  unlockAudio();
  holdScreen();
  show(true);

  // Deadlines are absolute timestamps, so the display stays correct after the app was in the background.
  const countdownEnd = Date.now() + COUNTDOWN_SECONDS * 1000;
  const sessionEnd = countdownEnd + settings.minutes * 60 * 1000;
  let lastTick = null;

  const update = () => {
    const now = Date.now();
    if (now < countdownEnd) {
      const left = Math.ceil((countdownEnd - now) / 1000);
      $('phase').textContent = 'Get ready';
      $('time').textContent = left;
      if (left !== lastTick) { lastTick = left; tick(left === 1); }
    } else if (now < sessionEnd) {
      $('phase').textContent = 'Meditating';
      $('time').textContent = formatTime(Math.ceil((sessionEnd - now) / 1000));
    } else {
      finish();
    }
  };

  const finish = () => {
    stopSession();
    playBells(settings.sound, settings.bells);
  };

  timer = setInterval(update, 250);
  update();
}

function stopSession() {
  clearInterval(timer);
  timer = null;
  releaseScreen();
  show(false);
}

$('start').addEventListener('click', startSession);
$('cancel').addEventListener('click', stopSession);

renderSetup();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
