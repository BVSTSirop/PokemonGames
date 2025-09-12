// static/app.js
const I18N = {
  en: {
    "app.title": "PokéGuess",
    "lang.label": "Language",
    "game.title": "Guess the Pokémon from a sprite part",
    "form.label": "Your guess",
    "form.placeholder": "Type a Pokémon name...",
    "form.guessBtn": "Guess",
    "controls.reveal": "Reveal",
    "controls.next": "Next",
    "aria.spriteCrop": "Cropped Pokémon sprite",
    "aria.suggestions": "Suggestions",
    "feedback.correct": "Correct! It is {name}",
    "feedback.reveal": "It was {name}"
  },
  de: {
    "app.title": "PokéGuess",
    "lang.label": "Sprache",
    "game.title": "Errate das Pokémon anhand eines Sprite-Ausschnitts",
    "form.label": "Dein Tipp",
    "form.placeholder": "Gib einen Pokémon-Namen ein…",
    "form.guessBtn": "Raten",
    "controls.reveal": "Aufdecken",
    "controls.next": "Weiter",
    "aria.spriteCrop": "Zugeschnittener Pokémon-Sprite",
    "aria.suggestions": "Vorschläge",
    "feedback.correct": "Richtig! Es ist {name}",
    "feedback.reveal": "Es war {name}"
  },
  fr: {
    "app.title": "PokéGuess",
    "lang.label": "Langue",
    "game.title": "Devinez le Pokémon à partir d’une partie du sprite",
    "form.label": "Votre réponse",
    "form.placeholder": "Saisissez un nom de Pokémon…",
    "form.guessBtn": "Deviner",
    "controls.reveal": "Révéler",
    "controls.next": "Suivant",
    "aria.spriteCrop": "Sprite de Pokémon recadré",
    "aria.suggestions": "Suggestions",
    "feedback.correct": "Correct ! C’est {name}",
    "feedback.reveal": "C’était {name}"
  },
  es: {
    "app.title": "PokéGuess",
    "lang.label": "Idioma",
    "game.title": "Adivina el Pokémon por una parte del sprite",
    "form.label": "Tu respuesta",
    "form.placeholder": "Escribe un nombre de Pokémon...",
    "form.guessBtn": "Adivinar",
    "controls.reveal": "Revelar",
    "controls.next": "Siguiente",
    "aria.spriteCrop": "Sprite de Pokémon recortado",
    "aria.suggestions": "Sugerencias",
    "feedback.correct": "¡Correcto! Es {name}",
    "feedback.reveal": "Era {name}"
  }
};

const state = {
  seq: 0,
  phase: "LOADING", // LOADING | READY | REVEALED
  token: null,
  answerLocal: null,
  displayEN: null,
  slug: null,
  accepts: new Set(),
  suggController: null
};

function getLang() {
  const saved = localStorage.getItem("lang");
  if (saved && I18N[saved]) return saved;
  const nav = (navigator.language || "en").toLowerCase().split("-")[0];
  return I18N[nav] ? nav : "en";
}
function setLang(lang) {
  const l = I18N[lang] ? lang : "en";
  localStorage.setItem("lang", l);
  document.documentElement.lang = l;
}
function t(key, params = {}) {
  const lang = getLang();
  const b = I18N[lang] || I18N.en;
  let s = b[key] || I18N.en[key] || key;
  for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`{${k}}`, "g"), v);
  return s;
}
function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const attr = el.getAttribute("data-i18n-attr");
    const val = t(key);
    if (attr) el.setAttribute(attr, val); else el.textContent = val;
  });
  const sel = document.getElementById("lang-select");
  if (sel) sel.value = getLang();
}

