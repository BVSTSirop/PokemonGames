// Daily Pokédle game script

// Reuse basic i18n and name suggestion approach from game.js, simplified
const I18N_DAILY = {
  en: {
    'daily.title': 'Daily Pokédle',
    'daily.prompt': 'Guess today’s Pokémon!',
    'daily.reset': 'Reset',
    'daily.th.name': 'Pokémon',
    'daily.th.type1': 'Type 1',
    'daily.th.type2': 'Type 2',
    'daily.th.gen': 'Gen',
    'daily.th.evo': 'Evolution',
    'daily.th.height': 'Height',
    'daily.th.weight': 'Weight',
    'daily.th.color': 'Color',
    'daily.arrow.higher': 'Correct is higher',
    'daily.arrow.lower': 'Correct is lower',
    'daily.none': '-',
    'daily.units.m': 'm',
    'daily.units.kg': 'kg',
    'daily.status.error': 'Error',
    'daily.status.already': 'You already guessed that Pokémon today.',
    'daily.status.tomorrow': 'Come back tomorrow for a new Pokémon!',
    'daily.status.won': 'Congrats! It was {name}. Come back tomorrow!',
    // Reuse shared form keys for consistency
    'form.label': 'Your guess',
    'form.placeholder': 'Type a Pokémon name...',
    'form.guessBtn': 'Guess',
  },
  es: {
    'daily.title': 'Pokédle diario',
    'daily.prompt': '¡Adivina el Pokémon de hoy!',
    'daily.reset': 'Reiniciar',
    'daily.th.name': 'Pokémon',
    'daily.th.type1': 'Tipo 1',
    'daily.th.type2': 'Tipo 2',
    'daily.th.gen': 'Gen',
    'daily.th.evo': 'Evolución',
    'daily.th.height': 'Altura',
    'daily.th.weight': 'Peso',
    'daily.th.color': 'Color',
    'daily.arrow.higher': 'El correcto es mayor',
    'daily.arrow.lower': 'El correcto es menor',
    'daily.none': '-',
    'daily.units.m': 'm',
    'daily.units.kg': 'kg',
    'daily.status.error': 'Error',
    'daily.status.already': 'Ya adivinaste ese Pokémon hoy.',
    'daily.status.tomorrow': '¡Vuelve mañana por un nuevo Pokémon!',
    'daily.status.won': '¡Felicidades! Era {name}. ¡Vuelve mañana!',
    'form.label': 'Tu respuesta',
    'form.placeholder': 'Escribe un nombre de Pokémon...',
    'form.guessBtn': 'Adivinar',
  },
  fr: {
    'daily.title': 'Pokédle du jour',
    'daily.prompt': 'Devinez le Pokémon du jour!',
    'daily.reset': 'Réinitialiser',
    'daily.th.name': 'Pokémon',
    'daily.th.type1': 'Type 1',
    'daily.th.type2': 'Type 2',
    'daily.th.gen': 'Gen',
    'daily.th.evo': 'Évolution',
    'daily.th.height': 'Taille',
    'daily.th.weight': 'Poids',
    'daily.th.color': 'Couleur',
    'daily.arrow.higher': 'La bonne réponse est plus grande',
    'daily.arrow.lower': 'La bonne réponse est plus petite',
    'daily.none': '-',
    'daily.units.m': 'm',
    'daily.units.kg': 'kg',
    'daily.status.error': 'Erreur',
    'daily.status.already': 'Vous avez déjà proposé ce Pokémon aujourd’hui.',
    'daily.status.tomorrow': 'Revenez demain pour un nouveau Pokémon !',
    'daily.status.won': 'Bravo ! C’était {name}. Revenez demain !',
    'form.label': 'Votre réponse',
    'form.placeholder': 'Saisissez un nom de Pokémon…',
    'form.guessBtn': 'Deviner',
  },
  de: {
    'daily.title': 'Tägliches Pokédle',
    'daily.prompt': 'Errate das heutige Pokémon!',
    'daily.reset': 'Zurücksetzen',
    'daily.th.name': 'Pokémon',
    'daily.th.type1': 'Typ 1',
    'daily.th.type2': 'Typ 2',
    'daily.th.gen': 'Gen',
    'daily.th.evo': 'Entwicklung',
    'daily.th.height': 'Größe',
    'daily.th.weight': 'Gewicht',
    'daily.th.color': 'Farbe',
    'daily.arrow.higher': 'Die richtige ist höher',
    'daily.arrow.lower': 'Die richtige ist niedriger',
    'daily.none': '-',
    'daily.units.m': 'm',
    'daily.units.kg': 'kg',
    'daily.status.error': 'Fehler',
    'daily.status.already': 'Diesen Pokémon-Namen hast du heute schon geraten.',
    'daily.status.tomorrow': 'Komm morgen für ein neues Pokémon wieder!',
    'daily.status.won': 'Glückwunsch! Es war {name}. Komm morgen wieder!',
    'form.label': 'Dein Tipp',
    'form.placeholder': 'Gib einen Pokémon-Namen ein…',
    'form.guessBtn': 'Raten',
  }
};

