# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A meditation timer PWA: plain static HTML/CSS/vanilla JS, no build step, no dependencies, no package manager, no tests or linter. Serve the directory with any static server over HTTP (the service worker needs `localhost` or HTTPS), e.g. `python3 -m http.server`.

## Architecture

- `app.js` is the whole app, one script with no modules. Sections: settings/persistence, Web Audio synthesis, setup UI, session loop.
- **Settings** live in a `settings` object, persisted per key in `localStorage` via the `store` helper and clamped/validated on load. When adding a setting, follow the existing pattern: default, clamp on load, `renderSetup()` display, change handler that calls `store.set`.
- **Sound** is synthesized (no audio files): `strike()` builds one strike from inharmonic partials (each a detuned oscillator pair for slow beating), plus a noise "tock", routed through a shared graph (`audioGraph()`: dry + convolution reverb + compressor). `SOUNDS` defines the five instruments (large/small Tibetan bowl, crystal bowl, rin, tingsha): base frequency, partials, click level and the button's SVG icon. The `AudioContext` must be unlocked from a user gesture (`unlockAudio()`), which `startSession()` does.
- **Session** runs on `setInterval` but uses absolute `Date.now()` deadlines (countdown end, session end), so it stays correct after backgrounding. Bells are scheduled on the audio clock via `ctx.currentTime`. A screen wake lock is held while a session runs and re-acquired on `visibilitychange`.
- The progress ring is an SVG circle driven via `strokeDashoffset` from 100 to 0, which assumes `pathLength="100"` on the circle in `index.html`.
- `quotes.js` holds the `QUOTES` array (`[author or reference, text]` pairs, loaded before `app.js`); `showQuote()` picks a random one for the completion screen. Only add quotes traced to a real source.
- `sw.js` is a cache-first service worker with a hardcoded `ASSETS` list. **Bump `CACHE` (`meditate-vN`) on every deploy, and add any new asset file to `ASSETS`**, or clients keep serving stale files.
- Icons `icon-{180,192,512}.png` are crops of `mustard_tree.jpg` (the logo), made with ImageMagick: `magick mustard_tree.jpg -crop 620x620+395+15 +repage -resize SxS icon-S.png`. `make_icons.py` is the old placeholder generator (gold dot) and would overwrite them, so don't run it.
