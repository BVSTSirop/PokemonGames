let state = { token: null, answer: null, attemptsWrong: 0, roundSolved: false, streak: 0, score: 0, roundActive: false };

function loadStats() {
  try {
    const raw = localStorage.getItem('stats');
    const s = raw ? JSON.parse(raw) : {};
    state.score = Number.isFinite(s.score) ? s.score : 0;
    state.streak = Number.isFinite(s.streak) ? s.streak : 0;
  } catch (_) {
    state.score = 0; state.streak = 0;
  }
}
function saveStats() {
  try {
    localStorage.setItem('stats', JSON.stringify({ score: state.score || 0, streak: state.streak || 0 }));
  } catch (_) {}
}
function updateHUD() {
  const sEl = document.getElementById('hud-score');
  const stEl = document.getElementById('hud-streak');
  if (sEl) sEl.textContent = String(state.score || 0);
  if (stEl) stEl.textContent = String(state.streak || 0);
}

// Localized names cache: { lang: [names...] }
const ALL_NAMES = {};

// --- Simple client-side i18n ---
const I18N = {
  en: {
    'nav.guess': 'Guess',
    'lang.label': 'Language',
    'game.title': 'Guess the Pokémon from a sprite part',
    'form.label': 'Your guess',
    'form.placeholder': 'Type a Pokémon name...',
    'form.guessBtn': 'Guess',
    'controls.reveal': 'Reveal',
    'controls.next': 'Next',
    'aria.spriteCrop': 'Cropped Pokémon sprite',
    'aria.suggestions': 'Suggestions',
    'feedback.correct': 'Correct! It is {name}',
    'feedback.reveal': 'It was {name}',
    'hud.score': 'Score',
    'hud.streak': 'Streak'
  },
  es: {
    'nav.guess': 'Adivinar',
    'lang.label': 'Idioma',
    'game.title': 'Adivina el Pokémon por una parte del sprite',
    'form.label': 'Tu respuesta',
    'form.placeholder': 'Escribe un nombre de Pokémon...',
    'form.guessBtn': 'Adivinar',
    'controls.reveal': 'Revelar',
    'controls.next': 'Siguiente',
    'aria.spriteCrop': 'Sprite de Pokémon recortado',
    'aria.suggestions': 'Sugerencias',
    'feedback.correct': '¡Correcto! Es {name}',
    'feedback.reveal': 'Era {name}',
    'hud.score': 'Puntuación',
    'hud.streak': 'Racha'
  },
  fr: {
    'nav.guess': 'Deviner',
    'lang.label': 'Langue',
    'game.title': 'Devinez le Pokémon à partir d’une partie du sprite',
    'form.label': 'Votre réponse',
    'form.placeholder': 'Saisissez un nom de Pokémon…',
    'form.guessBtn': 'Deviner',
    'controls.reveal': 'Révéler',
    'controls.next': 'Suivant',
    'aria.spriteCrop': 'Sprite de Pokémon recadré',
    'aria.suggestions': 'Suggestions',
    'feedback.correct': 'Correct ! C’est {name}',
    'feedback.reveal': 'C’était {name}',
    'hud.score': 'Score',
    'hud.streak': 'Série'
  },
  de: {
    'nav.guess': 'Raten',
    'lang.label': 'Sprache',
    'game.title': 'Errate das Pokémon anhand eines Sprite-Ausschnitts',
    'form.label': 'Dein Tipp',
    'form.placeholder': 'Gib einen Pokémon-Namen ein…',
    'form.guessBtn': 'Raten',
    'controls.reveal': 'Aufdecken',
    'controls.next': 'Weiter',
    'aria.spriteCrop': 'Zugeschnittener Pokémon-Sprite',
    'aria.suggestions': 'Vorschläge',
    'feedback.correct': 'Richtig! Es ist {name}',
    'feedback.reveal': 'Es war {name}',
    'hud.score': 'Punkte',
    'hud.streak': 'Serie'
  }
};

