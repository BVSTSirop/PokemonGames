import requests
from .core import POKEAPI_BASE
from .names import get_localized_name, get_pokemon_list


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
