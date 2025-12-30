// Reusable per-round guessed list helper
// Exposed as window.GuessedList
(function(){
  function create({ containerId = 'guessed-list' } = {}){
    const box = () => document.getElementById(containerId);
    const SET = new Set();

    function getNames(){
      try {
        return (typeof getCachedNames === 'function') ? (getCachedNames(getLang(), getGen()) || []) : [];
      } catch(_) { return []; }
    }

    function nn(s){
      try { return (typeof normalizeName === 'function') ? normalizeName(s) : String(s||'').trim().toLowerCase(); }
      catch(_) { return String(s||'').trim().toLowerCase(); }
    }

    function render(){
      const el = box();
      if (!el) return;
      el.innerHTML = '';
      const names = getNames();
      for (const key of SET){
        const chip = document.createElement('span');
        chip.className = 'guessed-chip';
        const disp = names.find(n => nn(n) === key) || key;
        chip.textContent = disp;
        el.appendChild(chip);
      }
    }

    function add(name){
      const key = nn(name);
      if (!SET.has(key)) { SET.add(key); render(); }
    }

    function clear(){
      SET.clear();
      render();
    }

    return {
      add,
      clear,
      has: (name) => SET.has(nn(name)),
      render,
      setBoxId: (id) => { containerId = id; render(); },
      get set(){ return SET; },
    };
  }

  window.GuessedList = { create };
})();
