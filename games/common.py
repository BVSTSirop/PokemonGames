from typing import Set, Tuple

from services.pokemon import (
    SUPPORTED_LANGS,
    get_pokemon_list,
    get_localized_name,
    ensure_language_filled,
    normalize_name,
)


def _display_en_and_slug(pid: int):
    display_en = None
    slug = None
    for p in get_pokemon_list():
        if p["id"] == pid:
            display_en = p.get("display_en")
            slug = p.get("slug")
            break
    return display_en, slug


def build_aliases(pid: int, lang: str) -> Tuple[Set[str], str]:
    """
    Build a robust set of normalized aliases for a Pokémon id, covering:
    - PokeAPI slug
    - English display name
    - Localized name in current UI language (with cache warmup)
    - All supported localized names as a final fallback

    Returns (aliases_set, localized_display_name_for_lang)
    """
    l = (lang or "en").lower()
    if l not in SUPPORTED_LANGS:
        l = "en"

    aliases: Set[str] = set()

    display_en, slug = _display_en_and_slug(pid)

    # Base identifiers
    if slug:
        aliases.add(normalize_name(slug))
    if display_en:
        aliases.add(normalize_name(display_en))

    # Attempt preferred language
    try:
        localized = get_localized_name(pid, l)
    except Exception:
        localized = display_en or slug
    if localized:
        aliases.add(normalize_name(localized))

    # Ensure cache for preferred language and retry once
    try:
        ensure_language_filled(l)
        try:
            localized2 = get_localized_name(pid, l)
            if localized2:
                aliases.add(normalize_name(localized2))
                localized = localized2 or localized
        except Exception:
            pass
    except Exception:
        pass

    # Add all supported localized names as a final safety net
    for lang_code in SUPPORTED_LANGS:
        try:
            nm = get_localized_name(pid, lang_code)
            if nm:
                aliases.add(normalize_name(nm))
        except Exception:
            continue

    return aliases, (localized or display_en or slug or "")
