import requests
from .core import POKEAPI_BASE, SUPPORTED_LANGS


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
