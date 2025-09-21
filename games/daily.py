from flask import Blueprint, jsonify, render_template, request
from datetime import datetime, timezone
import hashlib

from services.pokemon import (
    get_pokemon_list,
    get_localized_name,
    ensure_language_filled,
    normalize_name,
    SPECIES_NAMES,
)

import requests

bp = Blueprint('daily', __name__)

# Simple in-memory cache for fetched attributes and evo chains
ATTR_CACHE = {}  # id -> attrs dict
CHAIN_CACHE = {}  # evo_chain_url -> parsed chain data
SPECIES_CACHE = {}  # id -> species json
POKEMON_CACHE = {}  # id -> pokemon json
# Name index per language: normalized name -> id (species id preferred)
NAME_INDEX = {}  # lang -> { normalized_name: id }


@bp.route('/daily')
def index():
    return render_template('daily.html', active_page='daily')


def _today_key_utc() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime('%Y-%m-%d')


def _pick_daily_id(date_key: str) -> int:
    lst = get_pokemon_list()
    if not lst:
        return 1
    # Deterministic selection based on date string
    h = hashlib.sha256(date_key.encode('utf-8')).hexdigest()
    num = int(h[:8], 16)
    idx = num % len(lst)
    return lst[idx]['id']


def _fetch_json(url: str, timeout: int = 12):
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.json()


def _get_species(pid: int):
    if pid in SPECIES_CACHE:
        return SPECIES_CACHE[pid]
    j = _fetch_json(f'https://pokeapi.co/api/v2/pokemon-species/{pid}')
    SPECIES_CACHE[pid] = j
    return j


def _species_id_for_pokemon(pid: int) -> int | None:
    try:
        pj = _get_pokemon(pid)
        s_url = (pj.get('species') or {}).get('url') or ''
        parts = [p for p in s_url.strip('/').split('/') if p]
        sid = int(parts[-1]) if parts and parts[-1].isdigit() else None
        return sid
    except Exception:
        return None


def _get_pokemon(pid: int):
    if pid in POKEMON_CACHE:
        return POKEMON_CACHE[pid]
    j = _fetch_json(f'https://pokeapi.co/api/v2/pokemon/{pid}')
    POKEMON_CACHE[pid] = j
    return j


def _parse_chain(node, path_prefix=None, out=None):
    if out is None:
        out = []
    if path_prefix is None:
        path_prefix = []
    species = (node.get('species') or {}).get('name')
    if species:
        cur_path = path_prefix + [species]
        out.append(cur_path)
    else:
        cur_path = path_prefix
    for nxt in node.get('evolves_to') or []:
        _parse_chain(nxt, cur_path, out)
    return out


def _get_chains_for_species_json(species_json: dict):
    """Return parsed evolution chains for a species JSON using its evolution_chain URL.
    Caches by evolution_chain URL to avoid redundant fetches."""
    try:
        evo_url = (species_json.get('evolution_chain') or {}).get('url')
    except Exception:
        evo_url = None
    if not evo_url:
        return []
    if evo_url in CHAIN_CACHE:
        return CHAIN_CACHE[evo_url]
    chain_json = _fetch_json(evo_url)
    chains = _parse_chain(chain_json.get('chain') or {})
    CHAIN_CACHE[evo_url] = chains
    return chains


