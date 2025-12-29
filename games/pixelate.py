from flask import Blueprint, jsonify, render_template, request, current_app

from services.pokemon import (
    SUPPORTED_LANGS,
    get_localized_name,
    get_sprite_for_pokemon,
    pick_random_id_for_gen,
    get_species_metadata,
)
from services.tokens import sign_token as _sign_token

bp = Blueprint('pixelate', __name__)



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
                meta = get_species_metadata(pid)
                return jsonify({
                    'token': token,
                    'id': pid,
                    'name': display_name,
                    'sprite': sprite,
                    'color': meta.get('color') or '',
                    'generation': meta.get('generation') or '',
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
