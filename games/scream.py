from flask import Blueprint, jsonify, render_template, request
import random
import secrets
from concurrent.futures import as_completed

from services.pokemon import (
    SUPPORTED_LANGS,
    EXECUTOR,
    get_pokemon_list,
    get_localized_name,
    ensure_language_filled,
    normalize_name,
    SPECIES_NAMES,
    filter_pokemon_list_by_gen,
    pick_random_id_for_gen,
    get_cry_for_pokemon,
    resolve_guess_to_id,
)

bp = Blueprint('scream', __name__)

# In-memory token store for scream game sessions
TOKENS = {}  # token -> { 'name': str, 'id': int }


@bp.route('/scream')
def index():
    return render_template('scream.html', active_page='scream')


@bp.route('/api/scream/all-names')
def all_names():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        lst = get_pokemon_list()
        lst = filter_pokemon_list_by_gen(lst, gen)
        if lang == 'en':
            names = [p['display_en'] for p in lst]
            return jsonify(names)
        ensure_language_filled(lang)
        names = []
        for p in lst:
            pid = p['id']
            nm = SPECIES_NAMES.get(pid, {}).get(lang) or p['display_en']
            names.append(nm)
        return jsonify(names)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route('/api/scream/pokemon-names')
def pokemon_names():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        lst = get_pokemon_list()
        lst = filter_pokemon_list_by_gen(lst, gen)
        if lang == 'en':
            names = [p['display_en'] for p in lst]
            return jsonify(names)
        names_loc = []
        for p in lst:
            pid = p['id']
            name = SPECIES_NAMES.get(pid, {}).get(lang)
            if not name:
                try:
                    ensure_language_filled(lang)
                except Exception:
                    pass
                name = SPECIES_NAMES.get(pid, {}).get(lang) or p['display_en']
            names_loc.append(name)
        return jsonify(names_loc)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route('/api/scream/pokemon-suggest')
def pokemon_suggest():
    try:
        q = (request.args.get('q') or '').strip()
        limit = int(request.args.get('limit', '20'))
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        if limit <= 0:
            limit = 20
        lst = get_pokemon_list()
        lst = filter_pokemon_list_by_gen(lst, gen)
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
        results = []
        seen = set()

        cached_entries = []  # list of (id, name)
        missing_ids = []
        for p in lst:
            pid = p['id']
            name_loc = SPECIES_NAMES.get(pid, {}).get(lang)
            if name_loc:
                cached_entries.append((pid, name_loc))
            else:
                missing_ids.append(pid)

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

        for _, name_loc in cached_entries:
            if len(results) >= limit:
                break
            consider(name_loc)

        if len(results) >= limit or not missing_ids:
            return jsonify(results[:limit])

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
            if consider(name_loc) and len(results) >= limit:
                break

        return jsonify(results[:limit])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route('/api/random-cry')
def random_cry():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        for _ in range(20):
            pid = pick_random_id_for_gen(gen)
            audio, name = get_cry_for_pokemon(pid)
            if audio:
                token = secrets.token_urlsafe(16)
                TOKENS[token] = {'name': name, 'id': pid}
                display_name = get_localized_name(pid, lang)
                return jsonify({
                    'token': token,
                    'name': display_name,
                    'audio': audio,
                })
        return jsonify({"error": "Could not find a cry audio."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route('/api/scream/check-guess', methods=['POST'])
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

    # Primary: resolve guess to an id in the requested language (with fallbacks)
    guessed_id = resolve_guess_to_id(guess, lang)
    is_correct = (guessed_id == answer['id']) if guessed_id else False

    # Fallback: string-based comparison across slug, English and localized names
    if not is_correct:
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
    else:
        localized = get_localized_name(answer['id'], lang)

    return jsonify({
        'correct': bool(is_correct),
        'name': localized
    })
