// Pixelated sprite guessing game
// Reuses shared helpers from game.js (names preload, suggestions, HUD, stats)

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="pixelate"]')) return;

  // Initialize language and UI
  setLang(getLang());
  translatePage && translatePage();

  // Guessed list component
  const guessed = (window.GuessedList && GuessedList.create({ containerId: 'guessed-list' })) || null;
  window.getExcludeNames = () => (guessed ? guessed.set : new Set());
  window.resetGuessed = () => { guessed && guessed.clear(); };
  window.noteGuessed = (name) => { guessed && guessed.add(name); };

  // Stats and HUD
  loadStats();
  updateHUD();

  // Centralized wiring via initMode
  try { initMode({ id: 'pixelate' }); } catch(_) {}

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
    if (typeof resetOnAbandon === 'function') { resetOnAbandon(); }
    state.roundActive = true;
    state.roundSolved = false;
    state.revealed = false;
    state.attemptsWrong = 0;
    try { resetHints(); } catch(_) {}
    try {
      state.hintLevel = 0;
      if (window.HintsUI && typeof HintsUI.clearPanels === 'function') HintsUI.clearPanels();
      if (window.HintsUI && typeof HintsUI.updateTimeline === 'function') HintsUI.updateTimeline(0);
      if (window.HintsUI && typeof HintsUI.syncRevealed === 'function') HintsUI.syncRevealed();
    } catch(_) {}

    try { if (typeof setRoundControlsDisabled === 'function') setRoundControlsDisabled(false); } catch(_) {}

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

    if (typeof showFeedback === 'function') showFeedback('info', '');
    const input = document.getElementById('guess-input');
    input.value = '';
    hideSuggestions();
  }

  async function doCheck(guess) {
    const r = await (window.Api ? Api.checkGuess({ url: '/api/check-guess', token: state.token, guess, lang: getLang() }) : Promise.resolve({ ok:false, error:'API unavailable' }));
    if (!r.ok) return { error: r.error };
    return { correct: !!r.correct, name: r.name };
  }

  // If the new RoundEngine is available, use it and skip legacy wiring
  if (window.RoundEngine) {
    const frame = document.querySelector('.sprite-frame');
    const fetchRound = async () => {
      try { frame?.classList.add('loading'); } catch(_) {}
      const r = await (window.Api ? Api.random({ kind: 'pixelate' }) : Promise.resolve({ ok:false, error:'API unavailable' }));
      if (!r.ok) { try { showFeedback('error', r.error || 'Failed to load'); } catch(_) {} ; return {}; }
      const data = r.data;
      return {
        token: data.token,
        name: data.name,
        meta: { sprite: data.sprite, color: data.color, generation: data.generation },
        payload: data
      };
    };
    const onRoundLoaded = ({ payload }) => {
      imageObj = new Image();
      imageObj.crossOrigin = 'anonymous';
      imageObj.onload = () => {
        drawPixelated();
        try { setTimeout(() => frame?.classList.remove('loading'), 200); } catch(_) {}
      };
      imageObj.onerror = () => {
        clearCanvas();
        const fbEl = document.getElementById('feedback');
        if (typeof showFeedback === 'function') showFeedback('error', 'Failed to load image'); else { fbEl.textContent = 'Failed to load image'; fbEl.className = 'feedback prominent incorrect'; }
        frame?.classList.remove('loading');
      };
      imageObj.src = payload.sprite;
    };
    const onCorrect = () => {
      try { state.attemptsWrong = 999; } catch(_) {}
      drawPixelated();
    };
    const onWrong = () => { drawPixelated(); try { maybeRevealHints(); } catch(_) {} };
    const onReveal = () => { try { state.attemptsWrong = 999; } catch(_) {} ; drawPixelated(); };
    RoundEngine.start({ fetchRound, onRoundLoaded, onCorrect, onWrong, onReveal, checkUrl: '/api/check-guess' });
    try { initMode({ id: 'pixelate' }); } catch(_) {}
    return; // skip legacy flow
  }

  // Start first round (legacy)
  newRoundPixelate();

  const inputEl = document.getElementById('guess-input');
  if (inputEl && window.Suggestions){
    try { Suggestions.init({ inputEl, getExcludeNames: () => (guessed ? guessed.set : new Set()) }); } catch(_) {}
  }

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
      if (typeof showFeedback === 'function') showFeedback('info', 'Loading… please try again in a moment.');
      return;
    }
    if (typeof showFeedback === 'function') showFeedback('info', '');

    const data = await doCheck(guess);
    if (data && data.error) {
      if (typeof showFeedback === 'function') showFeedback('error', data.error || 'Error');
      return;
    }

    if (data.correct) {
      if (typeof awardCorrect === 'function') {
        awardCorrect({ wrong: state.attemptsWrong || 0, mode: getGameId && getGameId() });
      } else {
        state.roundSolved = true;
        state.streak = (state.streak || 0) + 1;
        const add = Math.max(1, 10 - (state.attemptsWrong || 0));
        state.score = (state.score || 0) + add;
        saveStats();
        updateHUD();
      }
      if (typeof showFeedback === 'function') showFeedback('correct', `Correct! It was ${data.name}.`);
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
      // Show full detail (no pixelation)
      state.attemptsWrong = PIXEL_STEPS.length - 1;
      drawPixelated();
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // End streak upon wrong guess (score unchanged)
      if (typeof resetOnWrongGuess === 'function') { resetOnWrongGuess(); }
      window.noteGuessed && window.noteGuessed(guess);
      if (typeof showFeedback === 'function') showFeedback('wrong', `Nope — try again.`);
      refreshAfterWrongGuess();
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    if (!state.token) return;
    // Max detail
    state.attemptsWrong = PIXEL_STEPS.length - 1;
    drawPixelated();
    if (typeof showFeedback === 'function') showFeedback('reveal', `Revealed: ${state.answer || ''}`);
    if (typeof resetOnReveal === 'function') { resetOnReveal(); }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRoundPixelate();
  });

  // Redraw on resize to keep canvas crisp
  window.addEventListener('resize', () => {
    if (imageObj) drawPixelated();
  });
});
