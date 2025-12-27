let state = { token: null, answer: null, attemptsWrong: 0, roundSolved: false, streak: 0, score: 0, roundActive: false };

// --- Debug helpers for hint tracing (always on) ---
function dbgHints(){
  try {
    const args = Array.prototype.slice.call(arguments);
    console.debug.apply(console, ['[Hints]'].concat(args));
  } catch(_) {}
}

// Determine current game id from the DOM. Templates set data-game on the main <section>.
function getGameId() {
  try {
    const el = document.querySelector('[data-game]');
    const id = el && el.getAttribute('data-game');
    return id ? String(id) : 'global';
  } catch (_) {
    return 'global';
  }
}
function statsKey() {
  return `stats:${getGameId()}`;
}

function loadStats() {
  try {
    // Prefer namespaced key
    let raw = localStorage.getItem(statsKey());
    // Backward compatibility: migrate from legacy 'stats' once if present and no namespaced key yet
    if (!raw) {
      const legacy = localStorage.getItem('stats');
      if (legacy) {
        try {
          localStorage.setItem(statsKey(), legacy);
          raw = legacy;
        } catch (_) {}
      }
    }
    const s = raw ? JSON.parse(raw) : {};
    state.score = Number.isFinite(s.score) ? s.score : 0;
    state.streak = Number.isFinite(s.streak) ? s.streak : 0;
  } catch (_) {
    state.score = 0; state.streak = 0;
  }
}
function saveStats() {
  try {
    localStorage.setItem(statsKey(), JSON.stringify({ score: state.score || 0, streak: state.streak || 0 }));
  } catch (_) {}
}
function updateHUD() {
  const sEl = document.getElementById('hud-score');
  const stEl = document.getElementById('hud-streak');
  if (sEl) sEl.textContent = String(state.score || 0);
  if (stEl) stEl.textContent = String(state.streak || 0);
}

// Localized names cache per (lang|genCSV) key: { 'en|all' or 'en|1,3,5': [names...] }
const ALL_NAMES = {};

function canonicalizeGen(gen) {
  if (!gen) return 'all';
  const str = String(gen).toLowerCase();
  if (str === 'all' || str === 'any' || str === '0') return 'all';
  let arr = Array.isArray(gen) ? gen.slice() : str.replace(/\|/g, ',').split(',');
  arr = arr.map(s => String(s).trim()).filter(s => /^[1-9]$/.test(s));
  if (arr.length === 0) return 'all';
  const uniq = Array.from(new Set(arr)).sort((a, b) => Number(a) - Number(b));
  return uniq.join(',');
}
function getGen() {
  const saved = localStorage.getItem('gen');
  return canonicalizeGen(saved);
}
function setGen(gen) {
  const csv = canonicalizeGen(gen);
  localStorage.setItem('gen', csv);
}
function namesCacheKey(lang = getLang(), gen = getGen()) {
  return `${lang}|${canonicalizeGen(gen)}`;
}
function getCachedNames(lang = getLang(), gen = getGen()) {
  return ALL_NAMES[namesCacheKey(lang, gen)] || [];
}
function setGenSelectValue(sel, genCSV = getGen()) {
  if (!sel) return;
  const csv = canonicalizeGen(genCSV);
  const selected = csv === 'all' ? new Set(['all']) : new Set(csv.split(','));
  Array.from(sel.options).forEach(opt => {
    opt.selected = selected.has(opt.value);
  });
}
function readGenSelect(sel) {
  if (!sel) return 'all';
  const values = Array.from(sel.selectedOptions || []).map(o => o.value);
  if (values.includes('all') || values.length === 0) return 'all';
  return canonicalizeGen(values);
}

// ----- Nice dropdown with checkboxes for Generations -----
function formatGenLabel(csv) {
  const g = canonicalizeGen(csv);
  if (g === 'all') return t('gen.label.all');
  const parts = g.split(',').map(n => t('gen.label.gen', { n }));
  if (parts.length <= 3) return parts.join(', ');
  const head = parts.slice(0, 3).join(', ');
  return `${head} ${t('gen.label.more', { n: String(parts.length - 3) })}`;
}

