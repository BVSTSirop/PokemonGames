// Silhouette guessing game logic. Reuses shared helpers from game.js

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="silhouette"]')) return;

  // Initialize language and UI
  setLang(getLang());
  translatePage && translatePage();

  // Guessed list for this round
  const SIL_GUESSED = new Set();
  function renderGuessed() {
    const box = document.getElementById('guessed-list');
    if (!box) return;
    box.innerHTML = '';
    for (const nn of SIL_GUESSED) {
      const chip = document.createElement('span');
      chip.className = 'guessed-chip';
      const names = getCachedNames(getLang(), getGen()) || [];
      const disp = names.find(n => normalizeName(n) === nn) || nn;
      chip.textContent = disp;
      box.appendChild(chip);
    }
  }
  window.getExcludeNames = () => SIL_GUESSED;
  window.resetGuessed = () => { SIL_GUESSED.clear(); renderGuessed(); };
  window.noteGuessed = (name) => {
    const nn = normalizeName(name);
    if (!SIL_GUESSED.has(nn)) { SIL_GUESSED.add(nn); renderGuessed(); }
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
      newRoundSilhouette();
    });
  }

  async function newRoundSilhouette() {
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

    // Re-enable Guess button for a fresh round
    try {
      const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
      if (guessBtn) { guessBtn.disabled = false; guessBtn.setAttribute('aria-disabled','false'); }
    } catch(_) {}

    if (typeof window.resetGuessed === 'function') { try { window.resetGuessed(); } catch(_){} }

    const frame = document.querySelector('.sprite-frame');
    frame?.classList.add('loading');
    const res = await fetch(`/api/silhouette/random?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
    const data = await res.json();
    state.token = data.token;
    state.answer = data.name;
    // Provide sprite URL for shared silhouette hint
    state.meta = Object.assign({}, state.meta, { sprite: data.sprite });
    const el = document.getElementById('sprite-crop');
    el.classList.remove('revealed');
    el.classList.add('no-anim');
    el.style.backgroundImage = `url(${data.sprite})`;
    el.style.backgroundSize = data.bg_size || 'contain';
    el.style.backgroundPosition = data.bg_pos || 'center center';
    // Apply silhouette effect via CSS filter (black fill via drop-shadow on white) fallback to brightness(0)
    el.style.filter = 'brightness(0) saturate(100%)';
    void el.offsetWidth;
    el.classList.remove('no-anim');
    const fbEl = document.getElementById('feedback');
    fbEl.textContent = '';
    fbEl.className = 'feedback';
    const input = document.getElementById('guess-input');
    input.value = '';
    hideSuggestions();
    setTimeout(() => frame?.classList.remove('loading'), 200);
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
  newRoundSilhouette();

  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e) => { debouncedSuggest(e.target.value.trim()); });
  inputEl.addEventListener('keydown', handleKeyNav);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

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
      // Disable Guess button after a correct answer
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
      // Reveal: remove silhouette filter and ensure full image is visible
      const el = document.getElementById('sprite-crop');
      el.style.filter = '';
      el.style.backgroundSize = 'contain';
      el.style.backgroundPosition = 'center center';
    } else {
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // A wrong guess ends the current streak for this mode
      if (state.streak !== 0) {
        state.streak = 0;
        saveStats();
        updateHUD();
      }
      window.noteGuessed && window.noteGuessed(guess);
      fb.textContent = `Nope — try again.`;
      fb.className = 'feedback prominent incorrect';
      try { maybeRevealHints(); } catch(_) {}
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    if (!state.token) return;
    const el = document.getElementById('sprite-crop');
    el.style.filter = '';
    el.style.backgroundSize = 'contain';
    el.style.backgroundPosition = 'center center';
    const fb = document.getElementById('feedback');
    fb.textContent = `Revealed: ${state.answer || ''}`;
    fb.className = 'feedback prominent reveal';
    state.roundSolved = true;
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRoundSilhouette();
  });
});
