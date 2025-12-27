// Pixelated sprite guessing game
// Reuses shared helpers from game.js (names preload, suggestions, HUD, stats)

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="pixelate"]')) return;

  // Initialize language and UI
  setLang(getLang());
  translatePage && translatePage();

  // Guessed list for this round
  const GUESSED = new Set();
  function renderGuessed() {
    const box = document.getElementById('guessed-list');
    if (!box) return;
    box.innerHTML = '';
    for (const nn of GUESSED) {
      const chip = document.createElement('span');
      chip.className = 'guessed-chip';
      const names = getCachedNames(getLang(), getGen()) || [];
      const disp = names.find(n => normalizeName(n) === nn) || nn;
      chip.textContent = disp;
      box.appendChild(chip);
    }
  }
  window.getExcludeNames = () => GUESSED;
  window.resetGuessed = () => { GUESSED.clear(); renderGuessed(); };
  window.noteGuessed = (name) => {
    const nn = normalizeName(name);
    if (!GUESSED.has(nn)) { GUESSED.add(nn); renderGuessed(); }
  };

  // Stats and HUD
  loadStats();
  updateHUD();

  // Preload names for current language
  try { await preloadNames(getLang()); } catch (_) {}

  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
      translatePage && translatePage();
      hideSuggestions();
      try { await preloadNames(getLang()); } catch (_) {}
      renderGuessed();
    });
  }

  const genSel = document.getElementById('gen-select');
  if (genSel) {
    setGenSelectValue(genSel, getGen());
    genSel.addEventListener('change', async () => {
      const csv = readGenSelect(genSel);
      setGen(csv);
      hideSuggestions();
      try { await preloadNames(getLang()); } catch (_) {}
      window.resetGuessed && window.resetGuessed();
      newRoundPixelate();
    });
  }

  // Pixelation control
  const PIXEL_STEPS = [64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1]; // block sizes in CSS pixels
  function getCurrentBlockSize() {
    const wrong = state.attemptsWrong || 0;
    const idx = Math.min(wrong, PIXEL_STEPS.length - 1);
    return PIXEL_STEPS[idx];
  }

  let imageObj = null;

  function drawPixelated() {
    const canvas = document.getElementById('pixel-canvas');
    if (!canvas || !imageObj) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const frame = canvas.parentElement; // .sprite-frame
    const width = frame.clientWidth;
    const height = frame.clientWidth; // square

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Fit image into square while preserving aspect ratio
    const iw = imageObj.width;
    const ih = imageObj.height;
    const scale = Math.min(canvas.width / iw, canvas.height / ih);
    const drawW = Math.floor(iw * scale);
    const drawH = Math.floor(ih * scale);
    const dx = Math.floor((canvas.width - drawW) / 2);
    const dy = Math.floor((canvas.height - drawH) / 2);

    // Compute coarse resolution
    const block = getCurrentBlockSize();
    const coarseW = Math.max(1, Math.floor(drawW / block));
    const coarseH = Math.max(1, Math.floor(drawH / block));

    // Draw to an offscreen canvas at coarse resolution, then scale up
    const off = document.createElement('canvas');
    off.width = coarseW;
    off.height = coarseH;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;

    // Draw scaled down image onto offscreen
    octx.drawImage(imageObj, 0, 0, iw, ih, 0, 0, coarseW, coarseH);

    // Clear main canvas and fill background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optional: background grid already present via frame background.

    // Draw pixelated back up to destination rect
    ctx.drawImage(off, 0, 0, coarseW, coarseH, dx, dy, drawW, drawH);
  }

  function clearCanvas() {
    const canvas = document.getElementById('pixel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function newRoundPixelate() {
    if (state.roundActive && !state.roundSolved) {
      if (state.streak !== 0) {
        state.streak = 0;
        state.score = 0;
        saveStats();
        updateHUD();
      }
    }
    state.roundActive = true;
    state.roundSolved = false;
    state.attemptsWrong = 0;
    try { resetHints(); } catch(_) {}

    try {
      const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
      if (guessBtn) { guessBtn.disabled = false; guessBtn.setAttribute('aria-disabled','false'); }
    } catch(_) {}

    if (typeof window.resetGuessed === 'function') { try { window.resetGuessed(); } catch(_){} }

    const frame = document.querySelector('.sprite-frame');
    frame?.classList.add('loading');

    const res = await fetch(`/api/pixelate/random?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name;
    // Provide metadata for shared hints
    state.meta = Object.assign({}, state.meta, {
      sprite: data.sprite,
      color: data.color,
      generation: data.generation,
    });

    imageObj = new Image();
    imageObj.crossOrigin = 'anonymous';
    imageObj.onload = () => {
      drawPixelated();
      setTimeout(() => frame?.classList.remove('loading'), 200);
    };
    imageObj.onerror = () => {
      clearCanvas();
      const fbEl = document.getElementById('feedback');
      fbEl.textContent = 'Failed to load image';
      fbEl.className = 'feedback prominent incorrect';
      frame?.classList.remove('loading');
    };
    imageObj.src = data.sprite;

    const fbEl = document.getElementById('feedback');
    fbEl.textContent = '';
    fbEl.className = 'feedback';
    const input = document.getElementById('guess-input');
    input.value = '';
    hideSuggestions();
  }

  async function doCheck(guess) {
    try {
      const res = await fetch('/api/check-guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: state.token, guess, lang: getLang() })
      });
      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }
      if (!res.ok) {
        return { error: data && data.error ? data.error : 'Request failed' };
      }
      return data;
    } catch (e) {
      return { error: 'Network error' };
    }
  }

  // Start first round
  newRoundPixelate();

  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e) => { debouncedSuggest(e.target.value.trim()); });
  inputEl.addEventListener('keydown', handleKeyNav);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

  function refreshAfterWrongGuess() {
    // Increase detail by decreasing block size and redraw
    drawPixelated();
    try { maybeRevealHints(); } catch(_) {}
  }

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = document.getElementById('guess-input').value.trim();
    if (!guess) return;
    const fb = document.getElementById('feedback');
    if (!state.token) {
      fb.textContent = 'Loading… please try again in a moment.';
      fb.className = 'feedback prominent';
      return;
    }
    fb.textContent = '';
    fb.className = 'feedback';

    const data = await doCheck(guess);
    if (data && data.error) {
      fb.textContent = data.error || 'Error';
      fb.className = 'feedback prominent incorrect';
      return;
    }

    if (data.correct) {
      state.roundSolved = true;
      state.streak = (state.streak || 0) + 1;
      const add = Math.max(1, 10 - (state.attemptsWrong || 0));
      state.score = (state.score || 0) + add;
      saveStats();
      updateHUD();
      fb.textContent = `Correct! It was ${data.name}.`;
      fb.className = 'feedback prominent correct';
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
      // Show full detail (no pixelation)
      state.attemptsWrong = PIXEL_STEPS.length - 1;
      drawPixelated();
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // End streak upon wrong guess
      if (state.streak !== 0) {
        state.streak = 0;
        saveStats();
        updateHUD();
      }
      window.noteGuessed && window.noteGuessed(guess);
      fb.textContent = `Nope — try again.`;
      fb.className = 'feedback prominent incorrect';
      refreshAfterWrongGuess();
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    if (!state.token) return;
    // Max detail
    state.attemptsWrong = PIXEL_STEPS.length - 1;
    drawPixelated();
    const fb = document.getElementById('feedback');
    fb.textContent = `Revealed: ${state.answer || ''}`;
    fb.className = 'feedback prominent reveal';
    state.roundSolved = true;
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRoundPixelate();
  });

  // Redraw on resize to keep canvas crisp
  window.addEventListener('resize', () => {
    if (imageObj) drawPixelated();
  });
});
