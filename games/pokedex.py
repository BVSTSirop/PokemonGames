from flask import Blueprint, jsonify, render_template, request, current_app
import random
import secrets
import re
import hmac
import hashlib

from services.pokemon import (
    SUPPORTED_LANGS,
    get_pokemon_list,
    get_localized_name,
    get_pokedex_entry,
    normalize_name,
    pick_random_id_for_gen,
    get_species_metadata,
    get_sprite_for_pokemon,
)

bp = Blueprint('pokedex', __name__, url_prefix='/pokedex')

# In-memory token store for entry guess sessions (legacy, kept for backward compatibility)
TOKENS = {}  # token -> { 'name': str, 'id': int }


@bp.route('/')
def index():
    return render_template('pokedex.html', active_page='entry')


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


@bp.route('/api/random-entry')
def random_entry():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        for _ in range(30):
            pid = pick_random_id_for_gen(gen)
            entry = get_pokedex_entry(pid, lang)
            if entry:
                token = _sign_token(pid)
                # store canonical english slug for robust matching
                display_name = get_localized_name(pid, lang)
                # Mask the Pokémon's name in the entry (replace letters with underscores)
                def mask_letters(s: str) -> str:
                    return ''.join('_' if ch.isalpha() else ch for ch in s)
                masked_entry = entry
                if display_name:
                    pattern = re.compile(re.escape(display_name), flags=re.IGNORECASE)
                    masked_entry = pattern.sub(lambda m: mask_letters(m.group(0)), masked_entry)
                # Also try masking the English name in case it appears in the localized entry
                try:
                    display_en = get_localized_name(pid, 'en')
                except Exception:
                    display_en = None
                if display_en and display_en.lower() != (display_name or '').lower():
                    pattern_en = re.compile(re.escape(display_en), flags=re.IGNORECASE)
                    masked_entry = pattern_en.sub(lambda m: mask_letters(m.group(0)), masked_entry)
                TOKENS[token] = {'name': display_name, 'id': pid}
                meta = get_species_metadata(pid)
                sprite_url, _ = get_sprite_for_pokemon(pid)
                return jsonify({
                    'token': token,
                    'id': pid,
                    'name': display_name,
                    'entry': masked_entry,
                    'color': meta.get('color') or '',
                    'generation': meta.get('generation') or '',
                    'sprite': sprite_url or '',
                })
        return jsonify({"error": "Could not find a Pokédex entry."}), 500
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

    # Build a robust alias set like sprite game
    aliases = set()

    if answer.get('name'):
        aliases.add(normalize_name(answer['name']))

    display_en = None
    for p in get_pokemon_list():
        if p['id'] == answer['id']:
            display_en = p['display_en']
            break
    if display_en:
        aliases.add(normalize_name(display_en))

    try:
        localized = get_localized_name(answer['id'], lang)
    except Exception:
        localized = display_en or answer.get('name')
    if localized:
        aliases.add(normalize_name(localized))

    if guess_norm in aliases:
        return jsonify({'correct': True, 'name': localized})

    try:
        # Ensure language cache and retry once
        from services.pokemon import ensure_language_filled as _ensure
        _ensure(lang)
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

    for l in SUPPORTED_LANGS:
        try:
            nm = get_localized_name(answer['id'], l)
            if nm:
                nn = normalize_name(nm)
                aliases.add(nn)
                if guess_norm == nn:
                    try:
                        localized_final = get_localized_name(answer['id'], lang)
                    except Exception:
                        localized_final = nm
                    return jsonify({'correct': True, 'name': localized_final})
        except Exception:
            continue

    try:
        localized = get_localized_name(answer['id'], lang)
    except Exception:
        localized = display_en or answer.get('name')
    return jsonify({'correct': False, 'name': localized})
