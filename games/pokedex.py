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
from .common import build_aliases

bp = Blueprint('pokedex', __name__, url_prefix='/pokedex')

# In-memory token store for entry guess sessions (legacy, kept for backward compatibility)
TOKENS = {}  # token -> { 'name': str, 'id': int }


@bp.route('/')
def index():
    return render_template('pokedex.html', active_page='pokedex')



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


# Removed per-mode check-guess route; all clients must use POST /api/check-guess
