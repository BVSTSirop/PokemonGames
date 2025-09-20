// Daily Pokédle game script

// Reuse basic i18n and name suggestion approach from game.js, simplified
const I18N_DAILY = {
  en: {
    'daily.title': 'Daily Pokédle',
    'daily.prompt': 'Guess today’s Pokémon! Unlimited attempts until you get it.',
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
    'daily.prompt': '¡Adivina el Pokémon de hoy! Intentos ilimitados hasta acertar.',
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
    'daily.prompt': 'Devinez le Pokémon du jour ! Tentatives illimitées jusqu’à réussir.',
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
    'daily.prompt': 'Errate das heutige Pokémon! Unbegrenzt viele Versuche bis zum Treffer.',
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

function getLang() {
  const saved = localStorage.getItem('lang');
  return saved || 'en';
}
function setLang(lang){
  const supported = ['en','es','fr','de'];
  const l = supported.includes(lang) ? lang : 'en';
  try { localStorage.setItem('lang', l); } catch(_){ }
  try { document.documentElement.setAttribute('lang', l); } catch(_){ }
}

// Autocomplete using shared /api/all-names
// Use the shared global cache from game.js if present to avoid redeclaration errors
window.ALL_NAMES = window.ALL_NAMES || {};
function normalizeName(s){
  if (typeof s !== 'string') s = String(s||'');
  s = s.normalize('NFKD');
  s = s.replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // map common locale-specific letters
  s = s.replace(/ß/g, 'ss');
  // remove gender symbols and any non-alphanumeric characters
  s = s.replace(/[♂♀]/g, '');
  s = s.replace(/[^a-z0-9]/g, '');
  return s;
}
async function preloadNames(lang){
  const l = ['en','es','fr','de'].includes(lang) ? lang : 'en';
  if (ALL_NAMES[l]) return ALL_NAMES[l];
  const res = await fetch(`/api/all-names?lang=${encodeURIComponent(l)}`);
  const data = await res.json();
  ALL_NAMES[l] = Array.isArray(data) ? data : [];
  return ALL_NAMES[l];
}
function renderSuggestions(items){
  const box = document.getElementById('suggestions');
  box.innerHTML = '';
  if (!items || items.length===0){ box.classList.remove('visible'); return; }
  items.forEach((n, idx)=>{
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.setAttribute('role','option');
    div.id = `sugg-${idx}`;
    div.textContent = n;
    div.addEventListener('mousedown', (e)=>{ e.preventDefault(); selectSuggestion(n); });
    box.appendChild(div);
  });
  box.classList.add('visible');
}
function hideSuggestions(){
  const box = document.getElementById('suggestions');
  box.classList.remove('visible');
  box.innerHTML = '';
  const input = document.getElementById('guess-input');
  if (input) input.setAttribute('aria-expanded', 'false');
}
function debounce(fn, delay){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), delay); }; }
const debouncedSuggest = debounce(async (q)=>{
  if (!q) { hideSuggestions(); return; }
  try{
    await preloadNames(getLang());
    const names = ALL_NAMES[getLang()]||[];
    const qn = normalizeName(q);
    const guessed = guessedTodaySet();
    const starts=[]; const contains=[];
    for (const n of names){
      const nn = normalizeName(n);
      if (guessed.has(nn)) continue; // skip already guessed
      if (nn.startsWith(qn)) starts.push(n); else if (nn.includes(qn)) contains.push(n);
      if (starts.length>=20) break;
    }
    const list = starts.length<20 ? starts.concat(contains).slice(0,20) : starts.slice(0,20);
    renderSuggestions(list);
    document.getElementById('guess-input').setAttribute('aria-expanded', list && list.length ? 'true':'false');
  }catch(_){ hideSuggestions(); }
}, 250);
function selectSuggestion(text){ const input=document.getElementById('guess-input'); input.value=text; hideSuggestions(); input.focus(); }

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

function statusText(msg, cls){ const el = document.getElementById('status'); el.textContent = msg||''; el.className = 'feedback' + (cls?(' prominent '+cls):''); }