function syncGenDropdownFromSelect() {
  const sel = document.getElementById('gen-select');
  const menu = document.getElementById('gen-dropdown-menu');
  const labelSpan = document.querySelector('#gen-dropdown .gen-label');
  if (!sel || !menu) return;
  const csv = readGenSelect(sel);
  const checkboxes = Array.from(menu.querySelectorAll('input[type="checkbox"]'));
  const set = csv === 'all' ? new Set(['all']) : new Set(csv.split(','));
  checkboxes.forEach(cb => {
    cb.checked = set.has(cb.value);
  });
  if (csv !== 'all') {
    const allCb = menu.querySelector('input[value="all"]');
    if (allCb) allCb.checked = false;
  }
  if (labelSpan) labelSpan.textContent = formatGenLabel(csv);
}

function syncSelectFromDropdownAndDispatch() {
  const sel = document.getElementById('gen-select');
  const menu = document.getElementById('gen-dropdown-menu');
  if (!sel || !menu) return;
  const checked = Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
  let csv;
  if (checked.includes('all') || checked.length === 0) {
    csv = 'all';
  } else {
    csv = canonicalizeGen(checked);
  }
  // Apply to hidden select
  setGenSelectValue(sel, csv);
  // Update label
  syncGenDropdownFromSelect();
  // Store selection immediately (for non-game pages) and notify listeners
  setGen(csv);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function initGenDropdown() {
  const root = document.getElementById('gen-dropdown');
  const toggle = document.getElementById('gen-dropdown-toggle');
  const menu = document.getElementById('gen-dropdown-menu');
  const sel = document.getElementById('gen-select');
  if (!root || !toggle || !menu || !sel) return;

  // Initialize from saved selection
  setGenSelectValue(sel, getGen());
  syncGenDropdownFromSelect();

  function openMenu() {
    menu.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    if (menu.classList.contains('open')) closeMenu(); else openMenu();
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  // Checkbox clicks
  menu.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const val = target.value;
    if (val === 'all') {
      if (target.checked) {
        // Uncheck others
        menu.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.value !== 'all') cb.checked = false; });
      }
    } else {
      // If any specific selected, uncheck 'all'
      const allCb = menu.querySelector('input[value="all"]');
      if (allCb && target.checked) allCb.checked = false;
      // If none checked, revert to 'all'
      const anySpecific = Array.from(menu.querySelectorAll('input[type="checkbox"]')).some(cb => cb.value !== 'all' && cb.checked);
      if (!anySpecific) {
        if (allCb) allCb.checked = true;
      }
    }
    // Apply to hidden select and notify
    syncSelectFromDropdownAndDispatch();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

