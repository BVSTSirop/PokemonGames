let state = { token: null, answer: null, ready: false, accept: null };
let roundSeq = 0; // guards out-of-order responses

// Top-level (near your state):
let ALL_NAMES = []; // [{ id, slug, display_en, name_de?, name_fr?, name_es? }]

// Map ui lang -> field to read from ALL_NAMES
function nameFieldFor(lang) {
  return lang === 'en' ? 'display_en' : `name_${lang}`;
}

// Fetch all names for current UI language
async function bootstrapAllNames() {
  const lang = getLang();
  const res = await fetch(`/api/all-names?lang=${encodeURIComponent(lang)}`);
  const data = await res.json();
  // Defensive: ensure array and strings
  ALL_NAMES = Array.isArray(data) ? data : [];
}


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
    'feedback.reveal': 'It was {name}'
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
    'feedback.reveal': 'Era {name}'
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
    'feedback.reveal': 'C’était {name}'
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
    'feedback.reveal': 'Es war {name}'
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
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = getLang();
}

// --- Name normalization to mirror backend ---
function normalizeName(s) {
  if (!s) return '';
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase();
  s = s.replace(/[ \-'.’´`\.]/g, '');
  s = s.replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[\u200B-\u200D\uFEFF]/g, '');
  return s;
}

function buildAcceptSet(data) {
  const set = new Set();
  if (data.slug) set.add(normalizeName(data.slug));
  if (data.display_en) set.add(normalizeName(data.display_en));
  if (data.name) set.add(normalizeName(data.name));
  return set;
}

async function newRound() {
  const seq = ++roundSeq;
  state.ready = false;
  document.querySelector('#guess-form button[type=submit]').disabled = true;

  const frame = document.querySelector('.sprite-frame');
  frame?.classList.add('loading');
  const res = await fetch(`/api/random-sprite?lang=${encodeURIComponent(getLang())}`);
  const data = await res.json();

  if (seq !== roundSeq) return;

  state.token = data.token;
  state.answer = data.name;
  state.accept = buildAcceptSet(data);

  const el = document.getElementById('sprite-crop');
  el.classList.remove('revealed');
  el.classList.add('no-anim');
  el.style.backgroundImage = `url(${data.sprite})`;
  el.style.backgroundSize = data.bg_size;
  el.style.backgroundPosition = data.bg_pos;
  void el.offsetWidth;
  el.classList.remove('no-anim');

  const fbEl = document.getElementById('feedback');
  fbEl.textContent = '';
  fbEl.className = 'feedback';
  const input = document.getElementById('guess-input');
  input.value = '';
  hideSuggestions();
  setTimeout(() => frame?.classList.remove('loading'), 200);

  state.ready = true;
  document.querySelector('#guess-form button[type=submit]').disabled = false;
}

async function checkGuess(guess) {
  const res = await fetch('/api/check-guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: state.token, guess, lang: getLang() })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error || 'Guess check failed';
    throw new Error(msg);
  }
  return await res.json();
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
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
      e.preventDefault();
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
// REPLACE your fetchSuggestions() with this local version
async function fetchSuggestions(query) {
  const box = document.getElementById('suggestions');
  if (!query) {
    hideSuggestions();
    return;
  }

  const field = nameFieldFor(getLang()); // e.g., 'name_de' or 'display_en'
  const qn = normalizeName(query);
  if (!ALL_NAMES.length) {
    // If somehow not bootstrapped yet, try again soon
    hideSuggestions();
    return;
  }

  // Prioritize startsWith, then contains (deduped), limit 20
  const starts = [];
  const contains = [];
  for (const p of ALL_NAMES) {
    const val = p[field] || p.display_en || '';
    if (!val) continue;
    const nv = normalizeName(val);
    if (!nv) continue;
    if (nv.startsWith(qn)) {
      starts.push(val);
    } else if (nv.includes(qn)) {
      contains.push(val);
    }
    if (starts.length >= 20) break;
  }
  let list = starts;
  if (list.length < 20) {
    for (const v of contains) {
      if (!list.includes(v)) list.push(v);
      if (list.length >= 20) break;
    }
  }

  renderSuggestions(list);
  document.getElementById('guess-input')
    .setAttribute('aria-expanded', list.length ? 'true' : 'false');
}


const debouncedSuggest = debounce((q) => fetchSuggestions(q), 250);

function revealFullSprite() {
  const el = document.getElementById('sprite-crop');
  if (!el) return;
  el.classList.remove('no-anim');
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
    items[next].addEventListener('mouseenter', () => items[next].classList.add('active'), { once: true });
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

window.addEventListener('DOMContentLoaded', () => {
  setLang(getLang());
  translatePage();

  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
      translatePage();
      await bootstrapAllNames(); // reload for new language
      hideSuggestions();
    });
  }

  await bootstrapAllNames();   // <– legal now
  newRound();

  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e) => {
    debouncedSuggest(e.target.value.trim());
  });
  inputEl.addEventListener('keydown', handleKeyNav);
  inputEl.addEventListener('blur', () => setTimeout(hideSuggestions, 100));

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.ready || !state.token) return;
    const guess = document.getElementById('guess-input').value.trim();
    if (!guess) return;

    const guessN = normalizeName(guess);
    if (state.accept && state.accept.has(guessN)) {
      const fb = document.getElementById('feedback');
      fb.textContent = t('feedback.correct', { name: state.answer });
      fb.className = 'feedback prominent correct';
      revealFullSprite();
      return;
    }

    try {
      const res = await checkGuess(guess);
      const fb = document.getElementById('feedback');
      if (res.correct) {
        fb.textContent = t('feedback.correct', { name: res.name });
        fb.className = 'feedback prominent correct';
        revealFullSprite();
      } else {
        const el = document.getElementById('sprite-crop');
        if (el) {
          el.classList.remove('revealed');
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
    } catch (err) {
      if (String(err.message).includes('Invalid token')) return;
    }
  });

  document.getElementById('reveal-btn').addEventListener('click', () => {
    const fb = document.getElementById('feedback');
    fb.textContent = t('feedback.reveal', { name: state.answer });
    fb.className = 'feedback prominent reveal';
    revealFullSprite();
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRound();
  });
});