// Track current day metadata so we can correct rendering of the actual answer row
let CURRENT_DAY = null;

function renderRow(guess){
  // If this row is the actual correct answer (based on saved day meta),
  // normalize all statuses to correct/same to avoid stale data from older saves.
  const isAnswerRow = !!(CURRENT_DAY && CURRENT_DAY.done && CURRENT_DAY.win && CURRENT_DAY.answer && guess && guess.name && CURRENT_DAY.answer === guess.name);

  const tr = document.createElement('tr');
  // Create a table cell with content and a status class mapped for cell coloring
  const td = (html, status = '') => {
    const c = document.createElement('td');
    c.style.padding = '8px';
    c.innerHTML = html;
    // Map statuses to cell classes (reuse .correct/.reveal/.incorrect colors)
    let cl = '';
    if (status === 'correct' || status === 'same') cl = 'correct';
    else if (status === 'partial' || status === 'higher' || status === 'lower' || status === 'same-family' || status === 'pre' || status === 'post' || status === 'unknown') cl = 'reveal';
    else if (status) cl = 'incorrect';
    if (cl) c.classList.add(cl);
    return c;
  };
  const arrowFor = (status)=>{
    if (status==='lower') return `<span title="${(window.t?window.t('daily.arrow.higher'):'Correct is higher')}" aria-label="${(window.t?window.t('daily.arrow.higher'):'Correct is higher')}">▲</span>`;
    if (status==='higher') return `<span title="${(window.t?window.t('daily.arrow.lower'):'Correct is lower')}" aria-label="${(window.t?window.t('daily.arrow.lower'):'Correct is lower')}">▼</span>`;
    return '';
  };
  tr.appendChild(td(guess.name));
  const types = guess.types.value || [];
  const none = (window.t?window.t('daily.none'):'-');
  const type1 = types[0] || none;
  const type2 = types[1] || none;
  let tStatuses = Array.isArray(guess.types.status) ? guess.types.status.slice(0,2) : [guess.types.status, guess.types.status];
  if (isAnswerRow) {
    tStatuses = ['correct','correct'];
  }
  tr.appendChild(td(type1, tStatuses[0] || 'wrong'));
  tr.appendChild(td(type2, tStatuses[1] || 'wrong'));
  const genLabel = guess.generation.value ? `Gen ${guess.generation.value}` : '?';
  const genStatus = isAnswerRow ? 'same' : guess.generation.status;
  const genCell = `${arrowFor(genStatus)} ${genLabel}`.trim();
  tr.appendChild(td(genCell, genStatus));
  // Evolution: display only the numeric stage (1, 2, or 3) with directional arrow
  const evoStage = guess.evo_stage;
  const evoStageStatus = isAnswerRow ? 'same' : (evoStage ? evoStage.status : 'unknown');
  if (evoStage && evoStage.value) {
    const s = evoStage.value.stage;
    let evoLabel = '?';
    if (typeof s === 'number') {
      evoLabel = String(s);
    }
    const evoCell = `${arrowFor(evoStageStatus)} ${evoLabel}`.trim();
    tr.appendChild(td(evoCell, evoStageStatus));
  } else {
    // Fallback to legacy categorical labels
    const evoMap = {
      same: (window.t?window.t('daily.evo.same'):'Same'),
      pre: (window.t?window.t('daily.evo.pre'):'Pre-evo'),
      post: (window.t?window.t('daily.evo.post'):'Later evo'),
      'same-family': (window.t?window.t('daily.evo.sameFamily'):'Same family'),
      unrelated: (window.t?window.t('daily.evo.unrelated'):'Unrelated')
    };
    const evVal = isAnswerRow ? 'same' : (guess.evolution.value || 'unrelated');
    tr.appendChild(td(evoMap[evVal]||evVal, evVal==='same'?'correct':(evVal==='unrelated'?'incorrect':'partial')));
  }
  const mUnit = (window.t?window.t('daily.units.m'):'m');
  const kgUnit = (window.t?window.t('daily.units.kg'):'kg');
  const hTxtBase = typeof guess.height.value==='number' ? `${(guess.height.value/10).toFixed(1)} ${mUnit}` : '?';
  const wTxtBase = typeof guess.weight.value==='number' ? `${(guess.weight.value/10).toFixed(1)} ${kgUnit}` : '?';
  const hStatus = isAnswerRow ? 'same' : guess.height.status;
  const wStatus = isAnswerRow ? 'same' : guess.weight.status;
  const hTxt = `${arrowFor(hStatus)} ${hTxtBase}`.trim();
  const wTxt = `${arrowFor(wStatus)} ${wTxtBase}`.trim();
  tr.appendChild(td(hTxt, hStatus));
  tr.appendChild(td(wTxt, wStatus));
  const colorStatus = isAnswerRow ? 'correct' : guess.color.status;
  tr.appendChild(td(guess.color.value||'-', colorStatus));
  document.getElementById('rows').appendChild(tr);
}

