// TCG blurred card guessing game logic. Reuses shared helpers from game.js

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="tcg"]')) return;

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
  try { initMode({ id: 'tcg' }); } catch(_) {}

  async function newRoundTCG() {
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

    if (typeof window.resetGuessed === 'function') { try { window.resetGuessed(); } catch(_){} }

    const frame = document.querySelector('.sprite-frame');
    frame?.classList.add('loading');
    const res = await fetch(`/api/tcg/random?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name;
    // Provide metadata for shared hints; use card image as silhouette surrogate
    state.meta = Object.assign({}, state.meta, {
      sprite: data.image,
      color: data.color,
      generation: data.generation,
    });
    const el = document.getElementById('card-crop');
    el.classList.remove('revealed');
    el.classList.add('no-anim');
    el.style.backgroundImage = `url(${data.image})`;
    el.style.backgroundSize = data.bg_size || 'contain';
    el.style.backgroundPosition = data.bg_pos || 'center center';
    // Apply initial maximum blur for the game; remove on reveal/correct
    setCardBlur(0); // 0 wrong attempts at round start => max blur
    void el.offsetWidth;
    el.classList.remove('no-anim');
    if (typeof showFeedback === 'function') showFeedback('info', '');
    const input = document.getElementById('guess-input');
    input.value = '';
    hideSuggestions();
    setTimeout(() => frame?.classList.remove('loading'), 200);
  }

  // Map wrong attempts -> blur amount (px). Index 0 is initial state (no wrong guesses yet)
  // Make unblurring faster: clear much sooner with bigger steps.
  // Initial blur slightly reduced; after 4 wrong guesses the image is fully clear.
  const BLUR_STEPS = [20, 14, 8, 4, 0];
  function setCardBlur(attemptsWrong = state.attemptsWrong || 0) {
    const el = document.getElementById('card-crop');
    if (!el) return;
    const idx = Math.min(Math.max(0, attemptsWrong), BLUR_STEPS.length - 1);
    const px = BLUR_STEPS[idx];
    if (px <= 0) {
      el.style.filter = 'contrast(110%)';
    } else {
      el.style.filter = `blur(${px}px) contrast(110%)`;
    }
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
      const r = await (window.Api ? Api.random({ kind: 'tcg' }) : Promise.resolve({ ok:false, error:'API unavailable' }));
      if (!r.ok) { try { showFeedback('error', r.error || 'Failed to load'); } catch(_) {} ; return {}; }
      const data = r.data;
      return {
        token: data.token,
        name: data.name,
        meta: { image: data.image, color: data.color, generation: data.generation },
        payload: data
      };
    };
    const onRoundLoaded = ({ payload }) => {
      const el = document.getElementById('card-crop');
      try {
        el.classList.remove('revealed');
        el.classList.add('no-anim');
        el.style.backgroundImage = `url(${payload.image})`;
        el.style.backgroundSize = payload.bg_size || 'contain';
        el.style.backgroundPosition = payload.bg_pos || 'center center';
        setCardBlur(0);
        void el.offsetWidth;
        el.classList.remove('no-anim');
        setTimeout(() => frame?.classList.remove('loading'), 200);
      } catch(_) {}
    };
    const onCorrect = () => {
      const el = document.getElementById('card-crop');
      try { el.style.filter = ''; el.style.backgroundSize = 'contain'; el.style.backgroundPosition = 'center center'; } catch(_) {}
    };
    const onWrong = () => { try { setCardBlur((state.attemptsWrong||0)); } catch(_) {} };
    const onReveal = () => { const el = document.getElementById('card-crop'); try { el.style.filter=''; el.style.backgroundSize='contain'; el.style.backgroundPosition='center center'; } catch(_) {} };
    RoundEngine.start({ fetchRound, onRoundLoaded, onCorrect, onWrong, onReveal, checkUrl: '/api/check-guess' });
    try { initMode({ id: 'tcg' }); } catch(_) {}
    return; // skip legacy flow
  }

  // Start first round (legacy)
  newRoundTCG();

  const inputEl = document.getElementById('guess-input');
  if (inputEl && window.Suggestions){
    try { Suggestions.init({ inputEl, getExcludeNames: () => (guessed ? guessed.set : new Set()) }); } catch(_) {}
  }

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = document.getElementById('guess-input').value.trim();
    if (!guess) return;
    const fb = document.getElementById('feedback');
    // Do not penalize duplicate guesses; match behavior of other games
    const nn = normalizeName(guess);
    if (guessed && guessed.has(guess)) {
      if (typeof showFeedback === 'function') showFeedback('info', 'Already guessed that — try a different Pokémon.');
      return;
    }
    if (!state.token) {
      if (typeof showFeedback === 'function') showFeedback('info', 'Loading… please try again in a moment.');
      return;
    }
    if (typeof showFeedback === 'function') showFeedback('info', '');

    const data = await doCheck(guess);
    if (data && data.error) { if (typeof showFeedback === 'function') showFeedback('error', data.error || 'Error'); return; }

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
      const el = document.getElementById('card-crop');
      el.style.filter = '';
      el.style.backgroundSize = 'contain';
      el.style.backgroundPosition = 'center center';
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // Unblur slightly on each wrong guess
      setCardBlur(state.attemptsWrong);
      if (typeof resetOnWrongGuess === 'function') { resetOnWrongGuess(); }
      window.noteGuessed && window.noteGuessed(guess);
      if (typeof showFeedback === 'function') showFeedback('wrong', `Nope — try again.`);
      try { maybeRevealHints(); } catch(_) {}
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    if (!state.token) return;
    const el = document.getElementById('card-crop');
    el.style.filter = '';
    el.style.backgroundSize = 'contain';
    el.style.backgroundPosition = 'center center';
    if (typeof showFeedback === 'function') showFeedback('reveal', `Revealed: ${state.answer || ''}`);
    if (typeof resetOnReveal === 'function') { resetOnReveal(); }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRoundTCG();
  });
});
