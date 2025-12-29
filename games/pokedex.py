from flask import Blueprint, jsonify, render_template, request, current_app
import random
import secrets
import re

from services.pokemon import (
    SUPPORTED_LANGS,
    get_pokemon_list,
    get_localized_name,
    get_pokedex_entry,
    normalize_name,
    pick_random_id_for_gen,
    get_species_metadata,
    get_sprite_for_pokemon,
    resolve_variant_guess_to_species_id,
)
from services.tokens import sign_token as _sign_token, verify_token as _verify_token

bp = Blueprint('pokedex', __name__, url_prefix='/pokedex')

# In-memory token store for entry guess sessions (legacy, kept for backward compatibility)
TOKENS = {}  # token -> { 'name': str, 'id': int }


@bp.route('/')
def index():
    return render_template('pokedex.html', active_page='entry')



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

    # Variant/form fallback: accept if guess maps to same species
    try:
        sid = resolve_variant_guess_to_species_id(guess)
        if isinstance(sid, int) and sid == answer['id']:
            try:
                localized_final = get_localized_name(answer['id'], lang)
            except Exception:
                localized_final = display_en or answer.get('name')
            return jsonify({'correct': True, 'name': localized_final})
    except Exception:
        pass

    try:
        localized = get_localized_name(answer['id'], lang)
    except Exception:
        localized = display_en or answer.get('name')
    return jsonify({'correct': False, 'name': localized})