// --- Simple client-side i18n ---
const I18N = {
  en: {
    'nav.guess': 'Sprite',
        'nav.scream': 'Scream',
    'nav.silhouette': 'Silhouette',
    'nav.pixelate': 'Pixelate',
    'nav.cards': 'Cards',
    'nav.pokedex': 'Pokédex',
    'nav.daily': 'Daily',
    'lang.label': 'Language',
    'game.title': 'Guess the Pokémon!',
    'form.label': 'Your guess',
    'form.placeholder': 'Type a Pokémon name...',
    'form.guessBtn': 'Guess',
    'controls.reveal': 'Reveal',
    'controls.next': 'Next',
    'gen.label.all': 'All Generations',
    'gen.label.gen': 'Gen {n}',
    'gen.label.more': '+{n} more',
    'gen.select.title': 'Select generations',
    'gen.menu.label': 'Generations',
    'gen.disabledHint': 'Generation selection is disabled in Daily mode',
    'aria.menu.open': 'Open menu',
    'aria.spriteCrop': 'Cropped Pokémon sprite',
    'aria.suggestions': 'Suggestions',
    'feedback.correct': 'Correct! It is {name}',
    'feedback.reveal': 'It was {name}',
    'feedback.wrong': 'Nope, try again!',
    'hud.score': 'Score',
    'hud.streak': 'Streak',
    'hints.title': 'Hints',
    'hints.first': 'Starts with {letter}',
    'hints.color': 'Color: {color}',
    'hints.gen': 'Gen: {n}',
    'hints.silhouette': 'Silhouette',
    // Label-only variants for static UI (no placeholders)
    'hints.label.first': 'Starts with',
    'hints.label.color': 'Color',
    'hints.label.gen': 'Generation'
  },
  es: {
    'nav.guess': 'Sprite',
        'nav.scream': 'Grito',
    'nav.silhouette': 'Silueta',
    'nav.pixelate': 'Pixelado',
    'nav.cards': 'Cartas',
    'nav.pokedex': 'Pokédex',
    'nav.daily': 'Diario',
    'lang.label': 'Idioma',
    'game.title': '¡Adivina el Pokémon!',
    'form.label': 'Tu respuesta',
    'form.placeholder': 'Escribe un nombre de Pokémon...',
    'form.guessBtn': 'Adivinar',
    'controls.reveal': 'Revelar',
    'controls.next': 'Siguiente',
    'gen.label.all': 'Todas las generaciones',
    'gen.label.gen': 'Gen {n}',
    'gen.label.more': '+{n} más',
    'gen.select.title': 'Seleccionar generaciones',
    'gen.menu.label': 'Generaciones',
    'gen.disabledHint': 'La selección de generaciones está deshabilitada en el modo Diario',
    'aria.menu.open': 'Abrir menú',
    'aria.spriteCrop': 'Sprite de Pokémon recortado',
    'aria.suggestions': 'Sugerencias',
    'feedback.correct': '¡Correcto! Es {name}',
    'feedback.reveal': 'Era {name}',
    'feedback.wrong': '¡No! Intenta de nuevo.',
    'hud.score': 'Puntuación',
    'hud.streak': 'Racha',
    'hints.title': 'Pistas',
    'hints.first': 'Empieza con {letter}',
    'hints.color': 'Color: {color}',
    'hints.gen': 'Gen: {n}',
    'hints.silhouette': 'Silueta',
    'hints.label.first': 'Empieza con',
    'hints.label.color': 'Color',
    'hints.label.gen': 'Generación'
  },
  fr: {
    'nav.guess': 'Sprite',
        'nav.scream': 'Cri',
    'nav.silhouette': 'Silhouette',
    'nav.pixelate': 'Pixélisé',
    'nav.cards': 'Cartes',
    'nav.pokedex': 'Pokédex',
    'nav.daily': 'Quotidien',
    'lang.label': 'Langue',
    'game.title': 'Devinez le Pokémon!',
    'form.label': 'Votre réponse',
    'form.placeholder': 'Saisissez un nom de Pokémon…',
    'form.guessBtn': 'Deviner',
    'controls.reveal': 'Révéler',
    'controls.next': 'Suivant',
    'gen.label.all': 'Toutes les générations',
    'gen.label.gen': 'Gen {n}',
    'gen.label.more': '+{n} de plus',
    'gen.select.title': 'Sélectionner des générations',
    'gen.menu.label': 'Générations',
    'gen.disabledHint': 'La sélection des générations est désactivée en mode Quotidien',
    'aria.menu.open': 'Ouvrir le menu',
    'aria.spriteCrop': 'Sprite de Pokémon recadré',
    'aria.suggestions': 'Suggestions',
    'feedback.correct': 'Correct ! C’est {name}',
    'feedback.reveal': 'C’était {name}',
    'feedback.wrong': 'Non, réessayez !',
    'hud.score': 'Score',
    'hud.streak': 'Série',
    'hints.title': 'Indices',
    'hints.first': 'Commence par {letter}',
    'hints.color': 'Couleur : {color}',
    'hints.gen': 'Gén : {n}',
    'hints.silhouette': 'Silhouette',
    'hints.label.first': 'Commence par',
    'hints.label.color': 'Couleur',
    'hints.label.gen': 'Génération'
  },
  de: {
    'nav.guess': 'Sprite',
        'nav.scream': 'Schrei',
    'nav.silhouette': 'Silhouette',
    'nav.pixelate': 'Verpixelt',
    'nav.cards': 'Karten',
    'nav.pokedex': 'Pokédex',
    'nav.daily': 'Täglich',
    'lang.label': 'Sprache',
    'game.title': 'Errate das Pokémon!',
    'form.label': 'Dein Tipp',
    'form.placeholder': 'Gib einen Pokémon-Namen ein…',
    'form.guessBtn': 'Raten',
    'controls.reveal': 'Aufdecken',
    'controls.next': 'Weiter',
    'gen.label.all': 'Alle Generationen',
    'gen.label.gen': 'Gen {n}',
    'gen.label.more': '+{n} mehr',
    'gen.select.title': 'Generationen auswählen',
    'gen.menu.label': 'Generationen',
    'gen.disabledHint': 'Die Generationsauswahl ist im Tagesmodus deaktiviert',
    'aria.menu.open': 'Menü öffnen',
    'aria.spriteCrop': 'Zugeschnittener Pokémon-Sprite',
    'aria.suggestions': 'Vorschläge',
    'feedback.correct': 'Richtig! Es ist {name}',
    'feedback.reveal': 'Es war {name}',
    'feedback.wrong': 'Falsch, versuche es nochmal!',
    'hud.score': 'Punkte',
    'hud.streak': 'Serie',
    'hints.title': 'Hinweise',
    'hints.first': 'Beginnt mit {letter}',
    'hints.color': 'Farbe: {color}',
    'hints.gen': 'Gen: {n}',
    'hints.silhouette': 'Silhouette',
    'hints.label.first': 'Beginnt mit',
    'hints.label.color': 'Farbe',
    'hints.label.gen': 'Generation'
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
  // Sync selector UI values
  const langSel = document.getElementById('lang-select');
  if (langSel) langSel.value = getLang();
  const genSel = document.getElementById('gen-select');
  if (genSel) {
    setGenSelectValue(genSel, getGen());
    // Also reflect to the fancy dropdown label/checkboxes
    try { syncGenDropdownFromSelect(); } catch(_) {}
  }
}

// --- Hints helper ---
function resetHints() {
  try { state.hintLevel = 0; } catch(_) { state.hintLevel = 0; }
  const box = document.getElementById('hints');
  if (box) { box.innerHTML = ''; dbgHints('resetHints(): cleared #hints box'); }
  else { dbgHints('resetHints(): #hints not found'); }
  // Also clear timeline panels if shared UI is present
  try { if (window.HintsUI && typeof HintsUI.clearPanels === 'function') HintsUI.clearPanels(); } catch(_) {}
}
function ensureHintsBox() {
  const box = document.getElementById('hints');
  if (!box) return null;
  if (!box.dataset.inited) {
    const title = document.createElement('div');
    title.className = 'hints-title';
    title.textContent = t('hints.title');
    const list = document.createElement('ul');
    list.className = 'hints-list';
    box.appendChild(title);
    box.appendChild(list);
    box.dataset.inited = '1';
  }
  const list = box.querySelector('.hints-list');
  dbgHints('ensureHintsBox(): initialized =', !!box.dataset.inited, 'list?', !!list);
  return list;
}
// Reveal a specific hint level (1..4) exactly once. Returns true if newly revealed.
function revealHintAt(level) {
  const list = ensureHintsBox();
  if (!list) { dbgHints('revealHintAt(): no list; abort level', level); return false; }
  const name = state.answer || '';
  const meta = state.meta || {};
  const has = (key) => !!list.querySelector(`[data-hint="${key}"]`);

  if (level === 1) {
    if (!name) { dbgHints('revealHintAt(1): missing answer name'); return false; }
    if (has('first')) { dbgHints('revealHintAt(1): already revealed'); return false; }
    const first = name.trim().charAt(0) || '?';
    const li = document.createElement('li');
    li.dataset.hint = 'first';
    li.textContent = t('hints.first', { letter: first });
    list.appendChild(li);
    state.hintLevel = Math.max(state.hintLevel || 0, 1);
    dbgHints('revealHintAt(1): appended hint', first);
    return true;
  }
  if (level === 2) {
    if (!meta.color) { dbgHints('revealHintAt(2): missing meta.color'); return false; }
    if (has('color')) { dbgHints('revealHintAt(2): already revealed'); return false; }
    const li = document.createElement('li');
    li.dataset.hint = 'color';
    li.textContent = t('hints.color', { color: meta.color });
    list.appendChild(li);
    state.hintLevel = Math.max(state.hintLevel || 0, 2);
    dbgHints('revealHintAt(2): appended color', meta.color);
    return true;
  }
  if (level === 3) {
    if (!meta.generation) { dbgHints('revealHintAt(3): missing meta.generation'); return false; }
    if (has('generation')) { dbgHints('revealHintAt(3): already revealed'); return false; }
    const li = document.createElement('li');
    li.dataset.hint = 'generation';
    li.textContent = t('hints.gen', { n: meta.generation });
    list.appendChild(li);
    state.hintLevel = Math.max(state.hintLevel || 0, 3);
    dbgHints('revealHintAt(3): appended generation', meta.generation);
    return true;
  }
  if (level === 4) {
    if (!meta.sprite) { dbgHints('revealHintAt(4): missing meta.sprite'); return false; }
    if (has('silhouette')) { dbgHints('revealHintAt(4): already revealed'); return false; }
    const li = document.createElement('li');
    li.dataset.hint = 'silhouette';
    const label = document.createElement('div');
    label.textContent = t('hints.silhouette');
    const thumb = document.createElement('div');
    thumb.style.width = '80px';
    thumb.style.height = '80px';
    thumb.style.backgroundImage = `url(${meta.sprite})`;
    thumb.style.backgroundSize = 'contain';
    thumb.style.backgroundRepeat = 'no-repeat';
    thumb.style.backgroundPosition = 'center';
    thumb.style.filter = 'brightness(0) saturate(100%)';
    thumb.style.opacity = '0.9';
    thumb.setAttribute('aria-label', t('hints.silhouette'));
    li.appendChild(label);
    li.appendChild(thumb);
    list.appendChild(li);
    state.hintLevel = Math.max(state.hintLevel || 0, 4);
    dbgHints('revealHintAt(4): appended silhouette with sprite present?', !!meta.sprite);
    return true;
  }
  return false;
}
function maybeRevealHints() {
  const wrong = state.attemptsWrong || 0;
  const name = state.answer || '';
  // Do not bail out if name is missing — allow levels 2–4 (color/gen/silhouette)
  // to reveal based on available metadata. Only level 1 requires the name.
  if (!name) { dbgHints('maybeRevealHints(): no answer yet; will still attempt non-name hints. attemptsWrong=', wrong); }
  ensureHintsBox();
  let max = 0;
  if (wrong >= 3) max = 1;
  if (wrong >= 5) max = 2;
  if (wrong >= 7) max = 3;
  if (wrong >= 10) max = 4;
  dbgHints('maybeRevealHints(): wrong=', wrong, 'maxLevel=', max, 'meta=', {
    hasColor: !!(state.meta && state.meta.color),
    hasGen: !!(state.meta && state.meta.generation),
    hasSprite: !!(state.meta && state.meta.sprite)
  });
  for (let lvl = 1; lvl <= max; lvl++) {
    try {
      // If answer is not present, skip level 1 (starting letter) but
      // still process levels 2–4 using available metadata
      if (!name && lvl === 1) {
        dbgHints('maybeRevealHints(): skipping level 1 (no name yet)');
        continue;
      }
      const did = revealHintAt(lvl);
      dbgHints('maybeRevealHints(): tried reveal level', lvl, '->', did ? 'revealed' : 'skipped');
    } catch(err) {
      dbgHints('maybeRevealHints(): error revealing level', lvl, err && (err.message||err));
    }
  }
  dbgHints('maybeRevealHints(): complete');
  // Keep timeline visuals in sync when using the shared UI
  try {
    if (window.HintsUI && typeof HintsUI.updateTimeline === 'function') HintsUI.updateTimeline(wrong);
    if (window.HintsUI && typeof HintsUI.syncRevealed === 'function') HintsUI.syncRevealed();
  } catch(_) {}
}

// Install shared timeline override when available (applies to all modes)
try {
  if (window.HintsUI && typeof HintsUI.installTimelineOverride === 'function'){
    HintsUI.installTimelineOverride({
      renderers: {
        1: () => {
          const meta = (typeof state!=='undefined' && state && state.meta) ? state.meta : {};
          if (!meta || !meta.generation) return null;
          const wrap = document.createElement('div');
          wrap.dataset.hint = 'generation';
          wrap.textContent = t('hints.gen', { n: meta.generation });
          return wrap;
        },
        2: () => {
          const meta = (typeof state!=='undefined' && state && state.meta) ? state.meta : {};
          if (!meta || !meta.color) return null;
          const wrap = document.createElement('div');
          wrap.dataset.hint = 'color';
          wrap.textContent = t('hints.color', { color: meta.color });
          return wrap;
        },
        3: () => {
          const name = (typeof state!=='undefined' && state && state.answer) ? state.answer : '';
          if (!name) return null;
          const first = name.trim().charAt(0) || '?';
          const wrap = document.createElement('div');
          wrap.dataset.hint = 'first';
          wrap.textContent = t('hints.first', { letter: first });
          return wrap;
        },
        4: () => {
          const meta = (typeof state!=='undefined' && state && state.meta) ? state.meta : {};
          if (!meta || !meta.sprite) return null;
          const wrap = document.createElement('div');
          wrap.dataset.hint = 'silhouette';
          const label = document.createElement('div');
          label.textContent = t('hints.silhouette');
          const thumb = document.createElement('div');
          thumb.style.width = '80px';
          thumb.style.height = '80px';
          thumb.style.backgroundImage = `url(${meta.sprite})`;
          thumb.style.backgroundSize = 'contain';
          thumb.style.backgroundRepeat = 'no-repeat';
          thumb.style.backgroundPosition = 'center';
          thumb.style.filter = 'brightness(0) saturate(100%)';
          thumb.style.opacity = '0.9';
          thumb.setAttribute('aria-label', t('hints.silhouette'));
          wrap.appendChild(label);
          wrap.appendChild(thumb);
          return wrap;
        }
      }
    });
    // Hide legacy list to avoid duplicate display
    try { const box = document.getElementById('hints'); if (box) box.hidden = true; } catch(_) {}
  }
} catch(_) {}

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
  // Re-enable Guess button for a fresh round
  try {
    const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
    if (guessBtn) { guessBtn.disabled = false; guessBtn.setAttribute('aria-disabled','false'); }
  } catch(_) {}
  // Reset hints for new round (legacy list + shared timeline)
  try { resetHints(); } catch(_) {}
  try {
    // Clear attempts and any previously revealed content
    state.hintLevel = 0;
    if (window.HintsUI && typeof HintsUI.clearPanels === 'function') HintsUI.clearPanels();
    if (window.HintsUI && typeof HintsUI.updateTimeline === 'function') HintsUI.updateTimeline(0);
    if (window.HintsUI && typeof HintsUI.syncRevealed === 'function') HintsUI.syncRevealed();
  } catch(_) {}

  // Reset guessed list for this round if handler exists
  if (typeof window.resetGuessed === 'function') { try { window.resetGuessed(); } catch(_){} }

  const frame = document.querySelector('.sprite-frame');
  frame?.classList.add('loading');
  const res = await fetch(`/api/random-sprite?lang=${encodeURIComponent(getLang())}&gen=${encodeURIComponent(getGen())}`);
  const data = await res.json();
  state.token = data.token;
  state.answer = data.name; // for Reveal button; not displayed by default
  // store meta for hints
  state.meta = {
    id: data.id,
    color: data.color,
    generation: data.generation,
    sprite: data.sprite,
  };
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
  // map common locale-specific letters
  s = s.replace(/ß/g, 'ss');
  // remove gender symbols and any non-alphanumeric characters
  s = s.replace(/[♂♀]/g, '');
  s = s.replace(/[^a-z0-9]/g, '');
  return s;
}

