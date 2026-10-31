const PRESETS = [10, 15, 20, 25, 30];
const COUNTDOWN_STEP = 5;
const MAX_COUNTDOWN = 60;
const MAX_BELLS = 10;
const DEFAULT_INSTRUCTION = 'Say your mantra';
const MAX_INSTRUCTION = 40;

const MIN_GAP = 1;
const MAX_GAP = 20;

// Five instruments used to open a sitting. Each rings with a handful of inharmonic partials
// [ratio to the base frequency, gain, decay in s to -60 dB, beat in Hz]. A partial is a pair of
// oscillators `beat` Hz apart, which gives the slow swell of a hand-made bowl. `click` is the
// level of the mallet noise at the start of the strike.
const icon = (paths) => `<svg viewBox="0 0 32 32" aria-hidden="true">${paths}</svg>`;
const SOUNDS = {
  large: {
    label: 'Large', freq: 165, click: .10,
    partials: [[1, 1, 14, .25], [2.72, .6, 9, .3], [5.15, .25, 4, .35], [8.3, .08, 2, .4]],
    icon: icon('<path d="M2 12h28c0 8-6 14-14 14S2 20 2 12z"/><path d="M11 29h10"/>'),
  },
  small: {
    label: 'Small', freq: 392, click: .12,
    partials: [[1, 1, 10, .3], [2.78, .5, 6, .35], [5.4, .2, 3, .4], [8.6, .07, 1.5, .4]],
    icon: icon('<path d="M8 15h16c0 6-3.5 10-8 10s-8-4-8-10z"/><path d="M12 28h8"/>'),
  },
  crystal: {
    label: 'Crystal', freq: 523, click: .03,
    partials: [[1, 1, 18, .2], [2, .12, 10, .2], [3, .05, 6, .2]],
    icon: icon('<ellipse cx="16" cy="11" rx="11" ry="3"/><path d="M5 11v11c0 3 5 5 11 5s11-2 11-5V11"/><path d="M27 2v5M24.5 4.5h5"/>'),
  },
  rin: {
    label: 'Rin', freq: 440, click: .20,
    partials: [[1, 1, 12, .25], [2.43, .5, 8, .3], [4.2, .3, 5, .35], [6.9, .12, 2.5, .4]],
    icon: icon('<path d="M6 10h20c0 6-4 10-10 10S6 16 6 10z"/><ellipse cx="16" cy="26" rx="12" ry="3"/><path d="M26 2l-6 6"/>'),
  },
  tingsha: {
    label: 'Tingsha', freq: 2000, click: .10,
    partials: [[1, 1, 14, .7], [2.32, .35, 8, .5], [3.9, .15, 4, .4], [5.6, .05, 2, .4]],
    icon: icon('<circle cx="9" cy="22" r="6.5"/><circle cx="23" cy="22" r="6.5"/><circle cx="9" cy="22" r="2"/><circle cx="23" cy="22" r="2"/><path d="M9 22C9 4 23 4 23 22"/>'),
  },
};
const DEFAULT_SOUND = 'large';

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
  muted: store.get('muted', false) === true,
  instruction: store.get('instruction', DEFAULT_INSTRUCTION),
  gap: store.get('gap', 5),
};
if (!PRESETS.includes(settings.minutes)) settings.minutes = 20;
if (!SOUNDS[settings.sound]) settings.sound = DEFAULT_SOUND;
settings.bells = Math.min(Math.max(Math.round(settings.bells) || 3, 1), MAX_BELLS);
settings.gap = Math.min(Math.max(Math.round(settings.gap) || 5, MIN_GAP), MAX_GAP);
settings.countdown = Math.min(Math.max(Math.round(settings.countdown) || 0, 0), MAX_COUNTDOWN);
if (typeof settings.instruction !== 'string') settings.instruction = DEFAULT_INSTRUCTION;

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
  const { freq, click: clickLevel, partials } = SOUNDS[sound];

  partials.forEach(([ratio, gain, decay, beat]) => {
    [-1, 1].forEach((side) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const pan = ctx.createStereoPanner();
      osc.frequency.value = freq * ratio + side * beat / 2;
      pan.pan.value = side * .4;
      env.gain.setValueAtTime(.0001, when);
      env.gain.exponentialRampToValueAtTime(gain / 2, when + .015);
      env.gain.exponentialRampToValueAtTime(gain / 2000, when + decay); // -60 dB at `decay`
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
  click.gain.setValueAtTime(clickLevel, when);
  click.gain.exponentialRampToValueAtTime(.0001, when + .05);
  noise.connect(filter).connect(click).connect(input);
  noise.start(when);
}

async function playBells(sound, count) {
  if (settings.muted) return true;
  if (!await unlockAudio()) return false;
  const start = ctx.currentTime + .05;
  for (let i = 0; i < count; i++) strike(sound, start + i * settings.gap);
  return true;
}

// --- setup UI ---
function choice(container, items, isSelected, onPick) {
  container.replaceChildren(...items.map(([value, label, top]) => {
    const b = document.createElement('button');
    if (top) {
      b.classList.add('tile');
      b.insertAdjacentHTML('afterbegin', top);
      const name = document.createElement('span');
      name.textContent = label;
      b.append(name);
    } else {
      b.textContent = label;
    }
    b.classList.toggle('selected', isSelected(value));
    b.addEventListener('click', () => { onPick(value); renderSetup(); });
    return b;
  }));
}

function renderSetup() {
  choice($('presets'), PRESETS.map((m) => [m, 'min', `<strong>${m}</strong>`]), (m) => m === settings.minutes, (m) => { settings.minutes = m; store.set('minutes', m); });
  choice($('sounds'), Object.entries(SOUNDS).map(([k, s]) => [k, s.label, s.icon]), (k) => k === settings.sound, (k) => { settings.sound = k; store.set('sound', k); });
  $('mute').textContent = settings.muted ? 'Off' : 'On';
  $('mute').classList.toggle('selected', !settings.muted);
  $('mute').setAttribute('aria-pressed', !settings.muted);
  $('sounds').parentElement.classList.toggle('muted', settings.muted);
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
$('mute').addEventListener('click', () => {
  settings.muted = !settings.muted;
  store.set('muted', settings.muted);
  $('audio-note').textContent = '';
  renderSetup();
});
async function preview(count) {
  if (settings.muted) { $('audio-note').textContent = 'Sound is off.'; return; }
  const ok = await playBells(settings.sound, count);
  $('audio-note').textContent = ok ? '' : 'Audio is blocked by the browser. Check the volume and the mute/silent switch.';
}
$('preview').addEventListener('click', () => preview(1));

// --- session ---
let timer = null;
let paused = false;
let togglePause = null;
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

function setPaused(value) {
  paused = value;
  $('pause').querySelector('span').textContent = value ? 'Resume' : 'Pause';
  $('session').classList.toggle('paused', value);
}

function show(running) {
  $('setup').hidden = running;
  $('session').hidden = !running;
}

function startSession() {
  $('done').hidden = true;
  $('ring').style.strokeDashoffset = 100;
  setPaused(false);
  if (!settings.muted) unlockAudio();
  holdScreen();
  show(true);

  // Deadlines are absolute timestamps, so the display stays correct after the app was in the background.
  let countdownEnd = Date.now() + settings.countdown * 1000;
  let sessionEnd = countdownEnd + settings.minutes * 60 * 1000;
  let startBellsPlayed = false;
  let pausedAt = 0;

  const update = () => {
    const now = Date.now();
    if (now < countdownEnd) {
      const left = Math.ceil((countdownEnd - now) / 1000);
      $('phase').textContent = 'Settle in';
      $('time').textContent = left;
    } else if (now < sessionEnd) {
      if (!startBellsPlayed) { startBellsPlayed = true; playBells(settings.sound, settings.bells); }
      $('phase').textContent = settings.instruction.trim() || DEFAULT_INSTRUCTION;
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

  // Pausing suspends the audio clock too, so bells that are still scheduled wait with the timer.
  togglePause = () => {
    if (!paused) {
      pausedAt = Date.now();
      setPaused(true);
      $('phase').textContent = 'Paused';
      ctx?.suspend().catch(() => {});
    } else {
      const away = Date.now() - pausedAt;
      countdownEnd += away;
      sessionEnd += away;
      setPaused(false);
      ctx?.resume().catch(() => {});
      update();
    }
  };

  timer = setInterval(() => { if (!paused) update(); }, 250);
  update();
}

function stopSession() {
  clearInterval(timer);
  timer = null;
  togglePause = null;
  if (paused) {
    // Drop the suspended context so its pending bells don't ring at the next playback.
    ctx?.close().catch(() => {});
    ctx = graph = undefined;
    setPaused(false);
  }
  releaseScreen();
  show(false);
}

$('start').addEventListener('click', startSession);
$('pause').addEventListener('click', () => togglePause?.());
$('cancel').addEventListener('click', stopSession);

$('instruction').maxLength = MAX_INSTRUCTION;
$('instruction').placeholder = DEFAULT_INSTRUCTION;
$('instruction').value = settings.instruction;
$('instruction').addEventListener('input', (e) => {
  settings.instruction = e.target.value;
  store.set('instruction', settings.instruction);
});

renderSetup();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
