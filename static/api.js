// Standardized API client wrappers
// Exposed as window.Api
(function(){
  function json(res){
    return res.json().catch(() => ({}));
  }

  function normalizeError(err, res, data){
    if (data && typeof data.error === 'string' && data.error) return data.error;
    if (res && res.status && res.status >= 400) return res.statusText || 'Server error';
    return 'Network error. Please try again.';
  }

  function withDefaults(params){
    const out = Object.assign({}, params);
    try { if (!out.lang && typeof getLang === 'function') out.lang = getLang(); } catch(_) {}
    try { if (!out.gen && typeof getGen === 'function') out.gen = getGen(); } catch(_) {}
    return out;
  }

  // Guess check: unified across modes
  async function checkGuess({ url = '/api/check-guess', endpoint, token, guess, lang }){
    const finalUrl = endpoint || url || '/api/check-guess';
    try {
      const body = { token, guess, lang: (lang || (typeof getLang==='function' ? getLang() : 'en')) };
      const res = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await json(res);
      if (!res.ok) {
        return { ok: false, error: normalizeError(null, res, data) };
      }
      // normalize
      return { ok: true, correct: !!data.correct, name: data.name };
    } catch(e){
      return { ok: false, error: normalizeError(e) };
    }
  }

  // Random round loader for various modes
  // kind: 'sprite'|'entry'|'scream'|'pixelate'|'silhouette'|'tcg'
  async function random({ kind, lang, gen }){
    const p = withDefaults({ lang, gen });
    const map = {
      sprite: '/api/random-sprite',
      entry: '/pokedex/api/random-entry',
      scream: '/api/random-cry',
      pixelate: '/api/pixelate/random',
      silhouette: '/api/silhouette/random',
      tcg: '/api/tcg/random'
    };
    const base = map[kind];
    if (!base) return { ok: false, error: 'Unknown random kind' };
    const qs = `?lang=${encodeURIComponent(p.lang || 'en')}&gen=${encodeURIComponent(p.gen || '')}`;
    const url = `${base}${qs}`;
    try {
      const res = await fetch(url);
      const data = await json(res);
      if (!res.ok) return { ok: false, error: normalizeError(null, res, data) };
      return { ok: true, data };
    } catch(e){
      return { ok: false, error: normalizeError(e) };
    }
  }

  window.Api = { checkGuess, random };
})();
