let state = { token: null, answer: null, attemptsWrong: 0, roundSolved: false, streak: 0, score: 0, roundActive: false, revealed: false };

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

// ----- Unified feedback helper -----
// Applies consistent classes and text content for feedback area
function showFeedback(type, text){
  try {
    const fb = document.getElementById('feedback');
    if (!fb) return;
    const msg = String(text == null ? '' : text);
    const trimmed = msg.trim();
    if (!trimmed) {
      // Hide feedback area when empty
      fb.textContent = '';
      fb.className = 'feedback';
      fb.setAttribute('aria-hidden', 'true');
      return;
    }
    fb.textContent = msg;
    let cls = 'feedback prominent';
    if (type === 'correct') cls += ' correct';
    else if (type === 'wrong') cls += ' incorrect';
    else if (type === 'reveal') cls += ' reveal';
    fb.className = cls;
    fb.removeAttribute('aria-hidden');
  } catch(_) {}
}

// ----- Lightweight global modal helpers -----
function hideModal(){
  try{
    const overlay = document.getElementById('app-modal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }catch(_){}
}
function showModal({ title, message, html, spriteUrl }){
  try{
    const overlay = document.getElementById('app-modal');
    const content = document.getElementById('app-modal-content');
    const closeBtn = document.getElementById('app-modal-close');
    if (!overlay || !content) return;
    // Build content
    const parts = [];
    if (title){ parts.push(`<div class="modal-title">${title}</div>`); }
    if (spriteUrl){ parts.push(`<div class="modal-sprite" style="background-image:url('${spriteUrl}')"></div>`); }
    if (message){ parts.push(`<div class="modal-msg">${message}</div>`); }
    if (html){ parts.push(String(html)); }
    content.innerHTML = parts.join('');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    // Wire closing (once)
    if (closeBtn && !closeBtn.dataset.bound){
      closeBtn.addEventListener('click', hideModal);
      overlay.addEventListener('click', (e)=>{ if (e.target === overlay) hideModal(); });
      document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') hideModal(); });
      closeBtn.dataset.bound = '1';
    }
  }catch(_){}
}

// ----- Shared UI control toggles -----
// Enable/disable Guess button, Reveal button, and input consistently across all modes
function setRoundControlsDisabled(disabled = true) {
  try {
    const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
    if (guessBtn) {
      guessBtn.disabled = !!disabled;
      guessBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  } catch (_) {}
  try {
    const revealBtn = document.getElementById('reveal-btn');
    if (revealBtn) {
      revealBtn.disabled = !!disabled;
      revealBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  } catch (_) {}
  try {
    const input = document.getElementById('guess-input');
    if (input) {
      input.disabled = !!disabled;
      input.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      if (disabled) {
        try { hideSuggestions(); } catch (_) {}
      } else {
        // ensure focus is possible again
        // no-op
      }
    }
  } catch (_) {}
}

// ----- Unified round reset helpers (reusable across all modes) -----
// Called when a wrong guess happens: resets streak only (score unchanged), persists and updates HUD.
function resetOnWrongGuess() {
  try {
    if ((state.streak || 0) !== 0) {
      state.streak = 0;
      saveStats();
      updateHUD();
    }
  } catch (_) {}
}

// Called when the user presses Reveal: reset streak and score, mark as revealed (not solved).
function resetOnReveal() {
  try {
    state.streak = 0;
    state.score = 0;
    state.revealed = true;
    state.roundSolved = false; // explicitly mark as not solved
    // End round interactions: disable Guess, Reveal and Input consistently
    try { setRoundControlsDisabled(true); } catch(_) {}
    // Mark round as no longer active (optional bookkeeping)
    try { state.roundActive = false; } catch(_) {}
    saveStats();
    updateHUD();
  } catch (_) {}
}

// Called at the beginning of a new round to penalize abandoning an unsolved round.
function resetOnAbandon() {
  try {
    if (state.roundActive && !state.roundSolved && !state.revealed) {
      state.streak = 0;
      state.score = 0;
      saveStats();
      updateHUD();
    }
  } catch (_) {}
}

// ----- Unified scoring helpers (reusable across all modes) -----
// Default scoring rules are consistent across modes unless overridden.
// By default: 100 points for a correct guess on the first try; -25 per wrong attempt; min 0.
function getScoreRules(mode = getGameId()) {
  const m = String(mode || '').toLowerCase();
  // If in future a mode needs specific tuning, add a case here.
  switch (m) {
    // example: case 'pixelate': return { base: 100, penalty: 25, min: 0 };
    default:
      return { base: 100, penalty: 25, min: 0 };
  }
}
function computePoints({ wrong = 0, mode = getGameId(), base, penalty, min } = {}) {
  const rules = Object.assign({}, getScoreRules(mode));
  if (Number.isFinite(base)) rules.base = base;
  if (Number.isFinite(penalty)) rules.penalty = penalty;
  if (Number.isFinite(min)) rules.min = min;
  const w = Math.max(0, Number(wrong) || 0);
  return Math.max(rules.min, rules.base - rules.penalty * w);
}
function awardCorrect({ wrong = 0, mode = getGameId() } = {}) {
  // Prevent awarding if already solved or revealed
  if (state.roundSolved || state.revealed) return;
  const pts = computePoints({ wrong, mode });
  state.score = (state.score || 0) + pts;
  state.streak = (state.streak || 0) + 1;
  state.roundSolved = true;
  try { saveStats(); } catch(_) {}
  try { updateHUD(); } catch(_) {}
  // Disable further interaction until Next
  try { setRoundControlsDisabled(true); } catch(_) {}
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
  // Show only first 2 generations, then "+N more"
  if (parts.length <= 2) return parts.join(', ');
  const head = parts.slice(0, 2).join(', ');
  return `${head} ${t('gen.label.more', { n: String(parts.length - 2) })}`;
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

// i18n is centralized in static/i18n.js. Use global helpers: getLang, setLang, t, translatePage.

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
  // If there was an active round that wasn't solved (and not revealed), reset score and streak
  resetOnAbandon();
  state.roundActive = true;
  state.roundSolved = false;
  state.revealed = false;
  state.attemptsWrong = 0;
  // Re-enable Guess, Reveal and Input for a fresh round
  try { setRoundControlsDisabled(false); } catch(_) {}
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
  try { if (typeof showFeedback === 'function') showFeedback('info', ''); } catch(_) {}
  const input = document.getElementById('guess-input');
  input.value = '';
  hideSuggestions();
  // Give a short moment to let the image cache; then hide skeleton
  setTimeout(() => frame?.classList.remove('loading'), 200);
}

async function checkGuess(guess) {
  const r = await (window.Api ? Api.checkGuess({ url: '/api/check-guess', token: state.token, guess, lang: getLang() }) : Promise.resolve({ ok:false, error:'API unavailable' }));
  if (!r.ok) return { error: r.error };
  return { correct: !!r.correct, name: r.name };
}

function normalizeName(s) {
  if (typeof s !== 'string') s = String(s || '');
  s = s.normalize('NFKD');
  // remove diacritics
  s = s.replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase();
  // map common locale-specific letters
  s = s.replace(/ß/g, 'ss');
  // map gender symbols to letters to match English suggestions like "Nidoran M/F"
  s = s.replace(/♂/g, 'm').replace(/♀/g, 'f');
  // remove any remaining non-alphanumeric characters
  s = s.replace(/[^a-z0-9]/g, '');
  return s;
}

async function preloadNames(lang) {
  const l = (typeof lang === 'string' && lang) ? lang : (typeof getLang==='function' ? getLang() : 'en');
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

// Suggestions logic has been moved to static/suggestions.js

// Initialize the generation fancy dropdown on every page
window.addEventListener('DOMContentLoaded', () => {
  try { initGenDropdown(); } catch (_) {}
});

// Globally clear the guess input on submit across all modes (common behavior)
// Use a microtask to avoid clearing before per-mode handlers read the value
window.addEventListener('DOMContentLoaded', () => {
  try {
    const form = document.getElementById('guess-form');
    if (!form) return;
    form.addEventListener('submit', () => {
      try {
        const input = document.getElementById('guess-input');
        if (!input) return;
        setTimeout(() => {
          input.value = '';
          try { hideSuggestions(); } catch(_) {}
        }, 0);
      } catch(_) {}
    });
  } catch(_) {}
});

window.addEventListener('DOMContentLoaded', async () => {
  // Only initialize on pages that have the sprite game section
  if (!document.querySelector('[data-game="sprite"]')) {
    return;
  }
  // Initialize language translations
  setLang(getLang());
  translatePage();

  // If RoundEngine is available, use it and skip legacy listeners
  if (window.RoundEngine) {
    const frame = document.querySelector('.sprite-frame');
    const fetchRound = async () => {
      try { frame?.classList.add('loading'); } catch(_) {}
      const r = await (window.Api ? Api.random({ kind: 'sprite' }) : Promise.resolve({ ok:false, error:'API unavailable' }));
      if (!r.ok) { try { showFeedback('error', r.error || 'Failed to load'); } catch(_) {} ; return {}; }
      const data = r.data;
      return {
        token: data.token,
        name: data.name,
        meta: { id: data.id, color: data.color, generation: data.generation, sprite: data.sprite },
        payload: data
      };
    };
    const onRoundLoaded = ({ payload }) => {
      try {
        const el = document.getElementById('sprite-crop');
        el.classList.remove('revealed');
        el.classList.add('no-anim');
        el.style.backgroundImage = `url(${payload.sprite})`;
        el.style.backgroundSize = payload.bg_size;
        el.style.backgroundPosition = payload.bg_pos;
        void el.offsetWidth;
        el.classList.remove('no-anim');
        setTimeout(() => frame?.classList.remove('loading'), 200);
      } catch(_) {}
    };
    const onCorrect = () => { try { revealFullSprite(); } catch(_) {} };
    const onWrong = () => {
      try {
        const el = document.getElementById('sprite-crop');
        if (!el) return;
        el.classList.remove('revealed');
        const cur = window.getComputedStyle(el).backgroundSize;
        if (cur !== 'contain') {
          const parts = cur.split(' ');
          const parsePct = (s) => { const v = parseFloat(s); return isNaN(v) ? null : v; };
          const w = parsePct(parts[0]);
          const h = parsePct(parts[1] || parts[0]);
          if (w && h) {
            const newW = Math.max(100, w - 25);
            const newH = Math.max(100, h - 25);
            el.style.backgroundSize = `${newW}% ${newH}%`;
          }
        }
      } catch(_) {}
    };
    const onReveal = () => { try { revealFullSprite(); } catch(_) {} };
    RoundEngine.start({ fetchRound, onRoundLoaded, onCorrect, onWrong, onReveal, checkUrl: '/api/check-guess' });
    try { initMode({ id: 'sprite' }); } catch(_) {}
    return; // engine path
  }

  // Start a new round
  newRound();

  const inputEl = document.getElementById('guess-input');
  if (inputEl && window.Suggestions){
    try { Suggestions.init({ inputEl, getExcludeNames: () => (typeof window.getExcludeNames==='function' ? window.getExcludeNames() : new Set()) }); } catch(_) {}
  }

  document.getElementById('guess-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = document.getElementById('guess-input').value.trim();
    if (!guess) return;
    const fb = document.getElementById('feedback');
    // Prevent early submissions before the round token is ready
    if (!state.token) {
      if (typeof showFeedback === 'function') showFeedback('info', 'Loading… please try again in a moment.');
      return;
    }
    const res = await checkGuess(guess);
    if (res && res.error) {
      // Surface server/network errors without penalizing the player
      if (typeof showFeedback === 'function') showFeedback('error', res.error);
      return;
    }
    if (res.correct) {
      // Award points only the first time the round is solved (centralized logic)
      awardCorrect({ wrong: state.attemptsWrong || 0, mode: getGameId() });
      if (typeof showFeedback === 'function') showFeedback('correct', t('feedback.correct', { name: res.name }));
      // Disable Guess button after a correct answer
      try {
        const guessBtn = document.querySelector('#guess-form button[type="submit"], form.guess-form button[type="submit"]');
        if (guessBtn) { guessBtn.disabled = true; guessBtn.setAttribute('aria-disabled','true'); }
      } catch(_) {}
      revealFullSprite();
    } else {
      // Increment wrong attempts and give a visual hint by zooming out
      state.attemptsWrong = (state.attemptsWrong || 0) + 1;
      // Wrong guess ends streak but keeps score
      try { resetOnWrongGuess(); } catch(_) {}
      // Feedback message for wrong guess
      if (typeof showFeedback === 'function') showFeedback('wrong', t('feedback.wrong'));
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
    if (typeof showFeedback === 'function') showFeedback('reveal', t('feedback.reveal', { name: state.answer }));
    revealFullSprite();
    // Standardized reveal handling
    resetOnReveal();
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRound();
  });
});

// -------- Mode bootstrap consistency --------
// Idempotent initializer that wires language/gen dropdowns, preloads names and starts the first round
// Usage per page: initMode({ id: 'sprite'|'entry'|'scream'|'pixelate'|'silhouette'|'tcg'|'daily', onLangChange?, onGenChange?, legacyStart? })
function initMode({ id = 'global', onLangChange, onGenChange, legacyStart } = {}){
  try {
    const key = `modeInited:${id}`;
    if (document.body && document.body.dataset[key]) return; // idempotent
    if (document.body) document.body.dataset[key] = '1';

    // Stats and HUD once
    try { loadStats(); updateHUD(); } catch(_) {}

    // Ensure guessed list component exists if container is present
    try {
      const hasChips = document.getElementById('guessed-list');
      if (hasChips && window.GuessedList){
        if (!window.__guessedInstance){
          window.__guessedInstance = GuessedList.create({ containerId: 'guessed-list' });
          window.getExcludeNames = () => (window.__guessedInstance ? window.__guessedInstance.set : new Set());
          window.resetGuessed = () => { window.__guessedInstance && window.__guessedInstance.clear(); };
          window.noteGuessed = (name) => { window.__guessedInstance && window.__guessedInstance.add(name); };
        }
      }
    } catch(_) {}

    // Initial names
    (async () => { try { await preloadNames(getLang()); } catch(_) {} })();

    // Language selector
    const langSel = document.getElementById('lang-select');
    if (langSel){
      try { langSel.value = getLang(); } catch(_) {}
      langSel.addEventListener('change', async ()=>{
        try { setLang(langSel.value); translatePage(); } catch(_) {}
        try { hideSuggestions(); } catch(_) {}
        try { await preloadNames(getLang()); } catch(_) {}
        try { if (window.__guessedInstance && window.__guessedInstance.render) window.__guessedInstance.render(); } catch(_) {}
        try { if (typeof onLangChange === 'function') onLangChange(); } catch(_) {}
        // Do NOT start a new round on language change; keep current token/state
      });
    }

    // Generation selector (skip for daily)
    if (id !== 'daily'){
      const genSel = document.getElementById('gen-select');
      if (genSel){
        try { setGenSelectValue(genSel, getGen()); } catch(_) {}
        genSel.addEventListener('change', async ()=>{
          try { const csv = readGenSelect(genSel); setGen(csv); } catch(_) {}
          try { hideSuggestions(); } catch(_) {}
          try { await preloadNames(getLang()); } catch(_) {}
          try { window.resetGuessed && window.resetGuessed(); } catch(_) {}
          try { if (typeof onGenChange === 'function') onGenChange(); } catch(_) {}
          if (window.RoundEngine) { try { RoundEngine.next(); } catch(_) {} }
          else if (typeof legacyStart === 'function') { try { legacyStart(); } catch(_) {} }
        });
      }
    }

    // Start first round if no engine auto-start
    if (!window.RoundEngine && typeof legacyStart === 'function') {
      try { legacyStart(); } catch(_) {}
    }
  } catch(_) {}
}
// expose globally
window.initMode = initMode;
