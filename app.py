import os
import random
import secrets
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, render_template, request
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# In-memory caches
POKEMON_NAMES = []  # English display names list (title-cased)
POKEMON_LIST = []   # List of dicts: { 'id': int, 'slug': str, 'display_en': str }
DISPLAY_TO_ID = {}  # English display name -> id
SPECIES_NAMES = {}  # id -> { lang: localized_display }
TOKENS = {}  # token -> { 'name': str, 'id': int }

POKEAPI_BASE = 'https://pokeapi.co/api/v2'
SUPPORTED_LANGS = {'en', 'es', 'fr', 'de'}

# Thread pool for parallel species fetches (bounded to be polite to PokeAPI)
EXECUTOR = ThreadPoolExecutor(max_workers=8)

# Warmup flag
WARMED = False
# Warmup scheduling guard (for Flask 3.1 where before_first_request is removed)
WARMUP_SCHEDULED = False


def get_pokemon_list():
    """Return cached list of Pokemon with ids and English display names."""
    global POKEMON_LIST, DISPLAY_TO_ID, POKEMON_NAMES
    if POKEMON_LIST:
        return POKEMON_LIST
    url = f"{POKEAPI_BASE}/pokemon?limit=20000"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    results = data.get('results', [])
    lst = []
    for item in results:
        slug = item.get('name')
        u = item.get('url') or ''
        try:
            path = urlparse(u).path.strip('/').split('/')
            pid = int(path[-1]) if path[-1].isdigit() else int(path[-2])
        except Exception:
            continue
        display_en = (slug or '').replace('-', ' ').title()
        lst.append({'id': pid, 'slug': slug, 'display_en': display_en})
    lst.sort(key=lambda x: x['id'])
    POKEMON_LIST = lst
    DISPLAY_TO_ID = {p['display_en']: p['id'] for p in lst}
    POKEMON_NAMES = [p['display_en'] for p in lst]
    return POKEMON_LIST


def fetch_all_pokemon_names():
    # Backward-compatible: returns English display names list (title-cased)
    global POKEMON_NAMES
    if POKEMON_NAMES:
        return POKEMON_NAMES
    lst = get_pokemon_list()
    POKEMON_NAMES = [p['display_en'] for p in lst]
    return POKEMON_NAMES


def get_localized_name(poke_id: int, lang: str) -> str:
    """Return localized display name for the given Pokémon id and language.
    Caches results in-memory. Falls back to English display when unavailable.
    """
    if lang == 'en':
        for p in get_pokemon_list():
            if p['id'] == poke_id:
                return p['display_en']
        return str(poke_id)
    if poke_id in SPECIES_NAMES and lang in SPECIES_NAMES[poke_id]:
        return SPECIES_NAMES[poke_id][lang]
    url = f"{POKEAPI_BASE}/pokemon-species/{poke_id}"
    r = requests.get(url, timeout=8)
    r.raise_for_status()
    j = r.json()
    names_list = j.get('names', [])
    lang_map = {}
    for entry in names_list:
        nm = entry.get('name')
        lang_code = (entry.get('language') or {}).get('name')
        if nm and lang_code:
            if lang_code in SUPPORTED_LANGS:
                lang_map[lang_code] = nm
            elif lang_code == 'en':
                lang_map['en'] = nm
    if 'en' not in lang_map:
        for p in get_pokemon_list():
            if p['id'] == poke_id:
                lang_map['en'] = p['display_en']
                break
    SPECIES_NAMES[poke_id] = {**SPECIES_NAMES.get(poke_id, {}), **lang_map}
    return SPECIES_NAMES[poke_id].get(lang) or SPECIES_NAMES[poke_id].get('en')


def get_sprite_for_pokemon(poke_id):
    # Try multiple sprite sources for better quality; fall back appropriately
    url = f"{POKEAPI_BASE}/pokemon/{poke_id}"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    j = r.json()
    # Official artwork preferred
    art = (
        j['sprites'].get('other', {})
        .get('official-artwork', {})
        .get('front_default')
    )
    if not art:
        art = j['sprites'].get('front_default')
    if not art:
        # As a last resort, use any other available sprite URL within nested fields
        other = j['sprites'].get('other', {})
        for k in other.values():
            if isinstance(k, dict) and k.get('front_default'):
                art = k['front_default']
                break
    return art, j['name']


@app.route('/')
def index():
    return render_template('index.html')


