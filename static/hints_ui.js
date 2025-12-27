// Shared timeline/accordion hint UI for all game modes
// Provides a reusable override for revealHintAt(level) to render into timeline panels.
(function(){
  function dbg(){ try{ const a=[].slice.call(arguments); console.debug.apply(console, ['[HintsUI]'].concat(a)); }catch(_){} }

  function stepLabel(level, forcedLang){
    try{
      const sel = (typeof document!=='undefined') ? document.getElementById('lang-select') : null;
      const lang = forcedLang || (sel && sel.value) || (typeof getLang==='function' ? getLang() : 'en');
      const MAP = {
        en: ['Hint 1','Hint 2','Hint 3','Hint 4'],
        es: ['Pista 1','Pista 2','Pista 3','Pista 4'],
        fr: ['Indice 1','Indice 2','Indice 3','Indice 4'],
        de: ['Hinweis 1','Hinweis 2','Hinweis 3','Hinweis 4']
      };
      const arr = MAP[lang] || MAP.en;
      return arr[level-1] || ('Hint ' + String(level));
    }catch(_){ return 'Hint ' + String(level); }
  }

  function getStepByLevel(level){
    const levelToTh = {1:3,2:5,3:7,4:10};
    return document.querySelector(`#hint-timeline .timeline-step[data-level="${level}"]`) ||
           document.querySelector(`#hint-timeline .timeline-step[data-th="${levelToTh[level]}"]`);
  }
  function getPanelForLevel(level){ const s=getStepByLevel(level); return s ? s.querySelector('.accordion-content') : null; }

  function ensureGlobalHandlers(){
    if (window.__hintsUiGlobal) return;
    const onDocClick = (ev) => {
      const step = ev.target && (ev.target.closest ? ev.target.closest('.timeline-step') : null);
      if (!step) return;
      const panel = step.querySelector('.accordion-content');
      if (panel && panel.querySelector('[data-hint]')){
        const wasOpen = step.classList.contains('open') || step.getAttribute('aria-expanded') === 'true';
        const nowOpen = !wasOpen;
        step.classList.toggle('open', nowOpen);
        step.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        panel.setAttribute('aria-hidden', nowOpen ? 'false' : 'true');
        dbg('doc-click toggle', { level: step.getAttribute('data-level')||'?', wasOpen, nowOpen });
      }
    };
    const onDocKey = (ev) => {
      const key = ev.key;
      if (key !== 'Enter' && key !== ' ') return;
      const step = ev.target && (ev.target.closest ? ev.target.closest('.timeline-step') : null);
      if (!step) return;
      ev.preventDefault();
      const panel = step.querySelector('.accordion-content');
      if (panel && panel.querySelector('[data-hint]')){
        const wasOpen = step.classList.contains('open') || step.getAttribute('aria-expanded') === 'true';
        const nowOpen = !wasOpen;
        step.classList.toggle('open', nowOpen);
        step.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        panel.setAttribute('aria-hidden', nowOpen ? 'false' : 'true');
        dbg('doc-key toggle', { key, level: step.getAttribute('data-level')||'?', wasOpen, nowOpen });
      }
    };
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKey, true);
    window.__hintsUiGlobal = true;
    dbg('global handlers bound');
  }

  function installTimelineOverride(opts){
    try{
      let tl = document.getElementById('hint-timeline');
      if (!tl) {
        // Create a default timeline if not present and insert it near #hints or #status
        try{
          const doc = document;
          const track = doc.createElement('div');
          track.className = 'timeline-track';
          const mkStep = (th, level, i18nKey, regionId) => {
            const step = doc.createElement('div');
            step.className = 'timeline-step';
            step.setAttribute('data-th', String(th));
            step.setAttribute('data-level', String(level));
            step.setAttribute('tabindex','0');
            step.setAttribute('role','button');
            step.setAttribute('aria-expanded','false');
            step.setAttribute('aria-controls', regionId);
            step.setAttribute('aria-label', `Hint step ${th}`);
            const dot = doc.createElement('div'); dot.className = 'dot';
            const label = doc.createElement('div'); label.className = 'label';
            // Use built-in localized labels for non-Daily pages
            label.textContent = stepLabel(level);
            const sub = doc.createElement('div'); sub.className = 'sub'; sub.textContent = String(th);
            const panel = doc.createElement('div'); panel.id = regionId; panel.className = 'accordion-content'; panel.setAttribute('role','region'); panel.setAttribute('aria-hidden','true');
            step.appendChild(dot); step.appendChild(label); step.appendChild(sub); step.appendChild(panel);
            return step;
          };
          track.appendChild(mkStep(3,1,'hints.step1','hint-panel-1'));
          track.appendChild(mkStep(5,2,'hints.step2','hint-panel-2'));
          track.appendChild(mkStep(7,3,'hints.step3','hint-panel-3'));
          track.appendChild(mkStep(10,4,'hints.step4','hint-panel-4'));
          tl = doc.createElement('div');
          tl.id = 'hint-timeline'; tl.className = 'hint-timeline'; tl.setAttribute('aria-hidden','false');
          tl.appendChild(track);
          const hintsBox = doc.getElementById('hints');
          const status = doc.getElementById('status');
          if (hintsBox && hintsBox.parentNode) { hintsBox.parentNode.insertBefore(tl, hintsBox); }
          else if (status && status.parentNode) { status.parentNode.insertBefore(tl, status.nextSibling); }
          else { doc.body.appendChild(tl); }
          dbg('install: created #hint-timeline');
        }catch(err){ dbg('install: failed to create timeline', err && (err.message||err)); return; }
      }
      // Hide legacy hints box if present to avoid duplicate UI
      try{ const box = document.getElementById('hints'); if (box) box.hidden = true; } catch(_){ }
      ensureGlobalHandlers();
      const renderers = opts && opts.renderers ? opts.renderers : {};
      // Initial label sync and bind language change listener
      try {
        const updateStepLabels = (forcedLang) => {
          try{
            const steps = Array.from(document.querySelectorAll('#hint-timeline .timeline-step'));
            steps.forEach(step => {
              const level = parseInt(step.getAttribute('data-level')||'0',10) || 0;
              const label = step.querySelector('.label');
              if (label) label.textContent = stepLabel(level, forcedLang);
            });
          }catch(_){ }
        };
        updateStepLabels();
        // Defer additional refreshes to sync with any late language initialization
        setTimeout(() => updateStepLabels(), 0);
        setTimeout(() => updateStepLabels(), 60);
        const langSel = document.getElementById('lang-select');
        if (langSel && !langSel.dataset.hintsUiBound) {
          langSel.addEventListener('change', () => setTimeout(() => updateStepLabels(langSel.value), 0));
          langSel.dataset.hintsUiBound = '1';
        }
        // Expose manual refresh API
        window.HintsUI = window.HintsUI || {};
        window.HintsUI.refreshLabels = updateStepLabels;
      } catch(_) {}
      function reveal(level){
        try{
          const step = getStepByLevel(level);
          const panel = getPanelForLevel(level);
          if (!step || !panel) return false;
          if (panel.querySelector('[data-hint]')) return false;
          const r = renderers[level];
          if (typeof r !== 'function') return false;
          const node = r();
          if (!node) return false;
          panel.appendChild(node);
          step.classList.add('revealed');
          // auto-open
          step.classList.add('open');
          step.setAttribute('aria-expanded','true');
          panel.setAttribute('aria-hidden','false');
          dbg('reveal level', level);
          return true;
        }catch(_){ return false; }
      }
      // Install as global so game.js maybeRevealHints() uses it
      window.revealHintAt = reveal;
      dbg('override installed');
    }catch(_){ }
  }

  function updateTimeline(wrong){
    try{
      const steps = Array.from(document.querySelectorAll('#hint-timeline .timeline-step'));
      steps.forEach(step => {
        const th = parseInt(step.getAttribute('data-th')||'0',10);
        if (wrong >= th) step.classList.add('active'); else step.classList.remove('active');
      });
      dbg('updateTimeline wrong=', wrong);
    }catch(_){ }
  }
  function clearPanels(){
    try{
      const steps = Array.from(document.querySelectorAll('#hint-timeline .timeline-step'));
      steps.forEach(step => {
        step.classList.remove('revealed','open');
        step.setAttribute('aria-expanded','false');
        const p = step.querySelector('.accordion-content');
        if (p){ p.innerHTML = ''; p.setAttribute('aria-hidden','true'); }
      });
      dbg('cleared panels');
    }catch(_){ }
  }
  function syncRevealed(){
    try{
      const steps = Array.from(document.querySelectorAll('#hint-timeline .timeline-step'));
      steps.forEach(step => {
        const p = step.querySelector('.accordion-content');
        step.classList.toggle('revealed', !!(p && p.querySelector('[data-hint]')));
      });
      dbg('synced revealed');
    }catch(_){ }
  }

  window.HintsUI = { installTimelineOverride, updateTimeline, clearPanels, syncRevealed };
})();
