// Scream (cry) guessing game logic. Relies on shared helpers from game.js (i18n, names, suggestions, HUD).

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="scream"]')) return;

  // Initialize language and UI
  setLang(getLang());
  // Extend i18n keys for this page
  const extraI18N = {
    en: { 'scream.title': 'Guess the Pokémon from its scream', 'scream.play': 'Play', 'scream.pause': 'Pause', 'scream.replay': 'Replay' },
    es: { 'scream.title': 'Adivina el Pokémon por su grito', 'scream.play': 'Reproducir', 'scream.pause': 'Pausar', 'scream.replay': 'Repetir' },
    fr: { 'scream.title': 'Devinez le Pokémon à partir de son cri', 'scream.play': 'Lire', 'scream.pause': 'Pause', 'scream.replay': 'Rejouer' },
    de: { 'scream.title': 'Errate das Pokémon anhand seines Schreis', 'scream.play': 'Abspielen', 'scream.pause': 'Pause', 'scream.replay': 'Erneut' },
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
  const playBtn = document.getElementById('play-btn');
  const canvas = document.getElementById('wave-canvas');
  const canvasWrap = document.getElementById('audio-visual');
  const ctx = canvas ? canvas.getContext('2d') : null;

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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    if (!ctx || !analyser) return;
    const { width, height } = canvas;
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
    // Reset streak if previous round was not solved
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

    window.resetGuessed && window.resetGuessed();

    // Load new cry
    const res = await fetch(`/api/random-cry?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name; // for Reveal button
    stopDrawing();
    setPlayState('play');
    audioEl.src = data.audio || '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';
  }

  async function checkGuessScream(guess) {
    const res = await fetch('/api/scream/check-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.token, guess, lang: getLang() })
    });
    return await res.json();
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
    const res = await checkGuessScream(guess);
    const fb = document.getElementById('feedback');
    if (res.correct) {
      if (!state.roundSolved) {
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
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      fb.textContent = t('feedback.wrong');
      fb.className = 'feedback prominent incorrect';
      try { window.noteGuessed && window.noteGuessed(guess); } catch(_){ }
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    const fb = document.getElementById('feedback');
    fb.textContent = t('feedback.reveal', { name: state.answer });
    fb.className = 'feedback prominent reveal';
    if (state.streak !== 0) {
      state.streak = 0;
      state.score = 0;
      saveStats();
      updateHUD();
    }
    state.roundSolved = false;
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