def _fetch_and_cache_species(pid: int):
    """Fetch species once and cache all supported lang names for the pokemon id."""
    url = f"{POKEAPI_BASE}/pokemon-species/{pid}"
    r = requests.get(url, timeout=12)
    r.raise_for_status()
    j = r.json()
    names_list = j.get('names', [])
    lang_map = {}
    for entry in names_list:
        nm = entry.get('name')
        lang_code = (entry.get('language') or {}).get('name')
        if nm and lang_code:
            if lang_code in SUPPORTED_LANGS:
                lang_map[lang_code] = nm
            elif lang_code == 'en':
                lang_map['en'] = nm
    # Ensure English fallback is present
    if 'en' not in lang_map:
        for p in get_pokemon_list():
            if p['id'] == pid:
                lang_map['en'] = p['display_en']
                break
    SPECIES_NAMES[pid] = {**SPECIES_NAMES.get(pid, {}), **lang_map}


def warm_up_all_names():
    """Prefetch all Pokémon species names for all supported languages into SPECIES_NAMES."""
    global WARMED
    try:
        lst = get_pokemon_list()
        ids = [p['id'] for p in lst]
        futures = [EXECUTOR.submit(_fetch_and_cache_species, pid) for pid in ids]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception:
                # Ignore individual failures; we'll fallback to English later
                pass
        WARMED = True
    except Exception:
        # Leave WARMED as False; endpoints can still operate lazily
        WARMED = False


# Schedule warmup once on the first incoming request (Flask 3.1 compatible)
@app.before_request
def _schedule_warmup():
    global WARMUP_SCHEDULED
    if not WARMUP_SCHEDULED:
        EXECUTOR.submit(warm_up_all_names)
        WARMUP_SCHEDULED = True


def ensure_language_filled(lang: str):
    """Ensure SPECIES_NAMES contains entries for the given language for all Pokémon.
    Performs on-demand fetches for ids missing the language."""
    lst = get_pokemon_list()
    missing = [p['id'] for p in lst if lang not in SPECIES_NAMES.get(p['id'], {})]
    if not missing:
        return
    # Fetch missing species in parallel
    futures = [EXECUTOR.submit(_fetch_and_cache_species, pid) for pid in missing]
    for f in as_completed(futures):
        try:
            f.result()
        except Exception:
            pass


@app.route('/api/all-names')
def all_names():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        if lang == 'en':
            return jsonify(fetch_all_pokemon_names())
        ensure_language_filled(lang)
        lst = get_pokemon_list()
        names = []
        for p in lst:
            pid = p['id']
            nm = SPECIES_NAMES.get(pid, {}).get(lang) or p['display_en']
            names.append(nm)
        return jsonify(names)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/pokemon-names')
def pokemon_names():
    """Backward-compatible endpoint returning English names list.
    Accepts optional ?lang=xx to return localized names if already warmed.
    """
    try:
        lang = (request.args.get('lang') or 'en').lower()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        if lang == 'en':
            names = fetch_all_pokemon_names()
            return jsonify(names)
        # Non-English: if warmed, return localized; else trigger limited fetch to avoid latency
        lst = get_pokemon_list()
        names_loc = []
        for p in lst:
            pid = p['id']
            name = SPECIES_NAMES.get(pid, {}).get(lang)
            if not name:
                # Try fetching once; _fetch_and_cache_species caches all langs for this id
                try:
                    _fetch_and_cache_species(pid)
                except Exception:
                    pass
                name = SPECIES_NAMES.get(pid, {}).get(lang) or p['display_en']
            names_loc.append(name)
        return jsonify(names_loc)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/pokemon-suggest')