function getLang() {
  const saved = localStorage.getItem('lang');
  if (saved && I18N[saved]) return saved;
  const nav = (navigator.language || 'en').toLowerCase();
  const base = nav.split('-')[0];
  return I18N[base] ? base : 'en';
}
function setLang(lang) {
  const l = I18N[lang] ? lang : 'en';
  localStorage.setItem('lang', l);
  document.documentElement.setAttribute('lang', l);
}
function t(key, params = {}) {
  const lang = getLang();
  const bundle = I18N[lang] || I18N.en;
  let s = bundle[key] || I18N.en[key] || key;
  Object.entries(params).forEach(([k, v]) => {
    s = s.replace(new RegExp('{' + k + '}', 'g'), v);
  });
  return s;
}
function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    const val = t(key);
    if (attr) {
      el.setAttribute(attr, val);
    } else {
      el.textContent = val;
    }
  });
  // Sync selector UI value
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = getLang();
}

async function newRound() {
  // If there was an active round that wasn't solved, reset streak
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

  const frame = document.querySelector('.sprite-frame');
  frame?.classList.add('loading');
  const res = await fetch(`/api/random-sprite?lang=${encodeURIComponent(getLang())}`);
  const data = await res.json();
  state.token = data.token;
  state.answer = data.name; // for Reveal button; not displayed by default
  const el = document.getElementById('sprite-crop');
  // Reset any reveal state and disable transitions during setup
  el.classList.remove('revealed');
  el.classList.add('no-anim');
  el.style.backgroundImage = `url(${data.sprite})`;
  // Use background position to emulate cropping: we will set background-size larger and position offset
  el.style.backgroundSize = data.bg_size;
  el.style.backgroundPosition = data.bg_pos;
  // Force reflow to apply styles without transition, then allow transitions again
  void el.offsetWidth;
  el.classList.remove('no-anim');
  const fbEl = document.getElementById('feedback');
  fbEl.textContent = '';
  fbEl.className = 'feedback';
  const input = document.getElementById('guess-input');
  input.value = '';
  hideSuggestions();
  // Give a short moment to let the image cache; then hide skeleton
  setTimeout(() => frame?.classList.remove('loading'), 200);
}

async function checkGuess(guess) {
  const res = await fetch('/api/check-guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: state.token, guess, lang: getLang() })
  });
  return await res.json();
}

