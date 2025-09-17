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

  // Track guessed names in this round and provide exclusion to suggestions
  const ENTRY_GUESSED = new Set();
  function renderGuessed() {
    const box = document.getElementById('guessed-list');
    if (!box) return;
    box.innerHTML = '';
    const names = (typeof getCachedNames === 'function' ? (getCachedNames(getLang(), getGen()) || []) : (typeof ALL_NAMES !== 'undefined' ? (ALL_NAMES[getLang()] || []) : []));
    for (const nn of ENTRY_GUESSED) {
      const chip = document.createElement('span');
      chip.className = 'guessed-chip';
      const disp = names.find(n => (typeof normalizeName==='function' ? normalizeName(n) : String(n).toLowerCase()) === nn) || nn;
      chip.textContent = disp;
      box.appendChild(chip);
    }
  }
  window.getExcludeNames = () => ENTRY_GUESSED;
  window.resetGuessed = () => { ENTRY_GUESSED.clear(); renderGuessed(); };
  window.noteGuessed = (name) => {
    const nn = (typeof normalizeName==='function' ? normalizeName(name) : String(name||'').trim().toLowerCase());
    if (!ENTRY_GUESSED.has(nn)) { ENTRY_GUESSED.add(nn); renderGuessed(); }
  };

  async function newRound() {
    // Reset streak if previous round not solved
    if (state.roundActive && !state.roundSolved) {
      if (state.streak !== 0) {
        state.streak = 0; state.score = 0;
        if (typeof saveStats === 'function') saveStats();
        if (typeof updateHUD === 'function') updateHUD();
      }
    }
    state.roundActive = true;
    state.roundSolved = false;
    state.attemptsWrong = 0;

    // Reset guessed list UI
    try { window.resetGuessed && window.resetGuessed(); } catch(_){}

    const txtEl = document.getElementById('entry-text');
    if (txtEl) {
      txtEl.textContent = '…';
    }
    const res = await fetch(`/entry/api/random-entry?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name;
    if (txtEl) txtEl.textContent = data.entry || '';

    const fbEl = document.getElementById('feedback');
    if (fbEl) { fbEl.textContent = ''; fbEl.className = 'feedback'; }
    const input = document.getElementById('guess-input');
    if (input) { input.value = ''; input.focus(); }
    if (typeof hideSuggestions === 'function') hideSuggestions();
  }

  async function checkGuess(guess) {
    const res = await fetch('/entry/api/check-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.token, guess, lang: getLang() })
    });
    return await res.json();
  }

  // Bind form and controls
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
      const res = await checkGuess(guess);
      const fb = document.getElementById('feedback');
      if (res.correct) {
        if (!state.roundSolved) {
          const wrong = state.attemptsWrong || 0;
          const points = Math.max(0, 100 - 25 * wrong);
          state.score = (state.score || 0) + points;
          state.streak = (state.streak || 0) + 1;
          state.roundSolved = true;
          if (typeof saveStats === 'function') saveStats();
          if (typeof updateHUD === 'function') updateHUD();
        }
        if (fb) { fb.textContent = (typeof t==='function'? t('feedback.correct', { name: res.name }) : `Correct! It is ${res.name}`); fb.className = 'feedback prominent correct'; }
      } else {
        state.attemptsWrong = (state.attemptsWrong || 0) + 1;
        if (fb) { fb.textContent = (typeof t==='function'? t('feedback.wrong') : 'Nope, try again!'); fb.className = 'feedback prominent incorrect'; }
        try { window.noteGuessed && window.noteGuessed(guess); } catch(_){}
      }
    });
  }

  const revealBtn = document.getElementById('reveal-btn');
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      const fb = document.getElementById('feedback');
      if (fb) { fb.textContent = (typeof t==='function'? t('feedback.reveal', { name: state.answer }) : `It was ${state.answer}`); fb.className = 'feedback prominent reveal'; }
      // Reveal breaks the streak
      if (state.streak !== 0) {
        state.streak = 0; state.score = 0;
        if (typeof saveStats === 'function') saveStats();
        if (typeof updateHUD === 'function') updateHUD();
      }
      state.roundSolved = false;
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
      renderGuessed();
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