def _attrs_for(pid: int):
    if pid in ATTR_CACHE:
        return ATTR_CACHE[pid]
    # Resolve to species id first (forms map to their species)
    species_id = _species_id_for_pokemon(pid) or pid
    sj = _get_species(species_id)
    # Use the species' default variety Pokémon for all attribute comparisons (ignore forms)
    try:
        varieties = sj.get('varieties') or []
        default_url = None
        for v in varieties:
            if v.get('is_default') and v.get('pokemon') and v['pokemon'].get('url'):
                default_url = v['pokemon']['url']
                break
        default_pid = None
        if default_url:
            parts = [p for p in default_url.strip('/').split('/') if p]
            default_pid = int(parts[-1]) if parts and parts[-1].isdigit() else None
    except Exception:
        default_pid = None
    base_pid = default_pid or species_id
    pj = _get_pokemon(base_pid)
    # Types ordered by slot (primary first)
    types_data = sorted(pj.get('types', []), key=lambda t: t.get('slot', 99))
    types = [t['type']['name'] for t in types_data]
    height = pj.get('height')  # decimeters
    weight = pj.get('weight')  # hectograms
    color = (sj.get('color') or {}).get('name')
    gen_url = (sj.get('generation') or {}).get('url') or ''
    gen_num = None
    try:
        if gen_url:
            # .../generation/7/
            parts = [p for p in gen_url.strip('/').split('/') if p]
            gen_num = int(parts[-1]) if parts and parts[-1].isdigit() else None
    except Exception:
        gen_num = None
    # Evolution paths as list of species name paths (from evolution_chain URL)
    chains = _get_chains_for_species_json(sj)
    # Map species slug to stage index within its path, and compute path lengths
    stage_map = {}
    path_len_map = {}  # species slug -> total stages (length of its path)
    family_set = set()
    for path in chains:
        for idx, sp in enumerate(path):
            stage_map[sp] = idx
            path_len_map[sp] = len(path)
            family_set.add(sp)
    # Own species slug
    own_slug = pj.get('species', {}).get('name') or pj.get('name')
    # Determine this species' stage (1-based) and total stages in its path
    own_stage_idx0 = stage_map.get(own_slug)
    own_stage_num = (own_stage_idx0 + 1) if own_stage_idx0 is not None else None
    own_stage_total = path_len_map.get(own_slug)
    attrs = {
        'types': types,
        'height': height,
        'weight': weight,
        'color': color,
        'generation': gen_num,
        'stage_map': stage_map,
        'stage_total_map': path_len_map,
        'family': family_set,
        'species_slug': own_slug,
        'species_id': species_id,
        'stage_num': own_stage_num,
        'stage_total': own_stage_total,
    }
    ATTR_CACHE[pid] = attrs
    return attrs


def _ensure_name_index(lang: str):
    """Build a fast normalized name -> id index for a language.
    Ensures localized names for that language are cached, then indexes:
    - English display names
    - English API slugs
    - Localized species names for the requested language
    """
    l = (lang or 'en').lower()
    idx = NAME_INDEX.get(l)
    if idx:
        return idx
    # Make sure localized names are available in SPECIES_NAMES for this language
    try:
        ensure_language_filled(l)
    except Exception:
        pass
    idx = {}
    lst = get_pokemon_list()
    for p in lst:
        pid = p['id']
        # Prefer species id; get_pokemon_list ids are species ids already for list
        en_name = p.get('display_en') or ''
        slug = p.get('slug') or ''
        if en_name:
            idx[normalize_name(en_name)] = pid
        if slug:
            idx[normalize_name(slug)] = pid
        # Add cached localized names if available
        loc_map = SPECIES_NAMES.get(pid) or {}
        loc = loc_map.get(l)
        if loc:
            idx[normalize_name(loc)] = pid
    NAME_INDEX[l] = idx
    return idx


def _resolve_guess_to_id(guess: str, lang: str) -> int | None:
    if not guess:
        return None
    gnorm = normalize_name(guess)
    # Use fast local index first (no network)
    idx = _ensure_name_index(lang)
    pid = idx.get(gnorm)
    if pid:
        return pid
    # Fallback: try English name/slug scan only (no network)
    for p in get_pokemon_list():
        if normalize_name(p.get('display_en') or '') == gnorm:
            return p['id']
        if normalize_name(p.get('slug') or '') == gnorm:
            return p['id']
    # As a last resort, if index is missing localized names, avoid heavy network calls here.
    # Return None so client shows 'Unknown Pokémon name'.
    return None


