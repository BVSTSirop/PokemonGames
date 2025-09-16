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

POKEAPI_BASE = 'https://pokeapi.co/api/v2'
SUPPORTED_LANGS = {'en', 'es', 'fr', 'de'}

# Thread pool for parallel species fetches (bounded to be polite to PokeAPI)
EXECUTOR = ThreadPoolExecutor(max_workers=8)

# Warmup flags
WARMED = False
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
    for ch in [' ', '-', "'", '’', '´', '`', '.']:
        s = s.replace(ch, '')
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
