// Suggestions module: reusable client-side suggestions and keyboard navigation
// Exposes window.Suggestions with init({ inputEl, getExcludeNames, onSelect, limit, namesProvider })
// Also provides global delegation functions used by legacy code and RoundEngine:
//   debouncedSuggest(query), hideSuggestions(), handleKeyNav(event), selectSuggestion(name)
(function(){
  const DEFAULT_LIMIT = 20;

  function localNormalizeName(s){
    try {
      if (typeof window.normalizeName === 'function') return window.normalizeName(s);
    } catch(_) {}
    if (typeof s !== 'string') s = String(s || '');
    s = s.normalize('NFKD');
    s = s.replace(/[\u0300-\u036f]/g, '');
    s = s.toLowerCase();
    s = s.replace(/ß/g, 'ss');
    s = s.replace(/♂/g, 'm').replace(/♀/g, 'f');
    s = s.replace(/[^a-z0-9]/g, '');
    return s;
  }

  function debounce(fn, delay){
    let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), delay); };
  }

  async function defaultNamesProvider(){
    // Prefer app-level preloadNames(getLang()), else fallback to API
    try {
      if (typeof window.preloadNames === 'function' && typeof window.getLang === 'function'){
        return await window.preloadNames(window.getLang());
      }
    } catch(_) {}
    try {
      const lang = (typeof window.getLang==='function'? window.getLang() : 'en');
      const gen = (typeof window.getGen==='function'? window.getGen() : '');
      const res = await fetch(`/api/all-names?lang=${encodeURIComponent(lang)}&gen=${encodeURIComponent(gen)}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch(_) { return []; }
  }

  const Suggestions = {
    _inst: null,
    init({ inputEl, getExcludeNames, onSelect, limit = DEFAULT_LIMIT, namesProvider } = {}){
      if (!inputEl) return null;
      const listBox = document.getElementById('suggestions');
      const state = {
        items: [],
        activeIndex: -1,
        limit: Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
        getExcludeNames: typeof getExcludeNames === 'function' ? getExcludeNames : (()=> new Set()),
        provider: typeof namesProvider === 'function' ? namesProvider : defaultNamesProvider,
        onSelect: typeof onSelect === 'function' ? onSelect : ((name)=>{ try { inputEl.value = name; } catch(_) {} })
      };

      function render(items){
        if (!listBox) return;
        listBox.innerHTML = '';
        if (!items || items.length === 0){ listBox.classList.remove('visible'); inputEl.setAttribute('aria-expanded','false'); return; }
        items.forEach((n, idx)=>{
          const div = document.createElement('div');
          div.className = 'suggestion-item';
          div.setAttribute('role','option');
          div.setAttribute('id', `sugg-${idx}`);
          div.textContent = n;
          div.addEventListener('mousedown', (e)=>{ e.preventDefault(); select(n); });
          listBox.appendChild(div);
        });
        listBox.classList.add('visible');
        inputEl.setAttribute('aria-expanded','true');
      }

      function hide(){
        if (!listBox) return;
        listBox.classList.remove('visible');
        listBox.innerHTML = '';
        inputEl.setAttribute('aria-expanded','false');
      }

      function select(name){
        try { state.onSelect(name); } catch(_) {}
        try { inputEl.value = name; } catch(_) {}
        hide();
        try { inputEl.focus(); } catch(_) {}
      }

      async function search(query){
        if (!query){ hide(); state.items = []; state.activeIndex = -1; return; }
        const names = await state.provider();
        const exclude = state.getExcludeNames() || new Set();
        const qn = localNormalizeName(query);
        const starts = []; const contains = [];
        for (const n of names){
          const nn = localNormalizeName(n);
          if (exclude && exclude.has(nn)) continue;
          if (nn.startsWith(qn)) starts.push(n);
          else if (nn.includes(qn)) contains.push(n);
          if (starts.length >= state.limit) break;
        }
        const list = starts.length < state.limit ? starts.concat(contains).slice(0, state.limit) : starts.slice(0, state.limit);
        state.items = list; state.activeIndex = -1;
        render(list);
      }

      function keyNav(e){
        if (!listBox || !listBox.classList.contains('visible')) return;
        const items = Array.from(listBox.querySelectorAll('.suggestion-item'));
        if (items.length === 0) return;
        const cur = state.activeIndex;
        if (e.key === 'ArrowDown'){
          e.preventDefault();
          const next = cur < items.length - 1 ? cur + 1 : 0;
          items.forEach(i=>i.classList.remove('active'));
          items[next].classList.add('active');
          state.activeIndex = next;
          items[next].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp'){
          e.preventDefault();
          const prev = cur > 0 ? cur - 1 : items.length - 1;
          items.forEach(i=>i.classList.remove('active'));
          items[prev].classList.add('active');
          state.activeIndex = prev;
          items[prev].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter'){
          if (state.activeIndex >= 0){ e.preventDefault(); select(items[state.activeIndex].textContent); }
        } else if (e.key === 'Escape'){
          hide();
        }
      }

      const onInput = debounce((e)=>{ const v = (e && e.target ? e.target.value : inputEl.value).trim(); search(v); }, 250);
      inputEl.addEventListener('input', onInput);
      inputEl.addEventListener('keydown', keyNav);
      inputEl.addEventListener('blur', ()=> setTimeout(hide, 100));

      // Store singleton instance for global delegations
      Suggestions._inst = { search, hide, keyNav, select };
      return Suggestions._inst;
    }
  };

  // Global delegations for backward compatibility
  window.Suggestions = Suggestions;
  window.debouncedSuggest = function(q){ try { Suggestions._inst && Suggestions._inst.search(q); } catch(_) {} };
  window.hideSuggestions = function(){ try { Suggestions._inst && Suggestions._inst.hide(); } catch(_) {} };
  window.handleKeyNav = function(e){ try { Suggestions._inst && Suggestions._inst.keyNav(e); } catch(_) {} };
  window.selectSuggestion = function(name){ try { Suggestions._inst && Suggestions._inst.select(name); } catch(_) {} };
})();
