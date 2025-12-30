(function(){
  // Internal bundles store. Seeded with base keys from current game.js
  const bundles = {
    en: {
      'nav.guess': 'Sprite',
      'nav.scream': 'Scream',
      'nav.silhouette': 'Silhouette',
      'nav.pixelate': 'Pixelate',
      'nav.cards': 'Cards',
      'nav.pokedex': 'Pokédex',
      'nav.daily': 'Daily',
      'lang.label': 'Language',
      'game.title': 'Guess the Pokémon!',
      'form.label': 'Your guess',
      'form.placeholder': 'Type a Pokémon name...',
      'form.guessBtn': 'Guess',
      'controls.reveal': 'Reveal',
      'controls.next': 'Next',
      'gen.label.all': 'All Generations',
      'gen.label.gen': 'Gen {n}',
      'gen.label.more': '+{n} more',
      'gen.select.title': 'Select generations',
      'gen.menu.label': 'Generations',
      'gen.disabledHint': 'Generation selection is disabled in Daily mode',
      'aria.menu.open': 'Open menu',
      'aria.spriteCrop': 'Cropped Pokémon sprite',
      'aria.suggestions': 'Suggestions',
      'feedback.correct': 'Correct! It is {name}',
      'feedback.reveal': 'It was {name}',
      'feedback.wrong': 'Nope, try again!',
      'hud.score': 'Score',
      'hud.streak': 'Streak',
      'hints.title': 'Hints',
      'hints.first': 'Starts with {letter}',
      'hints.color': 'Color: {color}',
      'hints.gen': 'Gen: {n}',
      'hints.silhouette': 'Silhouette',
      'hints.label.first': 'Starts with',
      'hints.label.color': 'Color',
      'hints.label.gen': 'Generation'
    },
    es: {
      'nav.guess': 'Sprite',
      'nav.scream': 'Grito',
      'nav.silhouette': 'Silueta',
      'nav.pixelate': 'Pixelado',
      'nav.cards': 'Cartas',
      'nav.pokedex': 'Pokédex',
      'nav.daily': 'Diario',
      'lang.label': 'Idioma',
      'game.title': '¡Adivina el Pokémon!',
      'form.label': 'Tu respuesta',
      'form.placeholder': 'Escribe un nombre de Pokémon...',
      'form.guessBtn': 'Adivinar',
      'controls.reveal': 'Revelar',
      'controls.next': 'Siguiente',
      'gen.label.all': 'Todas las generaciones',
      'gen.label.gen': 'Gen {n}',
      'gen.label.more': '+{n} más',
      'gen.select.title': 'Seleccionar generaciones',
      'gen.menu.label': 'Generaciones',
      'gen.disabledHint': 'La selección de generaciones está deshabilitada en el modo Diario',
      'aria.menu.open': 'Abrir menú',
      'aria.spriteCrop': 'Sprite de Pokémon recortado',
      'aria.suggestions': 'Sugerencias',
      'feedback.correct': '¡Correcto! Es {name}',
      'feedback.reveal': 'Era {name}',
      'feedback.wrong': '¡No! Intenta de nuevo.',
      'hud.score': 'Puntuación',
      'hud.streak': 'Racha',
      'hints.title': 'Pistas',
      'hints.first': 'Empieza con {letter}',
      'hints.color': 'Color: {color}',
      'hints.gen': 'Gen: {n}',
      'hints.silhouette': 'Silueta',
      'hints.label.first': 'Empieza con',
      'hints.label.color': 'Color',
      'hints.label.gen': 'Generación'
    },
    fr: {
      'nav.guess': 'Sprite',
      'nav.scream': 'Cri',
      'nav.silhouette': 'Silhouette',
      'nav.pixelate': 'Pixélisé',
      'nav.cards': 'Cartes',
      'nav.pokedex': 'Pokédex',
      'nav.daily': 'Quotidien',
      'lang.label': 'Langue',
      'game.title': 'Devinez le Pokémon!',
      'form.label': 'Votre réponse',
      'form.placeholder': 'Saisissez un nom de Pokémon…',
      'form.guessBtn': 'Deviner',
      'controls.reveal': 'Révéler',
      'controls.next': 'Suivant',
      'gen.label.all': 'Toutes les générations',
      'gen.label.gen': 'Gen {n}',
      'gen.label.more': '+{n} de plus',
      'gen.select.title': 'Sélectionner des générations',
      'gen.menu.label': 'Générations',
      'gen.disabledHint': 'La sélection des générations est désactivée en mode Quotidien',
      'aria.menu.open': 'Ouvrir le menu',
      'aria.spriteCrop': 'Sprite de Pokémon recadré',
      'aria.suggestions': 'Suggestions',
      'feedback.correct': 'Correct ! C\'est {name}',
      'feedback.reveal': 'C\'était {name}',
      'feedback.wrong': 'Non, réessayez !',
      'hud.score': 'Score',
      'hud.streak': 'Série',
      'hints.title': 'Indices',
      'hints.first': 'Commence par {letter}',
      'hints.color': 'Couleur : {color}',
      'hints.gen': 'Génération : {n}',
      'hints.silhouette': 'Silhouette',
      'hints.label.first': 'Commence par',
      'hints.label.color': 'Couleur',
      'hints.label.gen': 'Génération'
    },
    de: {
      'nav.guess': 'Sprite',
      'nav.scream': 'Schrei',
      'nav.silhouette': 'Silhouette',
      'nav.pixelate': 'Pixelate',
      'nav.cards': 'Karten',
      'nav.pokedex': 'Pokédex',
      'nav.daily': 'Daily',
      'lang.label': 'Sprache',
      'game.title': 'Errate das Pokémon!',
      'form.label': 'Dein Tipp',
      'form.placeholder': 'Gib einen Pokémon-Namen ein…',
      'form.guessBtn': 'Raten',
      'controls.reveal': 'Aufdecken',
      'controls.next': 'Weiter',
      'gen.label.all': 'Alle Generationen',
      'gen.label.gen': 'Gen {n}',
      'gen.label.more': '+{n} mehr',
      'gen.select.title': 'Generationen auswählen',
      'gen.menu.label': 'Generationen',
      'gen.disabledHint': 'Generationenwahl im Daily-Modus deaktiviert',
      'aria.menu.open': 'Menü öffnen',
      'aria.spriteCrop': 'Zugeschnittenes Pokémon-Sprite',
      'aria.suggestions': 'Vorschläge',
      'feedback.correct': 'Richtig! Es ist {name}',
      'feedback.reveal': 'Es war {name}',
      'feedback.wrong': 'Nein, versuch es nochmal!',
      'hud.score': 'Punkte',
      'hud.streak': 'Serie',
      'hints.title': 'Hinweise',
      'hints.first': 'Beginnt mit {letter}',
      'hints.color': 'Farbe: {color}',
      'hints.gen': 'Gen: {n}',
      'hints.silhouette': 'Silhouette',
      'hints.label.first': 'Beginnt mit',
      'hints.label.color': 'Farbe',
      'hints.label.gen': 'Generation'
    }
  };

  const LANG_KEY = 'lang';

  function getStoredLang(){
    try { const saved = localStorage.getItem(LANG_KEY); if (saved && bundles[saved]) return saved; } catch(_) {}
    try {
      const nav = (navigator && (navigator.language || (navigator.languages && navigator.languages[0]))) || 'en';
      const base = String(nav || 'en').slice(0,2).toLowerCase();
      return bundles[base] ? base : 'en';
    } catch(_) { return 'en'; }
  }

  let currentLang = getStoredLang();

  function interpolate(str, params){
    if (!params) return str;
    try {
      return String(str).replace(/\{(\w+)\}/g, (m, k) => {
        const v = params[k];
        return (typeof v === 'string' || typeof v === 'number') ? String(v) : m;
      });
    } catch(_) { return str; }
  }

  function t(key, params){
    const lang = currentLang && bundles[currentLang] ? currentLang : 'en';
    const bundle = bundles[lang] || bundles.en || {};
    let s = bundle[key];
    if (!s) s = (bundles.en || {})[key];
    if (!s) s = key;
    return interpolate(s, params);
  }

  function setLang(l){
    const lang = (l || '').toLowerCase();
    currentLang = bundles[lang] ? lang : 'en';
    try { localStorage.setItem(LANG_KEY, currentLang); } catch(_) {}
    // reflect on <html lang>
    try { document.documentElement && document.documentElement.setAttribute('lang', currentLang); } catch(_) {}
  }

  function getLang(){ return currentLang; }

  function translatePage(root){
    const scope = root && root.querySelectorAll ? root : document;
    try {
      scope.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const attr = el.getAttribute('data-i18n-attr');
        const text = t(key);
        if (attr) { el.setAttribute(attr, text); }
        else { el.textContent = text; }
      });
    } catch(_) {}
  }

  function extend(dict){
    try {
      if (!dict || typeof dict !== 'object') return;
      Object.keys(dict).forEach(lang => {
        bundles[lang] = bundles[lang] || {};
        Object.assign(bundles[lang], dict[lang] || {});
      });
    } catch(_) {}
  }

  function getSupported(){ return Object.keys(bundles); }

  // Expose public API
  const api = { t, setLang, getLang, translatePage, extend, getSupported };
  window.i18n = api;
  // Legacy globals (shim)
  window.t = t;
  window.translatePage = translatePage;
  window.setLang = setLang;
  window.getLang = getLang;
  // Expose read-only I18N for legacy code access
  try {
    const proxy = new Proxy(bundles, { set(){ console.warn && console.warn('[i18n] Direct I18N mutation is discouraged. Use i18n.extend().'); return false; } });
    window.I18N = proxy;
  } catch(_) {
    window.I18N = bundles; // fallback without immutability
  }
})();
