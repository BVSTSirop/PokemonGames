from flask import Blueprint, jsonify, render_template, request, current_app
import random
import secrets
import hmac
import hashlib
from concurrent.futures import as_completed

from services.pokemon import (
    SUPPORTED_LANGS,
    EXECUTOR,
    fetch_all_pokemon_names,
    get_pokemon_list,
    get_localized_name,
    get_sprite_for_pokemon,
    ensure_language_filled,
    normalize_name,
    SPECIES_NAMES,
    filter_pokemon_list_by_gen,
    pick_random_id_for_gen,
)

bp = Blueprint('guess', __name__)

# In-memory token store for guess game sessions (legacy, kept for backward compatibility)
TOKENS = {}  # token -> { 'name': str, 'id': int }


def _sign_token(poke_id: int) -> str:
    """Create a stateless signed token that encodes the Pokémon id.
    Format: "<id>.<hex_sha256_hmac>" where HMAC is over the ascii id using app.secret_key.
    """
    try:
        key = (current_app.secret_key or '').encode('utf-8')
    except Exception:
        key = b''
    msg = str(int(poke_id)).encode('ascii')
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return f"{int(poke_id)}.{sig}"


def _verify_token(token: str):
    """Verify signed token and return embedded Pokémon id (int) or None if invalid."""
    if not isinstance(token, str) or '.' not in token:
        return None
    pid_str, sig_hex = token.split('.', 1)
    try:
        pid = int(pid_str)
    except Exception:
        return None
    try:
        key = (current_app.secret_key or '').encode('utf-8')
    except Exception:
        key = b''
    msg = str(pid).encode('ascii')
    expected = hmac.new(key, msg, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, sig_hex):
        return pid
    return None


@bp.route('/')
def index():
    return render_template('guess.html', active_page='guess')


@bp.route('/api/all-names')
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


@bp.route('/api/pokemon-names')
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
                    # ensure_language_filled will parallel fetch
                    ensure_language_filled(lang)
                except Exception:
                    pass
                name = SPECIES_NAMES.get(pid, {}).get(lang) or p['display_en']
            names_loc.append(name)
        return jsonify(names_loc)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route('/api/pokemon-suggest')
def pokemon_suggest():
    try:
        q = (request.args.get('q') or '').strip()
        limit = int(request.args.get('limit', '20'))
        lang = (request.args.get('lang') or 'en').lower()
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


@bp.route('/api/random-sprite')
def random_sprite():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        for _ in range(15):
            pid = pick_random_id_for_gen(gen)
            sprite, name = get_sprite_for_pokemon(pid)
            if sprite:
                # Use stateless signed token; also store legacy mapping for backward compatibility
                token = _sign_token(pid)
                TOKENS[token] = { 'name': name, 'id': pid }
                bg_size = '500% 500%'
                x = random.randint(15, 85)
                y = random.randint(15, 85)
                bg_pos = f"{x}% {y}%"
                display_name = get_localized_name(pid, lang)
                return jsonify({
                    'token': token,
                    'name': display_name,
                    'sprite': sprite,
                    'bg_size': bg_size,
                    'bg_pos': bg_pos,
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route('/api/check-guess', methods=['POST'])
def check_guess():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    guess = data.get('guess', '')
    lang = (data.get('lang') or 'en').lower()
    if lang not in SUPPORTED_LANGS:
        lang = 'en'

    # Resolve token: accept legacy in-memory tokens or stateless signed tokens
    answer = None
    if token and token in TOKENS:
        answer = TOKENS.get(token)
    else:
        pid = _verify_token(token) if token else None
        if pid is not None:
            # Build an answer dict from cached list
            display_en = None
            slug = None
            for p in get_pokemon_list():
                if p['id'] == pid:
                    display_en = p['display_en']
                    slug = p['slug']
                    break
            if pid and (display_en or slug):
                answer = {'id': pid, 'name': slug or display_en}
    if not answer:
        return jsonify({"error": "Invalid token"}), 400

    guess_norm = normalize_name(guess)

    # Build a robust alias set for the selected Pokémon so localized guesses
    # across languages are accepted even under transient cache warmups.
    aliases = set()

    # Slug from PokeAPI (always available or reconstructed)
    if answer.get('name'):
        aliases.add(normalize_name(answer['name']))

    # English display name
    display_en = None
    for p in get_pokemon_list():
        if p['id'] == answer['id']:
            display_en = p['display_en']
            break
    if display_en:
        aliases.add(normalize_name(display_en))

    # Localized name in current UI language (may fetch on-demand)
    try:
        localized = get_localized_name(answer['id'], lang)
    except Exception:
        localized = display_en or answer.get('name')
    if localized:
        aliases.add(normalize_name(localized))

    # Fast path check
    if guess_norm in aliases:
        return jsonify({'correct': True, 'name': localized})

    # If not matched, ensure current language cache and retry once
    try:
        ensure_language_filled(lang)
        # Re-add current-lang name from cache
        try:
            localized2 = get_localized_name(answer['id'], lang)
            aliases.add(normalize_name(localized2))
            localized = localized2 or localized
        except Exception:
            pass
    except Exception:
        pass
    if guess_norm in aliases:
        return jsonify({'correct': True, 'name': localized})

    # Final fallback: compare against all supported localized names deterministically
    # This is limited to a handful of languages and only happens on edge cases.
    for l in SUPPORTED_LANGS:
        try:
            nm = get_localized_name(answer['id'], l)
            if nm:
                nn = normalize_name(nm)
                aliases.add(nn)
                if guess_norm == nn:
                    # Return name in the current UI language for consistency
                    try:
                        localized_final = get_localized_name(answer['id'], lang)
                    except Exception:
                        localized_final = nm
                    return jsonify({'correct': True, 'name': localized_final})
        except Exception:
            continue

    # No match — incorrect
    # Return localized name for UI messaging (current language or fallback)
    try:
        localized = get_localized_name(answer['id'], lang)
    except Exception:
        localized = display_en or answer.get('name')
    return jsonify({'correct': False, 'name': localized})
