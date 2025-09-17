from flask import Blueprint, jsonify, render_template, request
import random
import secrets

from services.pokemon import (
    SUPPORTED_LANGS,
    get_pokemon_list,
    get_localized_name,
    get_pokedex_entry,
    normalize_name,
    pick_random_id_for_gen,
)

bp = Blueprint('entry', __name__, url_prefix='/entry')

# In-memory token store for entry guess sessions
TOKENS = {}  # token -> { 'name': str, 'id': int }


@bp.route('/')
def index():
    return render_template('entry_guess.html', active_page='entry')


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
                token = secrets.token_urlsafe(16)
                # store canonical english slug for robust matching
                display_name = get_localized_name(pid, lang)
                TOKENS[token] = {'name': display_name, 'id': pid}
                return jsonify({
                    'token': token,
                    'name': display_name,
                    'entry': entry,
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
    if not token or token not in TOKENS:
        return jsonify({"error": "Invalid token"}), 400
    answer = TOKENS.get(token)
    guess_norm = normalize_name(guess)
    # compare against localized, english display and slug-normalized name
    display_loc = get_localized_name(answer['id'], lang)
    display_loc_norm = normalize_name(display_loc)
    # english display
    display_en = None
    for p in get_pokemon_list():
        if p['id'] == answer['id']:
            display_en = p['display_en']
            slug = p['slug']
            break
    display_en_norm = normalize_name(display_en) if display_en else ''
    slug_norm = normalize_name(slug) if slug else ''
    is_correct = guess_norm in {display_loc_norm, display_en_norm, slug_norm}
    return jsonify({
        'correct': bool(is_correct),
        'name': display_loc
    })
