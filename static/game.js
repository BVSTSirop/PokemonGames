let state = { token: null, answer: null, ready: false, accept: null };
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
    langSel.addEventListener('change', () => {
      setLang(langSel.value);
      translatePage();
    });
  }


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


    // Instant local verification first
    const guessN = normalizeName(guess);
    if (state.accept && state.accept.has(guessN)) {
      const fb = document.getElementById('feedback');
      fb.textContent = t('feedback.correct', { name: state.answer });
      fb.className = 'feedback prominent correct';
      revealFullSprite();
      return;
    }


    // Optional: server verification for telemetry/anti-cheat
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
      // If token wasn't ready yet, ignore; otherwise you might log/show a subtle message
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