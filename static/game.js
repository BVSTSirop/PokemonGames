let state = { token: null, answer: null };

async function newRound() {
  const frame = document.querySelector('.sprite-frame');
  frame?.classList.add('loading');
  const res = await fetch('/api/random-sprite');
  const data = await res.json();
  state.token = data.token;
  state.answer = data.name; // for Reveal button; not displayed by default
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
  const res = await fetch('/api/check-guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: state.token, guess })
  });
  return await res.json();
}

// Simple debounce utility
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

async function fetchSuggestions(query) {
  const box = document.getElementById('suggestions');
  if (!query) {
    hideSuggestions();
    return;
  }
  try {
    const url = `/api/pokemon-suggest?q=${encodeURIComponent(query)}&limit=20`;
    const res = await fetch(url);
    const names = await res.json();
    renderSuggestions(Array.isArray(names) ? names : []);
    document.getElementById('guess-input').setAttribute('aria-expanded', names && names.length ? 'true' : 'false');
  } catch (_) {
    hideSuggestions();
  }
}

const debouncedSuggest = debounce((q) => fetchSuggestions(q), 150);

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

window.addEventListener('DOMContentLoaded', () => {
  // No initial full list; suggestions are fetched as the user types
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
    const res = await checkGuess(guess);
    const fb = document.getElementById('feedback');
    if (res.correct) {
      fb.textContent = `Correct! It is ${res.name}`;
      fb.className = 'feedback prominent correct';
      revealFullSprite();
    } else {
      fb.textContent = `Nope!`;
      fb.className = 'feedback incorrect';
      // Zoom out more (reduce background-size by 15%) on each wrong guess
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
    fb.textContent = `It was ${state.answer}`;
    fb.className = 'feedback prominent reveal';
    revealFullSprite();
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    newRound();
  });
});
