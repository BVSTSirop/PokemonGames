// Scream (cry) guessing game logic. Relies on shared helpers from game.js (i18n, names, suggestions, HUD).

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="scream"]')) return;

  // Initialize language and UI
  setLang(getLang());
  // Extend i18n keys for this page
  const extraI18N = {
    en: { 'scream.title': 'Guess the Pokémon!', 'scream.play': 'Play', 'scream.pause': 'Pause', 'scream.replay': 'Replay' },
    es: { 'scream.title': 'Adivina el Pokémon!', 'scream.play': 'Reproducir', 'scream.pause': 'Pausar', 'scream.replay': 'Repetir' },
    fr: { 'scream.title': 'Devinez le Pokémon!', 'scream.play': 'Lire', 'scream.pause': 'Pause', 'scream.replay': 'Rejouer' },
    de: { 'scream.title': 'Errate das Pokémon!', 'scream.play': 'Abspielen', 'scream.pause': 'Pause', 'scream.replay': 'Erneut' },
  };
  try {
    Object.keys(extraI18N).forEach(l => { Object.assign(I18N[l] = I18N[l] || {}, extraI18N[l]); });
  } catch (_) {}
  translatePage();

  // Local per-round guessed names
  const SCREAM_GUESSED = new Set();
  function renderGuessed() {
    const box = document.getElementById('guessed-list');
    if (!box) return;
    box.innerHTML = '';
    for (const nn of SCREAM_GUESSED) {
      const chip = document.createElement('span');
      chip.className = 'guessed-chip';
      const names = getCachedNames(getLang(), getGen()) || [];
      const disp = names.find(n => normalizeName(n) === nn) || nn;
      chip.textContent = disp;
      box.appendChild(chip);
    }
  }
  window.getExcludeNames = () => SCREAM_GUESSED;
  window.resetGuessed = () => { SCREAM_GUESSED.clear(); renderGuessed(); };
  window.noteGuessed = (name) => {
    const nn = normalizeName(name);
    if (!SCREAM_GUESSED.has(nn)) { SCREAM_GUESSED.add(nn); renderGuessed(); }
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
      translatePage();
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
      newRoundScream();
    });
  }

  const audioEl = document.getElementById('cry-audio');
  // Set a slightly reduced default volume so cries aren't too loud by default
  try { audioEl.volume = 0.5; } catch(_) {}
  const playBtn = document.getElementById('play-btn');
  const canvas = document.getElementById('wave-canvas');
  const canvasWrap = document.getElementById('audio-visual');
  const ctx = canvas ? canvas.getContext('2d') : null;

  // Resize canvas to fit its container (responsive, crisp on high-DPR screens)
  function resizeCanvas() {
    if (!canvas || !canvasWrap || !ctx) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = Math.max(1, Math.floor(canvasWrap.clientWidth));
    const cssH = Math.max(1, Math.floor(canvasWrap.clientHeight));
    // Only resize if dimensions actually changed to avoid clearing needlessly
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      // Ensure drawing coordinates are in CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clearCanvas();
    }
  }

  // Initial size and on resize
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Ensure cross-origin audio can be analyzed
  try { audioEl.crossOrigin = 'anonymous'; } catch(_) {}

  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let rafId = null;

  function setPlayState(stateStr) {
    // stateStr: 'play' | 'pause' | 'replay'
    if (!playBtn) return;
    if (stateStr === 'pause') {
      playBtn.textContent = t('scream.pause');
      playBtn.setAttribute('aria-label', t('scream.pause'));
    } else if (stateStr === 'replay') {
      playBtn.textContent = t('scream.replay');
      playBtn.setAttribute('aria-label', t('scream.replay'));
    } else {
      playBtn.textContent = t('scream.play');
      playBtn.setAttribute('aria-label', t('scream.play'));
    }
  }

  function ensureAudioGraph() {
    if (audioCtx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      sourceNode = audioCtx.createMediaElementSource(audioEl);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (_) {
      audioCtx = null; analyser = null; sourceNode = null;
    }
  }

  function clearCanvas() {
    if (!ctx || !canvas) return;
    const width = canvas.clientWidth || 0;
    const height = canvas.clientHeight || 0;
    ctx.clearRect(0, 0, width, height);
  }

  function draw() {
    if (!ctx || !analyser) return;
    const width = canvas.clientWidth || 0;
    const height = canvas.clientHeight || 0;
    const bufferLen = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLen);
    analyser.getByteFrequencyData(dataArray);

    // Background
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#0e1740');
    bg.addColorStop(1, '#0b112e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Progress overlay (left side highlight)
    const dur = audioEl.duration || 0;
    const cur = audioEl.currentTime || 0;
    const ratio = dur ? Math.min(1, Math.max(0, cur / dur)) : 0;
    if (ratio > 0) {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(255,214,0,0.20)');
      grad.addColorStop(1, 'rgba(255,214,0,0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width * ratio, height);
      // Progress line
      ctx.fillStyle = '#ffd942';
      ctx.fillRect(width * ratio - 1, 0, 2, height);
    }

    // Bars
    const barCount = Math.min(64, bufferLen);
    const barWidth = width / barCount;
    for (let i = 0; i < barCount; i++) {
      const v = dataArray[i] / 255; // 0..1
      const barH = Math.max(2, v * (height - 6));
      const x = i * barWidth;
      const y = height - barH;
      const hue = 220 - Math.floor(v * 120);
      const alpha = 0.95;
      ctx.fillStyle = `hsl(${hue} 80% 60% / ${alpha})`;
      ctx.fillRect(x + 1, y, Math.max(1, barWidth - 2), barH);
    }

    rafId = requestAnimationFrame(draw);
  }

  function stopDrawing() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    clearCanvas();
  }

  function seekFromCanvas(ev) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      audioEl.currentTime = ratio * audioEl.duration;
    }
  }

  async function newRoundScream() {
    // Penalize abandoning an unsolved round in a unified way
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

    // Re-enable Guess, Reveal and Input for a fresh round
    try { if (typeof setRoundControlsDisabled === 'function') setRoundControlsDisabled(false); } catch(_) {}

    window.resetGuessed && window.resetGuessed();

    // Load new cry
    const res = await fetch(`/api/random-cry?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name; // for Reveal button
    // Provide metadata for shared hints (no sprite for cries)
    state.meta = Object.assign({}, state.meta, {
      color: data.color,
      generation: data.generation,
    });
    stopDrawing();
    setPlayState('play');
    audioEl.src = data.audio || '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';
  }

  async function checkGuessScream(guess) {
    try {
      const res = await fetch('/api/scream/check-guess', {
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
  await newRoundScream();

  // Suggestions
  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e) => { debouncedSuggest(e.target.value.trim()); });
  inputEl.addEventListener('keydown', handleKeyNav);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = inputEl.value.trim();
    if (!guess) return;
    const fb = document.getElementById('feedback');
    // Prevent early submissions before the round token is ready
    if (!state.token) {
      fb.textContent = 'Loading… please try again in a moment.';
      fb.className = 'feedback prominent';
      return;
    }
    const res = await checkGuessScream(guess);
    if (res && res.error) {
      fb.textContent = res.error;
      fb.className = 'feedback prominent';
      return;
    }
    if (res.correct) {
      if (typeof awardCorrect === 'function') {
        awardCorrect({ wrong: state.attemptsWrong || 0, mode: getGameId && getGameId() });
      } else if (!state.roundSolved) {
        const wrong = state.attemptsWrong || 0;
        const points = Math.max(0, 100 - 25 * wrong);
        state.score = (state.score || 0) + points;
        state.streak = (state.streak || 0) + 1;
        state.roundSolved = true;
        saveStats();
        updateHUD();
      }
      fb.textContent = t('feedback.correct', { name: res.name });
      fb.className = 'feedback prominent correct';
      // Disable Guess button after a correct answer
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // A wrong guess ends the current streak (score unchanged)
      if (typeof resetOnWrongGuess === 'function') { resetOnWrongGuess(); }
      fb.textContent = t('feedback.wrong');
      fb.className = 'feedback prominent incorrect';
      try { window.noteGuessed && window.noteGuessed(guess); } catch(_){ }
      try { maybeRevealHints(); } catch(_) {}
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    const fb = document.getElementById('feedback');
    fb.textContent = t('feedback.reveal', { name: state.answer });
    fb.className = 'feedback prominent reveal';
    if (typeof resetOnReveal === 'function') { resetOnReveal(); }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRoundScream();
  });

  // Audio events & controls
  audioEl.addEventListener('play', async () => {
    setPlayState('pause');
    ensureAudioGraph();
    try { await audioCtx.resume?.(); } catch(_) {}
    stopDrawing();
    draw();
  });
  audioEl.addEventListener('pause', () => {
    setPlayState('play');
    stopDrawing();
  });
  audioEl.addEventListener('ended', () => {
    setPlayState('replay');
    stopDrawing();
  });

  if (canvasWrap) {
    canvasWrap.addEventListener('click', seekFromCanvas);
  } else if (canvas) {
    canvas.addEventListener('click', seekFromCanvas);
  }

  playBtn.addEventListener('click', async () => {
    if (!audioEl.src) return;
    if (audioEl.paused || audioEl.ended) {
      try { await audioEl.play(); } catch (_) {}
    } else {
      audioEl.pause();
    }
  });
});