// Localized labels for types and colors used in Daily page
const TYPE_I18N = {
  en: {
    normal: 'Normal', fire: 'Fire', water: 'Water', grass: 'Grass', electric: 'Electric', ice: 'Ice', fighting: 'Fighting', poison: 'Poison', ground: 'Ground', flying: 'Flying', psychic: 'Psychic', bug: 'Bug', rock: 'Rock', ghost: 'Ghost', dragon: 'Dragon', dark: 'Dark', steel: 'Steel', fairy: 'Fairy'
  },
  es: {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada'
  },
  fr: {
    normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée'
  },
  de: {
    normal: 'Normal', fire: 'Feuer', water: 'Wasser', grass: 'Pflanze', electric: 'Elektro', ice: 'Eis', fighting: 'Kampf', poison: 'Gift', ground: 'Boden', flying: 'Flug', psychic: 'Psycho', bug: 'Käfer', rock: 'Gestein', ghost: 'Geist', dragon: 'Drache', dark: 'Unlicht', steel: 'Stahl', fairy: 'Fee'
  }
};
const COLOR_I18N = {
  en: { black:'Black', blue:'Blue', brown:'Brown', gray:'Gray', green:'Green', pink:'Pink', purple:'Purple', red:'Red', white:'White', yellow:'Yellow' },
  es: { black:'Negro', blue:'Azul', brown:'Marrón', gray:'Gris', green:'Verde', pink:'Rosa', purple:'Morado', red:'Rojo', white:'Blanco', yellow:'Amarillo' },
  fr: { black:'Noir', blue:'Bleu', brown:'Marron', gray:'Gris', green:'Vert', pink:'Rose', purple:'Violet', red:'Rouge', white:'Blanc', yellow:'Jaune' },
  de: { black:'Schwarz', blue:'Blau', brown:'Braun', gray:'Grau', green:'Grün', pink:'Rosa', purple:'Lila', red:'Rot', white:'Weiß', yellow:'Gelb' }
};
function localizeType(slug, lang = (typeof getLang==='function'? getLang() : 'en')){
  const m = TYPE_I18N[lang] || TYPE_I18N.en;
  return (slug && m[slug]) ? m[slug] : (slug || (typeof t==='function'? t('daily.none'):'-'));
}
function localizeColor(slug, lang = (typeof getLang==='function'? getLang() : 'en')){
  const m = COLOR_I18N[lang] || COLOR_I18N.en;
  return (slug && m[slug]) ? m[slug] : (slug || '-');
}

// Autocomplete using shared /api/all-names
// Use the shared global cache from game.js if present to avoid redeclaration errors
window.ALL_NAMES = window.ALL_NAMES || {};
// Use shared helpers from game.js (preloadNames, renderSuggestions, hideSuggestions, debouncedSuggest, selectSuggestion)
// game.js is included via base.html before this script

// Daily state stored per UTC day key
function todayKey(){ const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0,10); }
function loadDaily(){
  try { return JSON.parse(localStorage.getItem('daily')||'{}'); } catch(_){ return {}; }
}
function saveDaily(s){ try { localStorage.setItem('daily', JSON.stringify(s||{})); } catch(_){}
}

// Return a Set of normalized names already guessed today (based on localStorage)
function guessedTodaySet(){
  try{
    const key = todayKey();
    const daily = loadDaily();
    const day = daily[key] || {};
    const rows = Array.isArray(day.rows) ? day.rows : [];
    const out = new Set();
    for (const r of rows){ if (r && r.name){ out.add(normalizeName(r.name)); } }
    return out;
  }catch(_){ return new Set(); }
}
// Also collect guessed species ids (preferred for duplicate prevention across languages)
function guessedTodayIdSet(){
  try{
    const key = todayKey();
    const daily = loadDaily();
    const day = daily[key] || {};
    const rows = Array.isArray(day.rows) ? day.rows : [];
    const out = new Set();
    for (const r of rows){ if (r && r.species_id){ out.add(Number(r.species_id)); } }
    return out;
  }catch(_){ return new Set(); }
}
// Expose exclusion set for shared suggestions so already-guessed names are skipped
window.getExcludeNames = () => guessedTodaySet();