function normalizeName(s) {
  if (!s) return "";
  // strip combining marks
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase()
    .replace(/[ \-'.’´`\.]/g, "")
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  return s;
}

function buildAcceptSet(data) {
  const set = new Set();
  [data.display_local, data.display_en, data.slug].forEach(v => {
    if (v) set.add(normalizeName(v));
  });
  // Trust server’s accepts if present (dedup anyway)
  if (Array.isArray(data.accepts)) {
    data.accepts.forEach(v => v && set.add(v));
  }
  return set;
}

async function newRound() {
  const seq = ++state.seq;
  state.phase = "LOADING";
  document.getElementById("guess-btn").disabled = true;

  const frame = document.querySelector(".sprite-frame");
  frame?.classList.add("loading");
  const fb = document.getElementById("feedback");
  fb.textContent = "";
  fb.className = "feedback";

  try {
    const res = await fetch(`/api/round?lang=${encodeURIComponent(getLang())}`, { cache: "no-store" });
    if (!res.ok) {
      // Read text safely for diagnostics; don't attempt JSON
      const txt = await res.text().catch(() => "");
      throw new Error(`Round fetch failed (${res.status}). ${txt.slice(0, 140)}`);
    }
    const data = await res.json();

    if (seq !== state.seq) return; // drop stale

    state.token = data.token;
    state.answerLocal = data.display_local;
    state.displayEN = data.display_en;
    state.slug = data.slug;
    state.accepts = buildAcceptSet(data);

    const el = document.getElementById("sprite-crop");
    el.classList.remove("revealed", "no-anim");
    el.classList.add("no-anim");
    el.style.backgroundImage = `url(${data.sprite})`;
    el.style.backgroundSize = data.bg_size;
    el.style.backgroundPosition = data.bg_pos;
    void el.offsetWidth;
    el.classList.remove("no-anim");

    setTimeout(() => frame?.classList.remove("loading"), 150);
    state.phase = "READY";
    document.getElementById("guess-btn").disabled = false;
  } catch (err) {
    console.error(err);
    frame?.classList.remove("loading");
    fb.textContent = "Couldn’t load a new round. Please try again.";
    fb.className = "feedback prominent";
    state.phase = "LOADING";
    document.getElementById("guess-btn").disabled = true;
    // Optional: backoff retry
    // setTimeout(() => newRound(), 1200);
  }
}

function revealFullSprite() {
  const el = document.getElementById("sprite-crop");
  el.classList.add("revealed");
  el.style.backgroundSize = "contain";
  el.style.backgroundPosition = "center";
  el.style.backgroundRepeat = "no-repeat";
  state.phase = "REVEALED";
}

function renderSuggestions(items) {
  const box = document.getElementById("suggestions");
  box.innerHTML = "";
  if (!items?.length) {
    box.classList.remove("visible");
    return;
  }
  items.forEach((n, idx) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.id = `sugg-${idx}`;
    div.setAttribute("role", "option");
    div.textContent = n;
    div.addEventListener("mousedown", e => {
      e.preventDefault();
      selectSuggestion(n);
    });
    box.appendChild(div);
  });
  box.classList.add("visible");
}

function hideSuggestions() {
  const box = document.getElementById("suggestions");
  box.classList.remove("visible");
  box.innerHTML = "";
  document.getElementById("guess-input").setAttribute("aria-expanded", "false");
}

function selectSuggestion(text) {
  const input = document.getElementById("guess-input");
  input.value = text;
  hideSuggestions();
  input.focus();
}

const debounce = (fn, delay) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
};

async function fetchSuggestions(q) {
  if (!q) { hideSuggestions(); return; }
  if (state.suggController) {
    try { state.suggController.abort(); } catch {}
  }
  state.suggController = new AbortController();
  try {
    const url = `/api/suggest?q=${encodeURIComponent(q)}&limit=20&lang=${encodeURIComponent(getLang())}`;
    const res = await fetch(url, { signal: state.suggController.signal });
    const names = await res.json();
    renderSuggestions(Array.isArray(names) ? names : []);
    document.getElementById("guess-input").setAttribute("aria-expanded", names?.length ? "true" : "false");
  } catch {
    hideSuggestions();
  }
}

const debouncedSuggest = debounce((q) => fetchSuggestions(q), 220);

function handleKeyNav(e) {
  const box = document.getElementById("suggestions");
  const items = Array.from(box.querySelectorAll(".suggestion-item"));
  if (!box.classList.contains("visible") || !items.length) return;
  const current = items.findIndex(i => i.classList.contains("active"));
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = current < items.length - 1 ? current + 1 : 0;
    items.forEach(i => i.classList.remove("active"));
    items[next].classList.add("active");
    items[next].scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = current > 0 ? current - 1 : items.length - 1;
    items.forEach(i => i.classList.remove("active"));
    items[prev].classList.add("active");
    items[prev].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && current >= 0) {
    e.preventDefault();
    selectSuggestion(items[current].textContent);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
}

function onSubmit(e) {
  e.preventDefault();
  if (state.phase !== "READY") return;
  const raw = document.getElementById("guess-input").value.trim();
  if (!raw) return;
  const guessN = normalizeName(raw);
  const correct = state.accepts.has(guessN);
  const fb = document.getElementById("feedback");

  if (correct) {
    fb.textContent = t("feedback.correct", { name: state.answerLocal });
    fb.className = "feedback prominent correct";
    revealFullSprite();

    // Optional: ping server for analytics (no need to await)
    // fetch("/api/verify", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ guess: raw, accepts: Array.from(state.accepts) }) });
  } else {
    // Progressive reveal (zoom out)
    const el = document.getElementById("sprite-crop");
    el.classList.remove("revealed");
    const cur = getComputedStyle(el).backgroundSize;
    if (cur !== "contain") {
      const parts = cur.split(" ");
      const w = parseFloat(parts[0]) || 500, h = parseFloat(parts[1] || parts[0]) || 500;
      el.style.backgroundSize = `${Math.max(100, w - 25)}% ${Math.max(100, h - 25)}%`;
    }
  }
}

function onReveal() {
  const fb = document.getElementById("feedback");
  fb.textContent = t("feedback.reveal", { name: state.answerLocal });
  fb.className = "feedback prominent reveal";
  revealFullSprite();
}

function init() {
  setLang(getLang());
  translatePage();

  const sel = document.getElementById("lang-select");
  sel.value = getLang();
  sel.addEventListener("change", () => { setLang(sel.value); translatePage(); newRound(); });

  const input = document.getElementById("guess-input");
  input.addEventListener("input", e => debouncedSuggest(e.target.value.trim()));
  input.addEventListener("keydown", handleKeyNav);
  input.addEventListener("blur", () => setTimeout(hideSuggestions, 100));

  document.getElementById("guess-form").addEventListener("submit", onSubmit);
  document.getElementById("reveal-btn").addEventListener("click", onReveal);
  document.getElementById("next-btn").addEventListener("click", () => newRound());

  newRound();
}

window.addEventListener("DOMContentLoaded", init);
