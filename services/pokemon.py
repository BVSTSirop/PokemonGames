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
VARIANT_GUESS_CACHE = {}  # normalized guess -> base species id (or None if unknown)

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
    """Return cached list of base species with ids and English display names.
    Uses the pokemon-species endpoint to avoid default-form names like
    "aegislash-shield" leaking in from /pokemon. This ensures suggestions
    and listings always use base species names (e.g., "Aegislash").
    """
    global POKEMON_LIST, DISPLAY_TO_ID, POKEMON_NAMES
    if POKEMON_LIST:
        return POKEMON_LIST
    # Use species index rather than /pokemon to avoid form names
    url = f"{POKEAPI_BASE}/pokemon-species?limit=20000"
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
    # Filter to known species id range (defensive; species API already is species-only)
    try:
        max_species_id = max(hi for (_, hi) in GEN_ID_RANGES.values())
    except Exception:
        max_species_id = 1025
    lst = [p for p in lst if isinstance(p.get('id'), int) and p['id'] <= max_species_id]
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
    # Always return the base species display name (English) instead of the form name
    try:
        base_name = get_localized_name(poke_id, 'en')
    except Exception:
        # Fallbacks: try cached list, then raw API name
        base_name = None
        try:
            for p in get_pokemon_list():
                if p['id'] == poke_id:
                    base_name = p.get('display_en')
                    break
        except Exception:
            pass
        if not base_name:
            base_name = j.get('name') or str(poke_id)
            if isinstance(base_name, str):
                base_name = base_name.replace('-', ' ').title()
    return art, base_name


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


# --- Variant/form guess resolution helpers ---
def _slugify_guess_for_form_lookup(guess: str) -> list[str]:
    """Generate possible PokeAPI form name candidates for a free-text guess.
    Examples:
      "Zacian Crowned" -> ["zacian-crowned"]
      "Mega Charizard X" -> ["charizard-mega-x", "charizard-mega"]
      "Gigantamax Charizard" -> ["charizard-gmax"]
      "Alolan Raichu" -> ["raichu-alola", "raichu-alolan"]
      "Galarian Meowth" -> ["meowth-galar", "meowth-galarian"]
      "Hisuian Growlithe" -> ["growlithe-hisui", "growlithe-hisuian"]
      "Paldean Tauros" -> ["tauros-paldea", "tauros-paldean"]
      "Kyurem Black" -> ["kyurem-black"]
      "Kyurem White" -> ["kyurem-white"]
      "Castform Rainy" -> ["castform-rainy"]
    The list is ordered from most-specific to more-generic candidates.
    """
    if not isinstance(guess, str):
        return []
    g = (guess or '').strip().lower()
    # Basic tokenization
    tokens = [t for t in g.replace('_', ' ').replace('-', ' ').split() if t]
    if not tokens:
        return []

    # Recognize regional adjectives
    region_map = {
        'alolan': 'alola', 'alola': 'alola',
        'galarian': 'galar', 'galar': 'galar',
        'hisuian': 'hisui', 'hisui': 'hisui',
        'paldean': 'paldea', 'paldea': 'paldea',
    }
    # Form keywords left as-is
    form_words = {
        'crowned', 'hero', 'blade', 'shield', 'therian', 'incarnate', 'origin',
        'black', 'white', 'sunny', 'rainy', 'snowy', 'plant', 'sandy', 'trash',
        'east', 'west', 'ice', 'ice-rider', 'shadow', 'school', 'solo', 'amped', 'low-key',
        'dusk', 'dawn', 'midday', 'midnight', 'busted', 'disguised', 'complete', '10', '50', 'speed',
    }
    # Special mechanics
    is_mega = 'mega' in tokens
    is_gmax = ('gigantamax' in tokens) or ('gmax' in tokens)

    # Identify base name (first token that isn't an adjective like alolan/galarian/hisuian/paldean/mega/gmax/gigantamax)
    base_tokens = [t for t in tokens if t not in {'alolan', 'alola', 'galarian', 'galar', 'hisuian', 'hisui', 'paldean', 'paldea', 'mega', 'gigantamax', 'gmax'}]
    if not base_tokens:
        base_tokens = tokens[:]  # fallback
    base = base_tokens[0]

    # Extract qualifiers (other tokens excluding base)
    qualifiers = [t for t in tokens if t != base]
    # Map regional adjectives to form suffix
    region_suffixes = [region_map[t] for t in qualifiers if t in region_map]
    # Other form words kept verbatim
    other_suffixes = [t for t in qualifiers if (t not in region_map and t not in {'mega', 'gigantamax', 'gmax'})]

    candidates: list[str] = []

    # Regional forms: base-region
    for r in region_suffixes:
        candidates.append(f"{base}-{r}")
        # also accept adjective style just in case
        candidates.append(f"{base}-{r}ian")

    # Direct form words: base-suffix
    for s in other_suffixes:
        s_norm = s.replace(' ', '-')
        candidates.append(f"{base}-{s_norm}")

    # Mega forms
    if is_mega:
        # Handle possible X/Y
        xy = [t for t in qualifiers if t in {'x', 'y'}]
        if xy:
            for v in xy:
                candidates.append(f"{base}-mega-{v}")
        candidates.append(f"{base}-mega")

    # Gigantamax forms
    if is_gmax:
        candidates.append(f"{base}-gmax")

    # Fallback: concat tokens with hyphen as typed order
    candidates.append('-'.join(tokens))

    # Deduplicate while preserving order
    seen = set()
    out = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def resolve_variant_guess_to_species_id(guess: str):
    """Try to map a free-text guess that may include a form/variant to the base species id.
    Returns an int species id if resolved, or None otherwise. Caches results.
    """
    try:
        key = normalize_name(guess)
    except Exception:
        key = str(guess or '')
    if key in VARIANT_GUESS_CACHE:
        return VARIANT_GUESS_CACHE[key]

    try:
        candidates = _slugify_guess_for_form_lookup(guess)
        for cand in candidates:
            # Try pokemon-form first (best for forms/variants)
            try:
                url = f"{POKEAPI_BASE}/pokemon-form/{cand}"
                r = requests.get(url, timeout=8)
                if r.status_code == 200:
                    fj = r.json()
                    # Get base pokemon id from form json
                    p = (fj.get('pokemon') or {})
                    p_url = p.get('url') or ''
                    parts = [pp for pp in p_url.strip('/').split('/') if pp]
                    pid = int(parts[-1]) if parts and parts[-1].isdigit() else None
                    if pid:
                        # Fetch species id from pokemon endpoint
                        r2 = requests.get(f"{POKEAPI_BASE}/pokemon/{pid}", timeout=8)
                        r2.raise_for_status()
                        pj = r2.json()
                        s_url = (pj.get('species') or {}).get('url') or ''
                        s_parts = [pp for pp in s_url.strip('/').split('/') if pp]
                        sid = int(s_parts[-1]) if s_parts and s_parts[-1].isdigit() else None
                        if isinstance(sid, int):
                            VARIANT_GUESS_CACHE[key] = sid
                            return sid
            except Exception:
                # ignore and try next candidate
                pass
    except Exception:
        pass

    VARIANT_GUESS_CACHE[key] = None
    return None
