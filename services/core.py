from concurrent.futures import ThreadPoolExecutor

# Constants
POKEAPI_BASE = 'https://pokeapi.co/api/v2'
SUPPORTED_LANGS = {'en', 'es', 'fr', 'de'}

# Generation ID ranges (National Dex) — inclusive
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

# Global state / caches
POKEMON_NAMES = []  # English display names list (title-cased)
POKEMON_LIST = []   # List of dicts: { 'id': int, 'slug': str, 'display_en': str }
DISPLAY_TO_ID = {}  # English display name -> id
SPECIES_NAMES = {}  # id -> { lang: localized_display }
SPECIES_META = {}   # id -> { 'color': str, 'generation': str }
VARIANT_GUESS_CACHE = {}  # normalized guess -> base species id (or None if unknown)

# Thread pool for parallel species fetches (bounded to be polite to PokeAPI)
EXECUTOR = ThreadPoolExecutor(max_workers=8)

# Warmup flags
WARMED = False
WARMUP_SCHEDULED = False
