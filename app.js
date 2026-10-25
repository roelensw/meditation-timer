const PRESETS = [10, 15, 20, 25, 30];
const COUNTDOWN_STEP = 5;
const MAX_COUNTDOWN = 60;
const MAX_BELLS = 10;

// A series of singing bowls, from deep to bright. Real bowls ring with a handful of
// inharmonic partials; each partial is a slightly detuned pair of oscillators, which
// produces the slow beating "shimmer" of a hand-made bowl.
const BOWL_PARTIALS = [
  { ratio: 1,    gain: 1,   decay: 12 },
  { ratio: 2.71, gain: .55, decay: 7 },
  { ratio: 5.12, gain: .25, decay: 3.5 },
  { ratio: 8.2,  gain: .1,  decay: 1.8 },
];
const MIN_GAP = 1;
const MAX_GAP = 20;
const SOUNDS = {
  deep:   { label: 'Deep',   freq: 196 },
  low:    { label: 'Low',    freq: 262 },
  medium: { label: 'Medium', freq: 330 },
  high:   { label: 'High',   freq: 440 },
  bright: { label: 'Bright', freq: 587 },
};
const DEFAULT_SOUND = 'medium';

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

const settings = {
  minutes: store.get('minutes', 20),
  sound: store.get('sound', DEFAULT_SOUND),
  bells: store.get('bells', 3),
  countdown: store.get('countdown', 10),
  gap: store.get('gap', 5),
};
if (!PRESETS.includes(settings.minutes)) settings.minutes = 20;
if (!SOUNDS[settings.sound]) settings.sound = DEFAULT_SOUND;
settings.bells = Math.min(Math.max(Math.round(settings.bells) || 3, 1), MAX_BELLS);
settings.gap = Math.min(Math.max(Math.round(settings.gap) || 5, MIN_GAP), MAX_GAP);
settings.countdown = Math.min(Math.max(Math.round(settings.countdown) || 0, 0), MAX_COUNTDOWN);

// --- audio ---
let ctx;
async function unlockAudio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  return ctx.state === 'running';
}

let graph;
function audioGraph() {
  if (graph) return graph;
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);

  // Synthetic room reverb: exponentially decaying stereo noise.
  const length = Math.floor(ctx.sampleRate * 3);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = .3;
  const dry = ctx.createGain();
  dry.gain.value = .8;

  const input = ctx.createGain();
  input.gain.value = .45;
  input.connect(dry).connect(compressor);
  input.connect(reverb).connect(wet).connect(compressor);
  graph = { input };
  return graph;
}

function strike(sound, when) {
  const { input } = audioGraph();
  const base = SOUNDS[sound].freq;

  BOWL_PARTIALS.forEach(({ ratio, gain, decay }, i) => {
    const beat = .5 + i * .45; // Hz difference between the two oscillators of a partial
    [-1, 1].forEach((side) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const pan = ctx.createStereoPanner();
      osc.frequency.value = base * ratio + side * beat / 2;
      pan.pan.value = side * .4;
      env.gain.setValueAtTime(.0001, when);
      env.gain.exponentialRampToValueAtTime(gain / 2, when + .01);
      env.gain.exponentialRampToValueAtTime(.0001, when + decay);
      osc.connect(env).connect(pan).connect(input);
      osc.start(when);
      osc.stop(when + decay + .1);
    });
  });

  // Soft mallet "tock" at the start of the strike.
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .05), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  const click = ctx.createGain();
  click.gain.setValueAtTime(.12, when);
  click.gain.exponentialRampToValueAtTime(.0001, when + .05);
  noise.connect(filter).connect(click).connect(input);
  noise.start(when);
}

async function playBells(sound, count) {
  if (!await unlockAudio()) return false;
  const start = ctx.currentTime + .05;
  for (let i = 0; i < count; i++) strike(sound, start + i * settings.gap);
  return true;
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
  $('gap-count').textContent = `${settings.gap} s`;
  $('countdown-count').textContent = `${settings.countdown} s`;
}

function changeBells(delta) {
  settings.bells = Math.min(Math.max(settings.bells + delta, 1), MAX_BELLS);
  store.set('bells', settings.bells);
  renderSetup();
}
function changeGap(delta) {
  settings.gap = Math.min(Math.max(settings.gap + delta, MIN_GAP), MAX_GAP);
  store.set('gap', settings.gap);
  renderSetup();
}
$('gap-minus').addEventListener('click', () => changeGap(-1));
$('gap-plus').addEventListener('click', () => changeGap(1));

function changeCountdown(delta) {
  settings.countdown = Math.min(Math.max(settings.countdown + delta, 0), MAX_COUNTDOWN);
  store.set('countdown', settings.countdown);
  renderSetup();
}
$('countdown-minus').addEventListener('click', () => changeCountdown(-COUNTDOWN_STEP));
$('countdown-plus').addEventListener('click', () => changeCountdown(COUNTDOWN_STEP));
$('bells-minus').addEventListener('click', () => changeBells(-1));
$('bells-plus').addEventListener('click', () => changeBells(1));
async function preview(count) {
  const ok = await playBells(settings.sound, count);
  $('audio-note').textContent = ok ? '' : 'Audio is blocked by the browser. Check the volume and the mute/silent switch.';
}
$('preview').addEventListener('click', () => preview(1));

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
  $('done').hidden = true;
  $('ring').style.strokeDashoffset = 100;
  unlockAudio();
  holdScreen();
  show(true);

  // Deadlines are absolute timestamps, so the display stays correct after the app was in the background.
  const countdownEnd = Date.now() + settings.countdown * 1000;
  const sessionEnd = countdownEnd + settings.minutes * 60 * 1000;
  let startBellsPlayed = false;

  const update = () => {
    const now = Date.now();
    if (now < countdownEnd) {
      const left = Math.ceil((countdownEnd - now) / 1000);
      $('phase').textContent = 'Settle in';
      $('time').textContent = left;
    } else if (now < sessionEnd) {
      if (!startBellsPlayed) { startBellsPlayed = true; playBells(settings.sound, settings.bells); }
      $('phase').textContent = 'Breathe';
      $('time').textContent = formatTime(Math.ceil((sessionEnd - now) / 1000));
      $('ring').style.strokeDashoffset = 100 - 100 * (now - countdownEnd) / (sessionEnd - countdownEnd);
    } else {
      finish();
    }
  };

  const finish = () => {
    stopSession();
    $('done').textContent = `Session complete · ${settings.minutes} min`;
    $('done').hidden = false;
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