async function submitGuess(text){
  const res = await fetch('/api/daily/guess', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess: text, lang: getLang() })
  });
  if (!res.ok){
    const j = await res.json().catch(()=>({error:(window.t?window.t('daily.status.error'):'Error')}));
    statusText(j.error || (window.t?window.t('daily.status.error'):'Error'), 'incorrect');
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
    if (typeof window.I18N !== 'undefined') {
      Object.keys(I18N_DAILY).forEach(l => { Object.assign(I18N[l] = I18N[l] || {}, I18N_DAILY[l]); });
    }
  } catch (_) {}
  // Apply translations to the page
  try { if (typeof window.translatePage === 'function') translatePage(); } catch(_) {}

  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
      // Re-apply translations on language change
      try { if (typeof window.translatePage === 'function') translatePage(); } catch(_) {}
      hideSuggestions();
      try { await preloadNames(getLang()); } catch (_) {}
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
    const msg = (window.t?window.t('daily.status.won', { name: day.answer }):`Congrats! It was ${day.answer}. Come back tomorrow!`);
    statusText(msg, 'correct');
  }

  const inputEl = document.getElementById('guess-input');
  inputEl.addEventListener('input', (e)=>{ debouncedSuggest(e.target.value.trim()); });
  inputEl.addEventListener('keydown', (e)=>{
    const box = document.getElementById('suggestions');
    const items = Array.from(box.querySelectorAll('.suggestion-item'));
    if (!box.classList.contains('visible') || items.length===0) return;
    const current = items.findIndex(i=>i.classList.contains('active'));
    if (e.key==='ArrowDown'){ e.preventDefault(); const next=current<items.length-1?current+1:0; items.forEach(i=>i.classList.remove('active')); items[next].classList.add('active'); items[next].scrollIntoView({block:'nearest'}); }
    else if (e.key==='ArrowUp'){ e.preventDefault(); const prev=current>0?current-1:items.length-1; items.forEach(i=>i.classList.remove('active')); items[prev].classList.add('active'); items[prev].scrollIntoView({block:'nearest'}); }
    else if (e.key==='Enter'){ if (current>=0){ e.preventDefault(); selectSuggestion(items[current].textContent); } }
    else if (e.key==='Escape'){ hideSuggestions(); }
  });
  inputEl.addEventListener('blur', ()=> setTimeout(hideSuggestions, 100));

  document.getElementById('daily-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    if (day.done){ statusText((window.t?window.t('daily.status.tomorrow'):'Come back tomorrow for a new Pokémon!'), 'reveal'); return; }
    // Prevent duplicate guesses for today
    const nn = normalizeName(text);
    if (guessedTodaySet().has(nn)){
      statusText((window.t?window.t('daily.status.already'):'You already guessed that Pokémon today.'), 'reveal');
      hideSuggestions();
      return;
    }
    const res = await submitGuess(text);
    if (!res) return;
    renderRow(res.guess);
    day.rows.push(res.guess);
    if (res.correct){
      day.done = true; day.win = true; day.answer = res.answer;
      CURRENT_DAY = day;
      const msg = (window.t?window.t('daily.status.won', { name: res.answer }):`Congrats! It was ${res.answer}. Come back tomorrow!`);
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