function statusText(msg, cls){ const el = document.getElementById('status'); el.textContent = msg||''; el.className = 'feedback' + (cls?(' prominent '+cls):''); }

async function translateAndRerenderCurrentDay(){
  try{
    const key = todayKey();
    const daily = loadDaily();
    const day = daily[key];
    if (!day || !Array.isArray(day.rows) || day.rows.length === 0) return;
    const ids = Array.from(new Set(day.rows.map(r => r && r.species_id).filter(Boolean)));
    if (ids.length === 0) return;
    const res = await fetch('/api/daily/translate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids, lang: getLang() }) });
    if (!res.ok) return;
    const j = await res.json().catch(()=>({names:{}}));
    const map = j.names || {};
    let changed = false;
    for (const r of day.rows){
      if (r && r.species_id){
        const nm = map[String(r.species_id)];
        if (nm && r.name !== nm){ r.name = nm; changed = true; }
      }
    }
    if (day.done && day.win && day.answer_id){
      const nm = map[String(day.answer_id)];
      if (nm && day.answer !== nm){ day.answer = nm; changed = true; }
    }
    // Re-render table to apply localized names, types, and colors regardless of whether names changed
    const tbody = document.getElementById('rows');
    if (tbody){ tbody.innerHTML = ''; for (const row of day.rows){ renderRow(row); } }
    // Update status text if already won
    if (day.done && day.win && day.answer){
      const msg = (typeof t==='function'? t('daily.status.won', { name: day.answer }):`Congrats! It was ${day.answer}. Come back tomorrow!`);
      statusText(msg, 'correct');
    }
    daily[key] = day; saveDaily(daily);
    // Update CURRENT_DAY reference
    try { CURRENT_DAY = day; } catch(_){ }
  }catch(_){ }
}

// Track current day metadata so we can correct rendering of the actual answer row
let CURRENT_DAY = null;

function renderRow(guess, animate = false){
  // If this row is the actual correct answer (based on saved day meta),
  // normalize all statuses to correct/same to avoid stale data from older saves.
  const isAnswerRow = !!(CURRENT_DAY && CURRENT_DAY.done && CURRENT_DAY.win && CURRENT_DAY.answer && guess && guess.name && CURRENT_DAY.answer === guess.name);

  const tr = document.createElement('tr');
  // Create a table cell with content and a status class mapped for cell coloring
  const td = (html, status = '') => {
    const c = document.createElement('td');
    c.style.padding = '8px';
    c.innerHTML = html;
    // Binary mapping: only 'correct' (or legacy 'same') is green; everything else red
    const cl = (status === 'correct' || status === 'same') ? 'correct' : (status ? 'incorrect' : '');
    if (cl) c.classList.add(cl);
    return c;
  };
  const arrowFor = (dir, legacyStatus)=>{
    const d = dir || legacyStatus;
    if (d==='lower') return `<span title="${(typeof t==='function'? t('daily.arrow.higher'):'Correct is higher')}" aria-label="${(typeof t==='function'? t('daily.arrow.higher'):'Correct is higher')}">▲</span>`;
    if (d==='higher') return `<span title="${(typeof t==='function'? t('daily.arrow.lower'):'Correct is lower')}" aria-label="${(typeof t==='function'? t('daily.arrow.lower'):'Correct is lower')}">▼</span>`;
    return '';
  };
  tr.appendChild(td(guess.name));
  const types = guess.types.value || [];
  const none = (typeof t==='function'? t('daily.none'):'-');
  const type1 = types[0] ? localizeType(types[0]) : none;
  const type2 = types[1] ? localizeType(types[1]) : none;
  let tStatuses = Array.isArray(guess.types.status) ? guess.types.status.slice(0,2) : [guess.types.status, guess.types.status];
  if (isAnswerRow) {
    tStatuses = ['correct','correct'];
  }
  tr.appendChild(td(type1, tStatuses[0] || 'wrong'));
  tr.appendChild(td(type2, tStatuses[1] || 'wrong'));
  const genLabel = guess.generation.value ? `Gen ${guess.generation.value}` : '?';
  const genStatus = isAnswerRow ? 'correct' : (guess.generation.status || 'wrong');
  const genDir = isAnswerRow ? null : (guess.generation.dir || null);
  const genCell = `${arrowFor(genDir, guess.generation.status)} ${genLabel}`.trim();
  tr.appendChild(td(genCell, genStatus));
  // Evolution: display only the numeric stage (1, 2, or 3) with directional arrow
  const evoStage = guess.evo_stage;
  const evoStageStatus = isAnswerRow ? 'correct' : (evoStage ? (evoStage.status || 'wrong') : 'wrong');
  if (evoStage && evoStage.value) {
    const s = evoStage.value.stage;
    let evoLabel = '?';
    if (typeof s === 'number') {
      evoLabel = String(s);
    }
    const evoDir = isAnswerRow ? null : (evoStage.dir || null);
    const evoCell = `${arrowFor(evoDir, evoStage.status)} ${evoLabel}`.trim();
    tr.appendChild(td(evoCell, evoStageStatus));
  } else {
    // Fallback to legacy categorical labels
    const evoMap = {
      same: (typeof t==='function'? t('daily.evo.same'):'Same'),
      pre: (typeof t==='function'? t('daily.evo.pre'):'Pre-evo'),
      post: (typeof t==='function'? t('daily.evo.post'):'Later evo'),
      'same-family': (typeof t==='function'? t('daily.evo.sameFamily'):'Same family'),
      unrelated: (typeof t==='function'? t('daily.evo.unrelated'):'Unrelated')
    };
    const evVal = isAnswerRow ? 'same' : (guess.evolution.value || 'unrelated');
    tr.appendChild(td(evoMap[evVal]||evVal, evVal==='same'?'correct':(evVal==='unrelated'?'incorrect':'partial')));
  }
  const mUnit = (typeof t==='function'? t('daily.units.m'):'m');
  const kgUnit = (typeof t==='function'? t('daily.units.kg'):'kg');
  const hTxtBase = typeof guess.height.value==='number' ? `${(guess.height.value/10).toFixed(1)} ${mUnit}` : '?';
  const wTxtBase = typeof guess.weight.value==='number' ? `${(guess.weight.value/10).toFixed(1)} ${kgUnit}` : '?';
  const hStatus = isAnswerRow ? 'correct' : (guess.height.status || 'wrong');
  const wStatus = isAnswerRow ? 'correct' : (guess.weight.status || 'wrong');
  const hDir = isAnswerRow ? null : (guess.height.dir || null);
  const wDir = isAnswerRow ? null : (guess.weight.dir || null);
  const hTxt = `${arrowFor(hDir, guess.height.status)} ${hTxtBase}`.trim();
  const wTxt = `${arrowFor(wDir, guess.weight.status)} ${wTxtBase}`.trim();
  tr.appendChild(td(hTxt, hStatus));
  tr.appendChild(td(wTxt, wStatus));
  const colorStatus = isAnswerRow ? 'correct' : guess.color.status;
  const colorText = guess.color.value ? localizeColor(guess.color.value) : '-';
  tr.appendChild(td(colorText, colorStatus));
  const rowsEl = document.getElementById('rows');
  if (rowsEl.firstChild) {
    rowsEl.insertBefore(tr, rowsEl.firstChild);
  } else {
    rowsEl.appendChild(tr);
  }
  // Animate reveal of cells left-to-right for newly added row only
  try {
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && !prefersReduced) {
      const cells = Array.from(tr.querySelectorAll('td'));
      // Initialize hidden state
      cells.forEach(td => td.classList.add('cell-hidden'));
      // Staggered reveal
      cells.forEach((td, i) => {
        setTimeout(() => td.classList.remove('cell-hidden'), 200 * i);
      });
    }
  } catch(_) {}
  return tr;
}

