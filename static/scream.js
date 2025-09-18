// Scream (cry) guessing game logic. Relies on shared helpers from game.js (i18n, names, suggestions, HUD).

window.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('[data-game="scream"]')) return;

  // Initialize language and UI
  setLang(getLang());
  // Extend i18n keys for this page
  const extraI18N = {
    en: { 'scream.title': 'Guess the Pokémon from its scream', 'scream.play': 'Play cry' },
    es: { 'scream.title': 'Adivina el Pokémon por su grito', 'scream.play': 'Reproducir grito' },
    fr: { 'scream.title': 'Devinez le Pokémon à partir de son cri', 'scream.play': 'Lire le cri' },
    de: { 'scream.title': 'Errate das Pokémon anhand seines Schreis', 'scream.play': 'Schrei abspielen' },
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

  playBtn.addEventListener('click', async () => {
    try { await audioEl.play(); } catch (_) { /* ignored */ }
  });
});