def pokemon_suggest():
    try:
        q = (request.args.get('q') or '').strip()
        limit = int(request.args.get('limit', '20'))
        lang = (request.args.get('lang') or 'en').lower()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        if limit <= 0:
            limit = 20
        lst = get_pokemon_list()
        if not q:
            # Do not return the whole list when empty input; return empty suggestions
            return jsonify([])

        # English: match against English display names as before
        if lang == 'en':
            names_en = [p['display_en'] for p in lst]
            q_low = q.lower()
            starts = [n for n in names_en if n.lower().startswith(q_low)]
            if len(starts) < limit:
                contains = [n for n in names_en if q_low in n.lower() and n not in starts]
                selected = (starts + contains)[:limit]
            else:
                selected = starts[:limit]
            return jsonify(selected)

        # Non-English: language-aware matching using localized species names.
        # Fast path: search cached localized names first, then fetch missing in parallel if needed.
        q_norm = normalize_name(q)
        results = []
        seen = set()

        # Gather cached localized names
        cached_entries = []  # list of (id, name)
        missing_ids = []
        for p in lst:
            pid = p['id']
            name_loc = SPECIES_NAMES.get(pid, {}).get(lang)
            if name_loc:
                cached_entries.append((pid, name_loc))
            else:
                missing_ids.append(pid)

        # Helper to add a name if it matches the query
        def consider(name_loc: str):
            nonlocal results
            if not name_loc:
                return False
            nn = normalize_name(name_loc)
            if nn.startswith(q_norm) or (q_norm in nn and len(results) < limit):
                if name_loc not in seen:
                    results.append(name_loc)
                    seen.add(name_loc)
                    return True
            return False

        # First pass on cached, prioritize startswith then contains implicitly via consider
        for _, name_loc in cached_entries:
            if len(results) >= limit:
                break
            consider(name_loc)

        if len(results) >= limit or not missing_ids:
            return jsonify(results[:limit])

        # Fetch missing in parallel but with a cap per request
        max_new_calls = min(24, max(8, limit * 2))
        ids_to_fetch = missing_ids[:max_new_calls]

        def fetch_and_store(pid):
            try:
                name = get_localized_name(pid, lang)
                return pid, name
            except Exception:
                return pid, None

        futures = [EXECUTOR.submit(fetch_and_store, pid) for pid in ids_to_fetch]
        for f in as_completed(futures):
            pid, name_loc = f.result()
            # get_localized_name has stored the name in SPECIES_NAMES cache; use returned value
            if consider(name_loc) and len(results) >= limit:
                break

        return jsonify(results[:limit])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/random-sprite')
def random_sprite():
    # Choose random ID in the supported range by PokeAPI; as of now > 1000
    try:
        # Determine requested language for display name
        lang = (request.args.get('lang') or 'en').lower()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        names = fetch_all_pokemon_names()
        max_id = 1025  # rough upper bound; not all ids exist but many do
        # Try up to a few times to find a Pokémon with a valid sprite
        for _ in range(10):
            pid = random.randint(1, max_id)
            sprite, name = get_sprite_for_pokemon(pid)
            if sprite:
                token = secrets.token_urlsafe(16)
                TOKENS[token] = { 'name': name, 'id': pid }
                # Generate random background positioning to emulate a crop
                # Increase zoom so we reveal less of the sprite (harder)
                # We'll set background-size to 500% so an even smaller snippet is shown initially
                bg_size = '500% 500%'
                # random position in %, keep a 10% margin from edges to avoid empty borders
                x = random.randint(15, 85)
                y = random.randint(15, 85)
                bg_pos = f"{x}% {y}%"
                # Localized display name for reveal/feedback
                display_name = get_localized_name(pid, lang)
                return jsonify({
                    'token': token,
                    'name': display_name,  # localized for reveal
                    'sprite': sprite,
                    'bg_size': bg_size,
                    'bg_pos': bg_pos,
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def normalize_name(s: str) -> str:
    # Normalize by removing diacritics, spaces, hyphens, apostrophes, and dots; lowercase everything
    if not isinstance(s, str):
        s = str(s)
    s = s.strip()
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    for ch in [' ', '-', "'", '’', '´', '`', '.']:
        s = s.replace(ch, '')
    return s


@app.route('/api/check-guess', methods=['POST'])
def check_guess():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    guess = data.get('guess', '')
    lang = (data.get('lang') or 'en').lower()
    if lang not in SUPPORTED_LANGS:
        lang = 'en'
    if not token or token not in TOKENS:
        return jsonify({"error": "Invalid token"}), 400
    answer = TOKENS.get(token)
    guess_norm = normalize_name(guess)
    # English slug from PokeAPI
    slug_norm = normalize_name(answer['name'])
    # English display title (fallback)
    display_en = None
    for p in get_pokemon_list():
        if p['id'] == answer['id']:
            display_en = p['display_en']
            break
    display_en_norm = normalize_name(display_en) if display_en else ''
    # Localized display for selected language
    localized = get_localized_name(answer['id'], lang)
    localized_norm = normalize_name(localized)
    is_correct = guess_norm in {slug_norm, display_en_norm, localized_norm}
    return jsonify({
        'correct': bool(is_correct),
        'name': localized
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