@bp.route('/api/daily/guess', methods=['POST'])
def api_guess():
    data = request.get_json(silent=True) or {}
    guess_raw = (data.get('guess') or '').strip()
    lang = (data.get('lang') or 'en').lower()
    date_key = _today_key_utc()
    answer_id = _pick_daily_id(date_key)

    guess_id = _resolve_guess_to_id(guess_raw, lang)
    if not guess_id:
        return jsonify({'error': 'Unknown Pokémon name'}), 400

    # Build feedback
    ans = _attrs_for(answer_id)
    gus = _attrs_for(guess_id)

    # Types: evaluate per slot (primary and secondary independently)
    ans_types = ans.get('types') or []
    gus_types = gus.get('types') or []
    # statuses per slot: 'correct' if equal (including both None), otherwise 'wrong'
    type_statuses = []
    for idx in range(2):
        a_t = ans_types[idx] if idx < len(ans_types) else None
        g_t = gus_types[idx] if idx < len(gus_types) else None
        # Be explicit: if both sides have no type for this slot, it's correct
        if a_t is None and g_t is None:
            type_statuses.append('correct')
        else:
            type_statuses.append('correct' if a_t == g_t else 'wrong')

    # Generation: binary status with directional hint
    gen_dir = None
    gen_status = 'wrong'
    if ans['generation'] and gus['generation']:
        if ans['generation'] == gus['generation']:
            gen_status = 'correct'
        elif gus['generation'] < ans['generation']:
            gen_dir = 'higher'
        else:
            gen_dir = 'lower'

    # Evolution relation (category)
    evo = 'unrelated'
    if gus['species_slug'] == ans['species_slug']:
        evo = 'same'
    else:
        fam = ans['family']
        if gus['species_slug'] in fam:
            # both in same family; compare stage indices if available
            smap = ans['stage_map'] or {}
            gi = smap.get(gus['species_slug'])
            ai = smap.get(ans['species_slug'])
            if gi is not None and ai is not None:
                if gi < ai:
                    evo = 'pre'
                elif gi > ai:
                    evo = 'post'
                else:
                    evo = 'same'
            else:
                evo = 'same-family'

    # Height/Weight: binary status with directional hint
    h_dir = None
    w_dir = None
    h_status = 'wrong'
    w_status = 'wrong'
    if isinstance(gus['height'], int) and isinstance(ans['height'], int):
        if gus['height'] == ans['height']:
            h_status = 'correct'
        elif gus['height'] < ans['height']:
            h_dir = 'higher'
        else:
            h_dir = 'lower'
    if isinstance(gus['weight'], int) and isinstance(ans['weight'], int):
        if gus['weight'] == ans['weight']:
            w_status = 'correct'
        elif gus['weight'] < ans['weight']:
            w_dir = 'higher'
        else:
            w_dir = 'lower'

    # Evolution stage numbers and comparison: binary with directional hint
    evo_stage_dir = None
    evo_stage_status = 'wrong'
    g_stage = gus.get('stage_num')
    a_stage = ans.get('stage_num')
    g_total = gus.get('stage_total')
    a_total = ans.get('stage_total')
    if isinstance(g_stage, int) and isinstance(a_stage, int):
        if g_stage == a_stage:
            evo_stage_status = 'correct'
        elif g_stage < a_stage:
            evo_stage_dir = 'higher'
        else:
            evo_stage_dir = 'lower'

    # Color
    color_match = (gus['color'] and ans['color'] and gus['color'] == ans['color'])

    # Consider correct if species matches (avoid form/variant mismatches)
    correct = (gus['species_slug'] == ans['species_slug'])

    # If the species is correct, treat scalar comparisons as correct too
    # to avoid marking different form-specific height/weight as partial.
    if correct:
        h_status = 'correct'
        w_status = 'correct'
        h_dir = None
        w_dir = None

    # Localized names for display (use species id to avoid 404 on forms)
    guess_name = get_localized_name(gus.get('species_id') or guess_id, lang)
    answer_name = get_localized_name(ans.get('species_id') or answer_id, lang)

    fb = {
        'name': guess_name,
        'species_id': gus.get('species_id') or guess_id,
        'types': {'value': gus['types'], 'status': type_statuses},
        # Binary status; dir carries 'higher'/'lower' hint when wrong
        'generation': {'value': gus['generation'], 'status': gen_status, 'dir': gen_dir},
        'evolution': {'value': evo},  # kept for backward compatibility
        'evo_stage': {'value': {'stage': g_stage, 'total': g_total}, 'status': evo_stage_status, 'dir': evo_stage_dir},
        'height': {'value': gus['height'], 'status': h_status, 'dir': h_dir},
        'weight': {'value': gus['weight'], 'status': w_status, 'dir': w_dir},
        'color': {'value': gus['color'], 'status': 'correct' if color_match else 'wrong'},
    }

    return jsonify({
        'correct': bool(correct),
        'guess': fb,
        'answer': answer_name if correct else None,
    })


@bp.route('/api/daily/translate', methods=['POST'])
def api_daily_translate():
    data = request.get_json(silent=True) or {}
    ids = data.get('ids') or []
    lang = (data.get('lang') or 'en').lower()
    try:
        ids = [int(x) for x in ids if isinstance(x, (int, str)) and str(x).isdigit()]
    except Exception:
        ids = []
    names = {}
    for pid in ids:
        try:
            names[str(pid)] = get_localized_name(pid, lang)
        except Exception:
            pass
    return jsonify({ 'names': names })