async function submitGuess(text){
  const res = await fetch('/api/daily/guess', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess: text, lang: getLang() })
  });
  if (!res.ok){
    const j = await res.json().catch(()=>({error:(typeof t==='function'? t('daily.status.error'):'Error')}));
    statusText(j.error || (typeof t==='function'? t('daily.status.error'):'Error'), 'incorrect');
    return null;
  }
  return await res.json();
}

window.addEventListener('DOMContentLoaded', async ()=>{
  if (!document.querySelector('[data-game="daily"]')) return;

  // Initialize language and UI
  setLang(getLang());
  // Merge Daily page translations into global I18N if available (from game.js)
  try {
    Object.keys(I18N_DAILY).forEach(l => { Object.assign(I18N[l] = I18N[l] || {}, I18N_DAILY[l]); });
  } catch (_) {}
  // Apply translations to the page
  try { if (typeof translatePage === 'function') translatePage(); } catch(_) {}

  // Daily mode: force All Generations and disable the gen selector UI
  try {
    // Always store and use 'all' for daily
    if (typeof setGen === 'function') {
      try { setGen('all'); } catch(_) {}
      // Override setter to ignore changes while on the daily page
      try { window.setGen = function(){ try { localStorage.setItem('gen','all'); } catch(_) {} }; } catch(_) {}
    } else {
      try { localStorage.setItem('gen','all'); } catch(_) {}
    }
    const genSel = document.getElementById('gen-select');
    if (genSel) {
      try { setGenSelectValue && setGenSelectValue(genSel, 'all'); } catch(_) {}
      genSel.setAttribute('disabled','true');
      genSel.setAttribute('aria-disabled','true');
    }
    const dd = document.getElementById('gen-dropdown');
    const toggle = document.getElementById('gen-dropdown-toggle');
    const menu = document.getElementById('gen-dropdown-menu');
    if (dd && toggle && menu) {
      // Ensure UI reflects 'All Generations'
      try { syncGenDropdownFromSelect && syncGenDropdownFromSelect(); } catch(_) {}
      // Disable interactions
      toggle.setAttribute('disabled','true');
      toggle.setAttribute('aria-disabled','true');
      toggle.title = 'All Generations';
      // Disable checkboxes and force only 'all' checked
      Array.from(menu.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        cb.checked = (cb.value === 'all');
        cb.disabled = true;
      });
      // Also make sure the label text says All Generations
      const labelSpan = dd.querySelector('.gen-label');
      if (labelSpan) labelSpan.textContent = 'All Generations';
      // Close menu if it was opened by earlier init
      menu.classList.remove('open');
    }
  } catch(_) {}

  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
      // Re-apply translations on language change
      try { if (typeof translatePage === 'function') translatePage(); } catch(_) {}
      hideSuggestions();
      try { await preloadNames(getLang()); } catch (_) {}
      try { await translateAndRerenderCurrentDay(); } catch(_) {}
    });
  }

  try { await preloadNames(getLang()); } catch(_){ }

  // restore previous attempts for today
  const key = todayKey();
  const daily = loadDaily();
  const day = daily[key] || { rows: [], done: false, answer: null };
  CURRENT_DAY = day;
  for (const row of day.rows){ renderRow(row); }
  if (day.done && day.win){
    const msg = (typeof t==='function'? t('daily.status.won', { name: day.answer }):`Congrats! It was ${day.answer}. Come back tomorrow!`);
    statusText(msg, 'correct');
  }

  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e)=>{ if (typeof debouncedSuggest==='function') debouncedSuggest(e.target.value.trim()); });
  if (typeof handleKeyNav === 'function') {
    inputEl.addEventListener('keydown', handleKeyNav);
  }
  inputEl.addEventListener('blur', ()=> setTimeout(()=>{ if (typeof hideSuggestions==='function') hideSuggestions(); }, 100));

  document.getElementById('daily-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    if (day.done){ statusText((typeof t==='function'? t('daily.status.tomorrow'):'Come back tomorrow for a new Pokémon!'), 'reveal'); return; }
    // Prevent duplicate guesses for today
    const nn = normalizeName(text);
    if (guessedTodaySet().has(nn)){
      statusText((typeof t==='function'? t('daily.status.already'):'You already guessed that Pokémon today.'), 'reveal');
      hideSuggestions();
      return;
    }
    const res = await submitGuess(text);
    if (!res) return;
    // Prevent duplicate by species id across languages (post-response)
    try{
      const idSet = guessedTodayIdSet();
      const gid = res && res.guess && res.guess.species_id ? Number(res.guess.species_id) : null;
      if (gid && idSet.has(gid)){
        statusText((typeof t==='function'? t('daily.status.already'):'You already guessed that Pokémon today.'), 'reveal');
        inputEl.value = '';
        hideSuggestions();
        return;
      }
    }catch(_){}
    // If the guess is correct, mark the day state before rendering so the row renders as the answer
    if (res.correct){
      day.done = true; day.win = true; day.answer = res.answer; day.answer_id = res && res.guess ? res.guess.species_id : day.answer_id;
      CURRENT_DAY = day;
    }
    renderRow(res.guess, true);
    day.rows.push(res.guess);
    if (res.correct){
      const msg = (typeof t==='function'? t('daily.status.won', { name: res.answer }):`Congrats! It was ${res.answer}. Come back tomorrow!`);
      statusText(msg, 'correct');
    } else {
      // No attempts counter; keep status area empty on wrong guess
      statusText('', '');
    }
    daily[key] = day; saveDaily(daily);
    inputEl.value = '';
    hideSuggestions();
  });

  document.getElementById('reset-btn').addEventListener('click', ()=>{
    const d = loadDaily();
    delete d[key];
    saveDaily(d);
    document.getElementById('rows').innerHTML = '';
    statusText('', '');
  });
});
