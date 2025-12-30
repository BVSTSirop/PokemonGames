// RoundEngine: encapsulates round lifecycle for all modes
// Depends on helpers exposed in game.js: state, loadStats, saveStats, updateHUD,
// resetOnAbandon, resetOnWrongGuess, resetOnReveal, awardCorrect, setRoundControlsDisabled,
// preloadNames, getLang, getGen, showFeedback, debouncedSuggest, handleKeyNav,
// maybeRevealHints, hideSuggestions, Api.checkGuess

(function(){
  const Engine = {
    _wired: false,
    _callbacks: {},
    _lastPayload: null,
    start(opts){
      this._callbacks = opts || {};
      try { loadStats(); updateHUD(); } catch(_) {}
      // Ensure names for current language are ready
      try { preloadNames(getLang()); } catch(_) {}
      this._wireDom();
      this.next();
    },
    getState(){
      try { return Object.assign({}, state); } catch(_) { return {}; }
    },
    async next(){
      try { if (state.roundActive && !state.roundSolved && !state.revealed) resetOnAbandon(); } catch(_) {}
      // reset base state
      try {
        state.roundActive = true;
        state.roundSolved = false;
        state.revealed = false;
        state.attemptsWrong = 0;
      } catch(_) {}
      try { setRoundControlsDisabled(false); } catch(_) {}
      // reset hints
      try { resetHints(); } catch(_) {}
      try {
        state.hintLevel = 0;
        if (window.HintsUI && typeof HintsUI.clearPanels === 'function') HintsUI.clearPanels();
        if (window.HintsUI && typeof HintsUI.updateTimeline === 'function') HintsUI.updateTimeline(0);
        if (window.HintsUI && typeof HintsUI.syncRevealed === 'function') HintsUI.syncRevealed();
      } catch(_) {}
      // reset guessed list for the round
      try { window.resetGuessed && window.resetGuessed(); } catch(_) {}
      // fetch round via adapter
      const fetchRound = this._callbacks.fetchRound;
      if (typeof fetchRound !== 'function') return;
      try {
        const res = await fetchRound();
        this._lastPayload = res && (res.payload !== undefined ? res.payload : res);
        if (res && res.token) state.token = res.token;
        if (res && (res.name || res.answer)) state.answer = res.name || res.answer;
        if (res && res.meta) state.meta = Object.assign({}, state.meta, res.meta);
        try { showFeedback('info', ''); } catch(_) {}
        try { const input = document.getElementById('guess-input'); if (input){ input.value=''; input.focus(); } } catch(_) {}
        try { hideSuggestions(); } catch(_) {}
        if (typeof this._callbacks.onRoundLoaded === 'function') {
          this._callbacks.onRoundLoaded({ payload: this._lastPayload });
        }
      } catch(err) {
        try { showFeedback('error', 'Failed to start a round'); } catch(_) {}
      }
    },
    correct(name){
      try {
        if (!state.roundActive || state.roundSolved || state.revealed) return;
        awardCorrect({ wrong: state.attemptsWrong || 0, mode: (typeof getGameId==='function'? getGameId() : 'global') });
      } catch(_) {}
      if (typeof this._callbacks.onCorrect === 'function') {
        this._callbacks.onCorrect({ name: name || state.answer, payload: this._lastPayload });
      }
    },
    wrong({ guess }){
      try {
        if (!state.roundActive || state.roundSolved || state.revealed) return;
        state.attemptsWrong = (state.attemptsWrong || 0) + 1;
        resetOnWrongGuess();
        showFeedback('wrong', (typeof t==='function'? t('feedback.wrong') : 'Wrong, try again.'));
        try { window.noteGuessed && window.noteGuessed(guess); } catch(_) {}
        try { maybeRevealHints(); } catch(_) {}
      } catch(_) {}
      if (typeof this._callbacks.onWrong === 'function') {
        this._callbacks.onWrong({ guess, attemptsWrong: state.attemptsWrong || 0, payload: this._lastPayload });
      }
    },
    reveal(){
      try {
        if (!state.roundActive || state.roundSolved || state.revealed) return;
        showFeedback('reveal', (typeof t==='function'? t('feedback.reveal', { name: state.answer }) : `It was ${state.answer}`));
        resetOnReveal();
      } catch(_) {}
      if (typeof this._callbacks.onReveal === 'function') {
        this._callbacks.onReveal({ answer: state.answer, payload: this._lastPayload });
      }
    },
    _wireDom(){
      if (this._wired) return;
      this._wired = true;
      // Inputs: suggestions and nav
      try {
        const inputEl = document.getElementById('guess-input');
        if (inputEl && window.Suggestions && !inputEl.dataset.suggestionsWired){
          try {
            // Defer resolution of the exclusion set to call-time so guessed list
            // added after engine wiring is respected.
            const dynamicEx = () => {
              try { return (typeof window.getExcludeNames === 'function') ? window.getExcludeNames() : new Set(); }
              catch(_) { return new Set(); }
            };
            Suggestions.init({ inputEl, getExcludeNames: dynamicEx });
            inputEl.dataset.suggestionsWired = 'true';
          } catch(_) {}
        }
      } catch(_) {}
      // Form submit: unified checkGuess flow
      try {
        const form = document.getElementById('guess-form');
        if (form){
          form.addEventListener('submit', async (e)=>{
            e.preventDefault();
            const input = document.getElementById('guess-input');
            const guess = (input && input.value || '').trim();
            if (!guess) return;
            if (!state.token){ try { showFeedback('info', 'Loading… please try again in a moment.'); } catch(_) {} return; }
            // use Api.checkGuess
            try {
              const endpoint = Engine._callbacks.checkUrl || '/api/check-guess';
              const r = await (window.Api ? Api.checkGuess({ url: endpoint, token: state.token, guess, lang: getLang() }) : Promise.resolve({ ok:false, error:'API unavailable' }));
              if (!r.ok){ try { showFeedback('error', r.error || 'Error'); } catch(_) {} return; }
              if (r.correct){
                try { showFeedback('correct', (typeof t==='function'? t('feedback.correct', { name: r.name }) : `Correct! ${r.name}`)); } catch(_) {}
                Engine.correct(r.name);
              } else {
                Engine.wrong({ guess });
              }
            } catch(err){
              try { showFeedback('error', 'Network error'); } catch(_) {}
            }
          });
        }
      } catch(_) {}
      // Reveal and Next buttons
      try { const btn = document.getElementById('reveal-btn'); btn && btn.addEventListener('click', ()=> Engine.reveal()); } catch(_) {}
      try { const btn = document.getElementById('next-btn'); btn && btn.addEventListener('click', ()=> Engine.next()); } catch(_) {}
    }
  };

  // expose globally
  window.RoundEngine = Engine;
})();
