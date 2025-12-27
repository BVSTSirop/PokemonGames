from flask import Blueprint, jsonify, render_template, request, current_app
import hmac
import hashlib

from services.pokemon import (
    SUPPORTED_LANGS,
    get_pokemon_list,
    get_localized_name,
    get_sprite_for_pokemon,
    filter_pokemon_list_by_gen,
    pick_random_id_for_gen,
    get_species_metadata,
)

bp = Blueprint('silhouette', __name__)


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


@bp.route('/silhouette')
def index():
    return render_template('silhouette.html', active_page='silhouette')


@bp.route('/api/silhouette/random')
def random_silhouette():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        # Try up to N times to ensure we have a sprite
        for _ in range(15):
            pid = pick_random_id_for_gen(gen)
            sprite, name = get_sprite_for_pokemon(pid)
            if sprite:
                token = _sign_token(pid)
                display_name = get_localized_name(pid, lang)
                meta = get_species_metadata(pid)
                # For silhouettes we always want a centered, full image
                return jsonify({
                    'token': token,
                    'id': pid,
                    'name': display_name,
                    'sprite': sprite,
                    'bg_size': 'contain',
                    'bg_pos': 'center center',
                    'color': meta.get('color') or '',
                    'generation': meta.get('generation') or '',
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# While we could mirror name/suggestion endpoints with a /api/silhouette/ prefix,
# the shared front-end logic already uses the universal endpoints from the sprite game
# for names and checking guesses. The silhouette game only needs a random endpoint
# and will reuse POST /api/check-guess for validation.
