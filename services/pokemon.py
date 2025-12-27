import os
import random
import secrets
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import unicodedata

import requests

# In-memory caches and executors shared across games
POKEMON_NAMES = []  # English display names list (title-cased)
POKEMON_LIST = []   # List of dicts: { 'id': int, 'slug': str, 'display_en': str }
DISPLAY_TO_ID = {}  # English display name -> id
SPECIES_NAMES = {}  # id -> { lang: localized_display }
SPECIES_META = {}   # id -> { 'color': str, 'generation': str }

POKEAPI_BASE = 'https://pokeapi.co/api/v2'
SUPPORTED_LANGS = {'en', 'es', 'fr', 'de'}

# Thread pool for parallel species fetches (bounded to be polite to PokeAPI)
EXECUTOR = ThreadPoolExecutor(max_workers=8)

# Warmup flags
WARMED = False
WARMUP_SCHEDULED = False

# Generation ID ranges (National Dex) — inclusive
# Source: https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_National_Pok%C3%A9dex_number
GEN_ID_RANGES = {
    '1': (1, 151),
    '2': (152, 251),
    '3': (252, 386),
    '4': (387, 493),
    '5': (494, 649),
    '6': (650, 721),
    '7': (722, 809),
    '8': (810, 905),
    '9': (906, 1025),  # update if new gens are added
}


def _filter_ids_by_gen(ids, gen: str):
    """Return subset of ids restricted to the given generation(s).
    - Accepts 'all', '', None -> no filtering.
    - Accepts single gen like '3'.
    - Accepts CSV like '1,3,5' (order and spaces ignored).
    If no valid gens are recognized, return the original ids.
    """
    if not gen:
        return ids
    g = str(gen).lower().strip()
    if not g or g in {'all', 'any', '0'}:
        return ids
    # Parse CSV of gens
    gens = [s.strip() for s in g.replace('|', ',').split(',') if s.strip()]
    ranges = [GEN_ID_RANGES.get(s) for s in gens]
    ranges = [r for r in ranges if r]
    if not ranges:
        return ids
    allowed = set()
    for lo, hi in ranges:
        for i in ids:
            if lo <= i <= hi:
                allowed.add(i)
    if not allowed:
        return ids
    return [i for i in ids if i in allowed]


def filter_pokemon_list_by_gen(lst, gen: str):
    """Filter a list of pokemon dicts (with 'id') by generation."""
    if not gen:
        return lst
    ids = [p['id'] for p in lst]
    allowed = set(_filter_ids_by_gen(ids, gen))
    if not allowed:
        return lst
    return [p for p in lst if p['id'] in allowed]


def pick_random_id_for_gen(gen: str):
    """Pick a random available pokemon id for the given generation, based on cached list."""
    lst = get_pokemon_list()
    ids = [p['id'] for p in lst]
    choices = _filter_ids_by_gen(ids, gen)
    if not choices:
        choices = ids
    return random.choice(choices)


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


def get_species_metadata(poke_id: int):
    """Return cached species metadata: color name and generation number as strings.
    Example: { 'color': 'red', 'generation': '1' }
    Falls back to empty strings if unavailable.
    """
    if poke_id in SPECIES_META:
        return SPECIES_META[poke_id]
    try:
        url = f"{POKEAPI_BASE}/pokemon-species/{poke_id}"
        r = requests.get(url, timeout=12)
        r.raise_for_status()
        j = r.json()
        color = ''
        try:
            color = (j.get('color') or {}).get('name') or ''
        except Exception:
            color = ''
        gen = ''
        try:
            gen_name = (j.get('generation') or {}).get('name') or ''  # e.g., 'generation-ii'
            # Extract trailing roman numeral or number and map to 1..9
            # Expected format 'generation-i'..'generation-ix'
            if '-' in gen_name:
                suffix = gen_name.split('-')[-1]
                roman_map = {
                    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
                    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
                }
                gen = roman_map.get(suffix.lower(), '')
            if not gen:
                # fallback by id ranges (approximate)
                for g, (lo, hi) in GEN_ID_RANGES.items():
                    if lo <= int(poke_id) <= hi:
                        gen = str(g)
                        break
        except Exception:
            gen = ''
        meta = {'color': color, 'generation': gen}
        SPECIES_META[poke_id] = meta
        return meta
    except Exception:
        meta = {'color': '', 'generation': ''}
        SPECIES_META[poke_id] = meta
        return meta


