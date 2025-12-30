// Scream (cry) guessing game logic. Relies on shared helpers from game.js (i18n, names, suggestions, HUD).

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="scream"]')) return;

  // Initialize language and UI
  setLang(getLang());
  // Extend i18n keys for this page via centralized i18n
  const extraI18N = {
    en: { 'scream.title': 'Guess the Pokémon!', 'scream.play': 'Play', 'scream.pause': 'Pause', 'scream.replay': 'Replay' },
    es: { 'scream.title': 'Adivina el Pokémon!', 'scream.play': 'Reproducir', 'scream.pause': 'Pausar', 'scream.replay': 'Repetir' },
    fr: { 'scream.title': 'Devinez le Pokémon!', 'scream.play': 'Lire', 'scream.pause': 'Pause', 'scream.replay': 'Rejouer' },
    de: { 'scream.title': 'Errate das Pokémon!', 'scream.play': 'Abspielen', 'scream.pause': 'Pause', 'scream.replay': 'Erneut' },
  };
  try { if (window.i18n && typeof i18n.extend === 'function') i18n.extend(extraI18N); } catch (_) {}
  translatePage();

  // Guessed list component
  const guessed = (window.GuessedList && GuessedList.create({ containerId: 'guessed-list' })) || null;
  window.getExcludeNames = () => (guessed ? guessed.set : new Set());
  window.resetGuessed = () => { guessed && guessed.clear(); };
  window.noteGuessed = (name) => { guessed && guessed.add(name); };

  // Stats and HUD
  loadStats();
  updateHUD();

  // Centralized wiring via initMode
  try { initMode({ id: 'scream' }); } catch(_) {}

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
  let audioWired = false;

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

  // Wire audio controls and visualization listeners once
  function wireAudioControls(){
    if (audioWired) return;
    audioWired = true;

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

    if (playBtn) {
      playBtn.addEventListener('click', async () => {
        if (!audioEl.src) return;
        if (audioEl.paused || audioEl.ended) {
          try { await audioEl.play(); } catch (_) {}
        } else {
          audioEl.pause();
        }
      });
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
    // Disable Next until round is completed
    try { if (typeof setNextButtonDisabled === 'function') setNextButtonDisabled(true); } catch(_) {}

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

  // Legacy helper removed; unified /api/check-guess is used everywhere via Api.checkGuess

  // If the new RoundEngine is available, use it and skip legacy wiring
  if (window.RoundEngine) {
    const frame = document.querySelector('.sprite-frame');
    const fetchRound = async () => {
      try { frame?.classList.add('loading'); } catch(_) {}
      const r = await (window.Api ? Api.random({ kind: 'scream' }) : Promise.resolve({ ok:false, error:'API unavailable' }));
      if (!r.ok) { try { showFeedback('error', r.error || 'Failed to load'); } catch(_) {} ; return {}; }
      const data = r.data;
      return {
        token: data.token,
        name: data.name,
        meta: { color: data.color, generation: data.generation },
        payload: data
      };
    };
    const onRoundLoaded = ({ payload }) => {
      try {
        stopDrawing();
      } catch(_) {}
      setPlayState('play');
      audioEl.src = payload.audio || '';
      try { setTimeout(() => frame?.classList.remove('loading'), 200); } catch(_) {}
      // Ensure canvas reset
      try { clearCanvas(); } catch(_) {}
    };
    const onCorrect = () => {
      // No special visuals; feedback handled by engine
    };
    const onWrong = () => {
      // No extra visuals; hints handled by engine
    };
    const onReveal = () => {
      // On reveal, keep audio state unchanged
    };
    // Ensure audio controls are wired when using the engine
    try { wireAudioControls(); } catch(_) {}
    RoundEngine.start({ fetchRound, onRoundLoaded, onCorrect, onWrong, onReveal, checkUrl: '/api/check-guess' });
    try { initMode({ id: 'scream' }); } catch(_) {}
    return; // skip legacy flow
  }

  // Start first round (legacy)
  await newRoundScream();

  // Suggestions
  const inputEl = document.getElementById('guess-input');
  if (inputEl && window.Suggestions){
    try { Suggestions.init({ inputEl, getExcludeNames: () => (guessed ? guessed.set : new Set()) }); } catch(_) {}
  }

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = inputEl.value.trim();
    if (!guess) return;
    const fb = document.getElementById('feedback');
    // Prevent early submissions before the round token is ready
    if (!state.token) {
      if (typeof showFeedback === 'function') showFeedback('info', 'Loading… please try again in a moment.');
      return;
    }
    const r = await (window.Api ? Api.checkGuess({ url: '/api/check-guess', token: state.token, guess, lang: getLang() }) : Promise.resolve({ ok:false, error:'API unavailable' }));
    if (!r.ok) { if (typeof showFeedback === 'function') showFeedback('error', r.error); return; }
    if (r.correct) {
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
      if (typeof showFeedback === 'function') showFeedback('correct', t('feedback.correct', { name: r.name }));
      // Disable Guess button after a correct answer
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // A wrong guess ends the current streak (score unchanged)
      if (typeof resetOnWrongGuess === 'function') { resetOnWrongGuess(); }
      if (typeof showFeedback === 'function') showFeedback('wrong', t('feedback.wrong'));
      try { window.noteGuessed && window.noteGuessed(guess); } catch(_){ }
      try { maybeRevealHints(); } catch(_) {}
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    if (typeof showFeedback === 'function') showFeedback('reveal', t('feedback.reveal', { name: state.answer }));
    if (typeof resetOnReveal === 'function') { resetOnReveal(); }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRoundScream();
  });

  // Legacy path: wire audio controls if not already
  try { wireAudioControls(); } catch(_) {}
});
