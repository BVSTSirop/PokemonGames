// Entry guess game logic. Relies on helper utilities from game.js (language, suggestions, HUD, state)

window.addEventListener('DOMContentLoaded', async () => {
  // Only initialize on pages that have the entry game section
  if (!document.querySelector('[data-game="entry"]')) return;

  // Ensure language attribute is set and preload names
  if (typeof setLang === 'function') setLang(getLang());
  try { if (typeof preloadNames === 'function') await preloadNames(getLang()); } catch (_) {}

  // Load stats if available and update HUD
  if (typeof loadStats === 'function') loadStats();
  if (typeof updateHUD === 'function') updateHUD();

  // Guessed list component
  const guessed = (window.GuessedList && GuessedList.create({ containerId: 'guessed-list' })) || null;
  window.getExcludeNames = () => (guessed ? guessed.set : new Set());
  window.resetGuessed = () => { guessed && guessed.clear(); };
  window.noteGuessed = (name) => { guessed && guessed.add(name); };

  async function newRound() {
    // Penalize abandoning an unsolved round in a unified way
    if (typeof resetOnAbandon === 'function') { resetOnAbandon(); }
    state.roundActive = true;
    state.roundSolved = false;
    state.revealed = false;
    state.attemptsWrong = 0;

    // Re-enable Guess, Reveal and Input for a new round
    try { if (typeof setRoundControlsDisabled === 'function') setRoundControlsDisabled(false); } catch(_) {}

    // Reset guessed list UI
    try { window.resetGuessed && window.resetGuessed(); } catch(_){}

    // Reset hint UI state (legacy list + shared timeline)
    try { resetHints(); } catch(_) {}
    try {
      state.hintLevel = 0;
      if (window.HintsUI && typeof HintsUI.clearPanels === 'function') HintsUI.clearPanels();
      if (window.HintsUI && typeof HintsUI.updateTimeline === 'function') HintsUI.updateTimeline(0);
      if (window.HintsUI && typeof HintsUI.syncRevealed === 'function') HintsUI.syncRevealed();
    } catch(_) {}

    const txtEl = document.getElementById('entry-text');
    if (txtEl) {
      txtEl.textContent = '…';
    }
    const res = await fetch(`/pokedex/api/random-entry?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name;

      // Provide metadata for shared hints (sprite now available for silhouette)
      try {
        state.meta = Object.assign({}, state.meta, {
          sprite: data.sprite,
          color: data.color,
          generation: data.generation,
        });
      } catch(_) {}

    if (txtEl) txtEl.textContent = data.entry || '';

    if (typeof showFeedback === 'function') showFeedback('info', '');
    const input = document.getElementById('guess-input');
    if (input) { input.value = ''; input.focus(); }
    if (typeof hideSuggestions === 'function') hideSuggestions();
  }

  async function checkGuess(guess) {
    const r = await (window.Api ? Api.checkGuess({ url: '/api/check-guess', token: state.token, guess, lang: getLang() }) : Promise.resolve({ ok:false, error:'API unavailable' }));
    if (!r.ok) return { error: r.error };
    return { correct: !!r.correct, name: r.name };
  }

  // If RoundEngine is available, use it and skip legacy wiring
  if (window.RoundEngine) {
    const fetchRound = async () => {
      const r = await (window.Api ? Api.random({ kind: 'entry' }) : Promise.resolve({ ok:false, error:'API unavailable' }));
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
      const txtEl = document.getElementById('entry-text');
      if (txtEl) txtEl.textContent = payload.entry || '';
      try {
        // reflect meta for hints timeline
        state.meta = Object.assign({}, state.meta, { sprite: payload.sprite, color: payload.color, generation: payload.generation });
      } catch(_) {}
    };
    const onCorrect = ({ name }) => {
      // text-only mode; nothing special to reveal beyond feedback
    };
    const onWrong = ({ guess }) => {
      // add to guessed list and update hints handled by engine
    };
    const onReveal = ({ answer }) => {
      // nothing special beyond feedback
    };
    RoundEngine.start({ fetchRound, onRoundLoaded, onCorrect, onWrong, onReveal, checkUrl: '/api/check-guess' });
    // adjust language/gen handlers to use engine
    const langSel2 = document.getElementById('lang-select');
    if (langSel2) {
      langSel2.value = getLang();
      langSel2.addEventListener('change', async () => {
        setLang(langSel2.value);
        try { await preloadNames(getLang()); } catch(_) {}
        if (guessed && guessed.render) guessed.render();
        RoundEngine.next();
      });
    }
    const genSel2 = document.getElementById('gen-select');
    if (genSel2) {
      if (typeof setGenSelectValue === 'function') setGenSelectValue(genSel2, getGen());
      genSel2.addEventListener('change', async () => {
        const csv = (typeof readGenSelect === 'function') ? readGenSelect(genSel2) : (genSel2.value || 'all');
        setGen(csv);
        try { await preloadNames(getLang()); } catch(_) {}
        window.resetGuessed && window.resetGuessed();
        RoundEngine.next();
      });
    }
    return; // skip legacy wiring below
  }

  // Bind form and controls (legacy)
  const inputEl = document.getElementById('guess-input');
  if (inputEl) {
    inputEl.addEventListener('input', (e) => {
      if (typeof debouncedSuggest === 'function') debouncedSuggest(e.target.value.trim());
    });
    inputEl.addEventListener('keydown', (e) => {
      if (typeof handleKeyNav === 'function') handleKeyNav(e);
    });
    inputEl.addEventListener('blur', () => setTimeout(() => { if (typeof hideSuggestions==='function') hideSuggestions(); }, 100));
  }

  const form = document.getElementById('guess-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const guess = (document.getElementById('guess-input')?.value || '').trim();
      if (!guess) return;
      const fb = document.getElementById('feedback');
      // Prevent early submissions before the round token is ready
      if (!state.token) {
        if (typeof showFeedback === 'function') showFeedback('info', 'Loading… please try again in a moment.');
        return;
      }
      const res = await checkGuess(guess);
      if (res && res.error) {
        if (typeof showFeedback === 'function') showFeedback('error', res.error);
        return;
      }
      if (res.correct) {
        if (typeof awardCorrect === 'function') {
          awardCorrect({ wrong: state.attemptsWrong || 0, mode: getGameId && getGameId() });
        } else {
          // Fallback (shouldn't happen): basic award
          state.streak = (state.streak || 0) + 1;
          const wrong = state.attemptsWrong || 0;
          const points = Math.max(0, 100 - 25 * wrong);
          state.score = (state.score || 0) + points;
          state.roundSolved = true;
          if (typeof saveStats === 'function') saveStats();
          if (typeof updateHUD === 'function') updateHUD();
        }
        if (typeof showFeedback === 'function') showFeedback('correct', (typeof t==='function'? t('feedback.correct', { name: res.name }) : `Correct! It is ${res.name}`));
        // Disable Guess button after correct answer
        try {
          const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
          if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
        } catch(_) {}
      } else {
        state.attemptsWrong = (state.attemptsWrong || 0) + 1;
        // A wrong guess ends the current streak (score unchanged)
        if (typeof resetOnWrongGuess === 'function') { resetOnWrongGuess(); }
        if (typeof showFeedback === 'function') showFeedback('wrong', (typeof t==='function'? t('feedback.wrong') : 'Nope, try again!'));
        try { window.noteGuessed && window.noteGuessed(guess); } catch(_){}
        try { if (typeof maybeRevealHints === 'function') maybeRevealHints(); } catch(_) {}
      }
    });
  }

  const revealBtn = document.getElementById('reveal-btn');
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      if (typeof showFeedback === 'function') showFeedback('reveal', (typeof t==='function'? t('feedback.reveal', { name: state.answer }) : `It was ${state.answer}`));
      if (typeof resetOnReveal === 'function') { resetOnReveal(); }
    });
  }

  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => newRound());
  }

  // Handle language changes
  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
      try { await preloadNames(getLang()); } catch (_) {}
      // Re-render guessed list in potentially different language
      try { guessed && guessed.render && guessed.render(); } catch(_) {}
      // Get a new entry in the selected language
      newRound();
    });
  }
  // Handle generation changes
  const genSel = document.getElementById('gen-select');
  if (genSel) {
    if (typeof setGenSelectValue === 'function') setGenSelectValue(genSel, getGen());
    genSel.addEventListener('change', async () => {
      const csv = (typeof readGenSelect === 'function') ? readGenSelect(genSel) : (genSel.value || 'all');
      setGen(csv);
      try { await preloadNames(getLang()); } catch (_) {}
      // Reset guessed and start new round for selected generation(s)
      window.resetGuessed && window.resetGuessed();
      newRound();
    });
  }

  // Start first round
  newRound();
});