async function preloadNames(lang) {
  const l = I18N[lang] ? lang : 'en';
  const g = getGen();
  const key = namesCacheKey(l, g);
  if (ALL_NAMES[key]) return ALL_NAMES[key];
  const res = await fetch(`/api/all-names?lang=${encodeURIComponent(l)}&gen=${encodeURIComponent(g)}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    ALL_NAMES[key] = data;
  } else {
    ALL_NAMES[key] = [];
  }
  return ALL_NAMES[key];
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
    const exclude = (typeof window.getExcludeNames === 'function') ? window.getExcludeNames() : null;
    for (const n of names) {
      const nn = normalizeName(n);
      if (exclude && exclude.has(nn)) continue;
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

// Initialize the generation fancy dropdown on every page
window.addEventListener('DOMContentLoaded', () => {
  try { initGenDropdown(); } catch (_) {}
});

window.addEventListener('DOMContentLoaded', async () => {
  // Only initialize on pages that have the sprite game section
  if (!document.querySelector('[data-game="sprite"]')) {
    return;
  }
  // Initialize language and UI
  setLang(getLang());
  translatePage();

  // Guessed names for this round and helpers for suggestions to exclude them
  const SPRITE_GUESSED = new Set();
  function renderGuessed() {
    const box = document.getElementById('guessed-list');
    if (!box) return;
    box.innerHTML = '';
    for (const nn of SPRITE_GUESSED) {
      const chip = document.createElement('span');
      chip.className = 'guessed-chip';
      // Find display name from cached names (try to match original case)
      const names = getCachedNames(getLang(), getGen()) || [];
      const disp = names.find(n => normalizeName(n) === nn) || nn;
      chip.textContent = disp;
      box.appendChild(chip);
    }
  }
  window.getExcludeNames = () => SPRITE_GUESSED;
  window.resetGuessed = () => { SPRITE_GUESSED.clear(); renderGuessed(); };
  window.noteGuessed = (name) => {
    const nn = normalizeName(name);
    if (!SPRITE_GUESSED.has(nn)) { SPRITE_GUESSED.add(nn); renderGuessed(); }
  };

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
      // Re-render guessed chips with possibly localized names
      renderGuessed();
    });
  }
  // Hook up generation selector
  const genSel = document.getElementById('gen-select');
  if (genSel) {
    setGenSelectValue(genSel, getGen());
    genSel.addEventListener('change', async () => {
      const csv = readGenSelect(genSel);
      setGen(csv);
      hideSuggestions();
      try { await preloadNames(getLang()); } catch (_) {}
      // Reset guessed list as pool changed
      window.resetGuessed && window.resetGuessed();
      // Start a fresh round in the selected generation(s)
      newRound();
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
    const fb = document.getElementById('feedback');
    // Prevent early submissions before the round token is ready
    if (!state.token) {
      fb.textContent = 'Loading… please try again in a moment.';
      fb.className = 'feedback prominent';
      return;
    }
    const res = await checkGuess(guess);
    if (res && res.error) {
      // Surface server/network errors without penalizing the player
      fb.textContent = res.error;
      fb.className = 'feedback prominent';
      return;
    }
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
      // Disable Guess button after a correct answer
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
      revealFullSprite();
    } else {
      // Increment wrong attempts and give a visual hint by zooming out
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // Feedback message for wrong guess
      fb.textContent = t('feedback.wrong');
      fb.className = 'feedback prominent incorrect';
      // Maybe reveal textual hints after certain wrong attempts
      try { maybeRevealHints(); } catch(_) {}
      // Note guessed name so it appears in the list and is removed from suggestions
      try { window.noteGuessed && window.noteGuessed(guess); } catch(_){}
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