def get_cry_for_pokemon(poke_id):
    """Return a cry (scream) audio URL and slug name for the Pokémon id.
    Tries 'latest' cry first, then falls back to 'legacy' if needed.
    Returns (audio_url_or_None, name_slug_str).
    """
    url = f"{POKEAPI_BASE}/pokemon/{poke_id}"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    j = r.json()
    cry = None
    try:
        cries = j.get('cries') or {}
        cry = cries.get('latest') or cries.get('legacy')
    except Exception:
        cry = None
    return cry, j.get('name')


def _fetch_and_cache_species(pid: int):
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
    if 'en' not in lang_map:
        for p in get_pokemon_list():
            if p['id'] == pid:
                lang_map['en'] = p['display_en']
                break
    SPECIES_NAMES[pid] = {**SPECIES_NAMES.get(pid, {}), **lang_map}


def warm_up_all_names():
    global WARMED
    try:
        lst = get_pokemon_list()
        ids = [p['id'] for p in lst]
        futures = [EXECUTOR.submit(_fetch_and_cache_species, pid) for pid in ids]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception:
                pass
        WARMED = True
    except Exception:
        WARMED = False


def ensure_language_filled(lang: str):
    lst = get_pokemon_list()
    missing = [p['id'] for p in lst if lang not in SPECIES_NAMES.get(p['id'], {})]
    if not missing:
        return
    futures = [EXECUTOR.submit(_fetch_and_cache_species, pid) for pid in missing]
    for f in as_completed(futures):
        try:
            f.result()
        except Exception:
            pass


def normalize_name(s: str) -> str:
    if not isinstance(s, str):
        s = str(s)
    s = s.strip()
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    # Map locale-specific letters
    s = s.replace('ß', 'ss')
    # Remove gender symbols and any non-alphanumeric characters
    s = s.replace('♂', '').replace('♀', '')
    s = ''.join(ch for ch in s if ('a' <= ch <= 'z') or ('0' <= ch <= '9'))
    return s



def get_pokedex_entry(poke_id: int, lang: str) -> str:
    """Fetch a Pokédex flavor text for given Pokémon id in the requested language.
    Falls back to English, then to any available, and cleans whitespace/newlines.
    """
    try:
        l = lang.lower() if isinstance(lang, str) else 'en'
        if l not in SUPPORTED_LANGS:
            l = 'en'
        # species endpoint contains flavor_text_entries
        url = f"{POKEAPI_BASE}/pokemon-species/{poke_id}"
        r = requests.get(url, timeout=12)
        r.raise_for_status()
        j = r.json()
        entries = j.get('flavor_text_entries', []) or []
        def clean(txt: str) -> str:
            if not isinstance(txt, str):
                txt = str(txt or '')
            # Replace form feed and newlines with spaces, compress spaces
            txt = txt.replace('\f', ' ').replace('\n', ' ').replace('\r', ' ')
            return ' '.join(txt.split())
        # Try in preferred language
        for e in entries:
            lang_name = (e.get('language') or {}).get('name')
            if lang_name == l and e.get('flavor_text'):
                return clean(e['flavor_text'])
        # Fallback to English
        for e in entries:
            lang_name = (e.get('language') or {}).get('name')
            if lang_name == 'en' and e.get('flavor_text'):
                return clean(e['flavor_text'])
        # Any available
        for e in entries:
            if e.get('flavor_text'):
                return clean(e['flavor_text'])
        return ''
    except Exception:
        return ''
