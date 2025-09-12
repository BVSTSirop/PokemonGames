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
    art = (
        j['sprites'].get('other', {})
        .get('official-artwork', {})
        .get('front_default')
    )
    if not art:
        art = j['sprites'].get('front_default')
    if not art:
        other = j['sprites'].get('other', {})
        for k in other.values():
            if isinstance(k, dict) and k.get('front_default'):
                art = k['front_default']
                break
    return art, j['name']


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/pokemon-names')
def pokemon_names():
    try:
        names = fetch_all_pokemon_names()
        return jsonify(names)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/pokemon-suggest')
def pokemon_suggest():
    try:
        q = (request.args.get('q') or '').strip()
        limit = int(request.args.get('limit', '20'))
        lang = (request.args.get('lang') or 'en').lower()
        current_id_raw = request.args.get('current_id')
        current_id = int(current_id_raw) if current_id_raw and current_id_raw.isdigit() else None

        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        if limit <= 0:
            limit = 20

        lst = get_pokemon_list()
        if not q:
            return jsonify([])

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

        q_norm = normalize_name(q)
        results, seen = [], set()

        def consider(name_loc: str):
            if not name_loc:
                return False
            nn = normalize_name(name_loc)
            if nn.startswith(q_norm) or (q_norm in nn and len(results) < limit):
                if name_loc not in seen:
                    results.append(name_loc)
                    seen.add(name_loc)
                    return True
            return False

        # 1) Prioritize current Pokémon (helps Trubbish -> Unratütox)
        if current_id:
            try:
                name_cur = get_localized_name(current_id, lang)
                consider(name_cur)
                if len(results) >= limit:
                    return jsonify(results[:limit])
            except Exception:
                pass

        # 2) First pass: use cached lang or fallback en/display_en NOW
        for p in lst:
            pid = p['id']
            name_now = (
                SPECIES_NAMES.get(pid, {}).get(lang)
                or SPECIES_NAMES.get(pid, {}).get('en')
                or p['display_en']
            )
            if consider(name_now) and len(results) >= limit:
                return jsonify(results[:limit])

        # 3) Fetch missing localized names with a stride across ids
        missing_ids_all = [p['id'] for p in lst if lang not in SPECIES_NAMES.get(p['id'], {})]
        if not missing_ids_all:
            return jsonify(results[:limit])

        max_new_calls = min(48, max(12, limit * 3))
        ids_to_fetch = []
        if current_id and current_id in missing_ids_all:
            ids_to_fetch.append(current_id)

        stride = max(1, len(missing_ids_all) // max_new_calls)
        qhash = abs(hash(q_norm)) % stride if stride > 1 else 0
        i = qhash
        while i < len(missing_ids_all) and len(ids_to_fetch) < max_new_calls:
            pid = missing_ids_all[i]
            if pid != current_id:
                ids_to_fetch.append(pid)
            i += stride
        if len(ids_to_fetch) < max_new_calls:
            for pid in missing_ids_all:
                if pid == current_id or pid in ids_to_fetch:
                    continue
                ids_to_fetch.append(pid)
                if len(ids_to_fetch) >= max_new_calls:
                    break

        def fetch_and_store(pid):
            try:
                return pid, get_localized_name(pid, lang)
            except Exception:
                return pid, None

        futures = [EXECUTOR.submit(fetch_and_store, pid) for pid in ids_to_fetch]
        for f in as_completed(futures):
            _, name_loc = f.result()
            if consider(name_loc) and len(results) >= limit:
                break

        return jsonify(results[:limit])

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/random-sprite')
def random_sprite():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        fetch_all_pokemon_names()
        max_id = 1025
        for _ in range(10):
            pid = random.randint(1, max_id)
            sprite, slug = get_sprite_for_pokemon(pid)
            if sprite:
                token = secrets.token_urlsafe(16)
                TOKENS[token] = { 'name': slug, 'id': pid }
                bg_size = '500% 500%'
                x = random.randint(0, 100)
                y = random.randint(0, 100)
                bg_pos = f"{x}% {y}%"
                display_name = get_localized_name(pid, lang)
                display_en = next((p['display_en'] for p in get_pokemon_list() if p['id'] == pid), None)
                return jsonify({
                    'token': token,
                    'id': pid,
                    'slug': slug,
                    'display_en': display_en,
                    'name': display_name,
                    'sprite': sprite,
                    'bg_size': bg_size,
                    'bg_pos': bg_pos,
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def normalize_name(s: str) -> str:
    if not isinstance(s, str):
        s = str(s)
    s = s.strip()
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.casefold()
    for ch in [' ', '-', "'", '’', '´', '`', '.']:
        s = s.replace(ch, '')
    s = s.replace('♀', 'f').replace('♂', 'm')
    s = s.replace('\u200b', '').replace('\u200c', '').replace('\u200d', '').replace('\ufeff', '')
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
    slug_norm = normalize_name(answer['name'])
    display_en = None
    for p in get_pokemon_list():
        if p['id'] == answer['id']:
            display_en = p['display_en']
            break
    display_en_norm = normalize_name(display_en) if display_en else ''
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
