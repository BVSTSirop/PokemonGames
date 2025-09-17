// Daily Pokédle game script

// Reuse basic i18n and name suggestion approach from game.js, simplified
const I18N_DAILY = {
  en: {
    title: "Daily Pokédle",
    prompt: "Guess today’s Pokémon! Unlimited attempts until you get it.",
    guessBtn: "Guess",
    reset: "Reset",
    won: (name) => `Congrats! It was ${name}. Come back tomorrow!`,
    lost: (name) => `Keep trying! You'll get it.`
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
  return s.replace(/\s|[-'’´`\.]/g, '');
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
    if (status==='lower') return '<span title="Correct is higher" aria-label="Correct is higher">▲</span>';
    if (status==='higher') return '<span title="Correct is lower" aria-label="Correct is lower">▼</span>';
    return '';
  };
  tr.appendChild(td(guess.name));
  const types = guess.types.value || [];
  const type1 = types[0] || 'None';
  const type2 = types[1] || 'None';
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
    const evoMap = { same: 'Same', pre: 'Pre-evo', post: 'Later evo', 'same-family': 'Same family', unrelated: 'Unrelated' };
    const evVal = isAnswerRow ? 'same' : (guess.evolution.value || 'unrelated');
    tr.appendChild(td(evoMap[evVal]||evVal, evVal==='same'?'correct':(evVal==='unrelated'?'incorrect':'partial')));
  }
  const hTxtBase = typeof guess.height.value==='number' ? `${(guess.height.value/10).toFixed(1)} m` : '?';
  const wTxtBase = typeof guess.weight.value==='number' ? `${(guess.weight.value/10).toFixed(1)} kg` : '?';
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
    const j = await res.json().catch(()=>({error:'Error'}));
    statusText(j.error||'Error', 'incorrect');
    return null;
  }
  return await res.json();
}

window.addEventListener('DOMContentLoaded', async ()=>{
  if (!document.querySelector('[data-game="daily"]')) return;

  // Initialize language and UI
  setLang(getLang());
  const langSel = document.getElementById('lang-select');
  if (langSel) {
    langSel.value = getLang();
    langSel.addEventListener('change', async () => {
      setLang(langSel.value);
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
    statusText(`Congrats! It was ${day.answer}. Come back tomorrow!`, 'correct');
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
    if (day.done){ statusText('Come back tomorrow for a new Pokémon!', 'reveal'); return; }
    // Prevent duplicate guesses for today
    const nn = normalizeName(text);
    if (guessedTodaySet().has(nn)){
      statusText('You already guessed that Pokémon today.', 'reveal');
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
      statusText(`Congrats! It was ${res.answer}. Come back tomorrow!`, 'correct');
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
