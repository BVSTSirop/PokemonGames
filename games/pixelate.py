from flask import Blueprint, jsonify, render_template, request, current_app
import hmac
import hashlib

from services.pokemon import (
    SUPPORTED_LANGS,
    get_localized_name,
    get_sprite_for_pokemon,
    pick_random_id_for_gen,
)

bp = Blueprint('pixelate', __name__)


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


@bp.route('/pixelate')
def index():
    return render_template('pixelate.html', active_page='pixelate')


@bp.route('/api/pixelate/random')
def random_pixelate():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'
        # Try up to N times to ensure we have a sprite
        for _ in range(15):
            pid = pick_random_id_for_gen(gen)
            sprite, _ = get_sprite_for_pokemon(pid)
            if sprite:
                token = _sign_token(pid)
                display_name = get_localized_name(pid, lang)
                return jsonify({
                    'token': token,
                    'name': display_name,
                    'sprite': sprite,
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