// Simple debounce utility
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function normalizeName(s) {
  if (typeof s !== 'string') s = String(s || '');
  s = s.normalize('NFKD');
  // remove diacritics
  s = s.replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase();
  return s.replace(/\s|[-'’´`\.]/g, '');
}

async function preloadNames(lang) {
  const l = I18N[lang] ? lang : 'en';
  if (ALL_NAMES[l]) return ALL_NAMES[l];
  const res = await fetch(`/api/all-names?lang=${encodeURIComponent(l)}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    ALL_NAMES[l] = data;
  } else {
    ALL_NAMES[l] = [];
  }
  return ALL_NAMES[l];
}

function renderSuggestions(items) {
  const box = document.getElementById('suggestions');
  box.innerHTML = '';
  if (!items || items.length === 0) {
    box.classList.remove('visible');
    return;
  }
  items.forEach((n, idx) => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.setAttribute('role', 'option');
    div.setAttribute('id', `sugg-${idx}`);
    div.textContent = n;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent input blur before click
      selectSuggestion(n);
    });
    box.appendChild(div);
  });
  box.classList.add('visible');
}

function hideSuggestions() {
  const box = document.getElementById('suggestions');
  box.classList.remove('visible');
  box.innerHTML = '';
  document.getElementById('guess-input').setAttribute('aria-expanded', 'false');
}

let suggController = null;
async function fetchSuggestions(query) {
  const box = document.getElementById('suggestions');
  if (!query) {
    if (suggController) {
      try { suggController.abort(); } catch (_) {}
      suggController = null;
    }
    hideSuggestions();
    return;
  }
  try {
    // Ensure names are preloaded for current language
    const names = await preloadNames(getLang());
    const qn = normalizeName(query);
    const starts = [];
    const contains = [];
    for (const n of names) {
      const nn = normalizeName(n);
      if (nn.startsWith(qn)) {
        starts.push(n);
      } else if (nn.includes(qn)) {
        contains.push(n);
      }
      if (starts.length >= 20) break;
    }
    const list = starts.length < 20 ? starts.concat(contains).slice(0, 20) : starts.slice(0, 20);
    renderSuggestions(list);
    document.getElementById('guess-input').setAttribute('aria-expanded', list && list.length ? 'true' : 'false');
  } catch (_) {
    hideSuggestions();
  }
}

const debouncedSuggest = debounce((q) => fetchSuggestions(q), 250);

function revealFullSprite() {
  const el = document.getElementById('sprite-crop');
  if (!el) return;
  // Ensure transitions are enabled for reveal
  el.classList.remove('no-anim');
  // Add a class to enable CSS transition, and set styles for full view
  el.classList.add('revealed');
  el.style.backgroundSize = 'contain';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
}

function selectSuggestion(text) {
  const input = document.getElementById('guess-input');
  input.value = text;
  hideSuggestions();
  input.focus();
}

function handleKeyNav(e) {
  const box = document.getElementById('suggestions');
  const items = Array.from(box.querySelectorAll('.suggestion-item'));
  if (!box.classList.contains('visible') || items.length === 0) return;
  const current = items.findIndex(i => i.classList.contains('active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = current < items.length - 1 ? current + 1 : 0;
    items.forEach(i => i.classList.remove('active'));
    items[next].classList.add('active');
    items[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = current > 0 ? current - 1 : items.length - 1;
    items.forEach(i => i.classList.remove('active'));
    items[prev].classList.add('active');
    items[prev].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    if (current >= 0) {
      e.preventDefault();
      selectSuggestion(items[current].textContent);
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Initialize language and UI
  setLang(getLang());
  translatePage();

  // Load stats and update HUD
  loadStats();
  updateHUD();

  // Preload names for current language
  try { await preloadNames(getLang()); } catch (_) {}
  // Hook up language selector
  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
      translatePage();
      hideSuggestions();
      try { await preloadNames(getLang()); } catch (_) {}
    });
  }

  // Start a new round
  newRound();

  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e) => {
    debouncedSuggest(e.target.value.trim());
  });
  inputEl.addEventListener('keydown', handleKeyNav);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = document.getElementById('guess-input').value.trim();
    if (!guess) return;
    const res = await checkGuess(guess);
    const fb = document.getElementById('feedback');
    if (res.correct) {
      // Award points only the first time the round is solved
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
      revealFullSprite();
    } else {
      // Increment wrong attempts and give a visual hint by zooming out
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      const el = document.getElementById('sprite-crop');
      if (el) {
        // Ensure we are not in revealed state
        el.classList.remove('revealed');
        // Parse current background-size which may be in format like '500% 500%' or 'contain'
        const cur = window.getComputedStyle(el).backgroundSize;
        if (cur !== 'contain') {
          const parts = cur.split(' ');
          const parsePct = (s) => {
            const v = parseFloat(s);
            return isNaN(v) ? null : v;
          };
          const w = parsePct(parts[0]);
          const h = parsePct(parts[1] || parts[0]);
          if (w && h) {
            const newW = Math.max(100, w - 25);
            const newH = Math.max(100, h - 25);
            el.style.backgroundSize = `${newW}% ${newH}%`;
          }
        }
      }
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    const fb = document.getElementById('feedback');
    fb.textContent = t('feedback.reveal', { name: state.answer });
    fb.className = 'feedback prominent reveal';
    revealFullSprite();
    // Reveal breaks the streak
    if (state.streak !== 0) {
      state.streak = 0;
      state.score = 0;
      saveStats();
      updateHUD();
    }
    // Mark round as not solved
    state.roundSolved = false;
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRound();
  });
});
