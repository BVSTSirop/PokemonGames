import os
import random
import secrets
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# In-memory caches
POKEMON_NAMES = []
TOKENS = {}  # token -> { 'name': str, 'id': int }

POKEAPI_BASE = 'https://pokeapi.co/api/v2'


def fetch_all_pokemon_names():
    global POKEMON_NAMES
    if POKEMON_NAMES:
        return POKEMON_NAMES
    url = f"{POKEAPI_BASE}/pokemon?limit=20000"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    names = [item['name'] for item in data.get('results', [])]
    # Normalize display casing for nicer UI (capitalize each properly)
    display_names = [n.replace('-', ' ').title() for n in names]
    # Map for checking guesses later we accept various casings and dashes/spaces
    POKEMON_NAMES = display_names
    return POKEMON_NAMES


def get_sprite_for_pokemon(poke_id):
    # Try multiple sprite sources for better quality; fall back appropriately
    url = f"{POKEAPI_BASE}/pokemon/{poke_id}"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    j = r.json()
    # Official artwork preferred
    art = (
        j['sprites'].get('other', {})
        .get('official-artwork', {})
        .get('front_default')
    )
    if not art:
        art = j['sprites'].get('front_default')
    if not art:
        # As a last resort, use any other available sprite URL within nested fields
        other = j['sprites'].get('other', {})
        for k in other.values():
            if isinstance(k, dict) and k.get('front_default'):
                art = k['front_default']
                break
    return art, j['name']


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/pokemon-names')
def pokemon_names():
    try:
        names = fetch_all_pokemon_names()
        return jsonify(names)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/pokemon-suggest')
def pokemon_suggest():
    try:
        q = (request.args.get('q') or '').strip()
        limit = int(request.args.get('limit', '20'))
        if limit <= 0:
            limit = 20
        names = fetch_all_pokemon_names()
        if not q:
            # Do not return the whole list when empty input; return empty suggestions
            return jsonify([])
        q_low = q.lower()
        # First pass: startswith
        starts = [n for n in names if n.lower().startswith(q_low)]
        if len(starts) < limit:
            # Second pass: contains (excluding those already added)
            contains = [n for n in names if q_low in n.lower() and n not in starts]
            result = (starts + contains)[:limit]
        else:
            result = starts[:limit]
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/random-sprite')
def random_sprite():
    # Choose random ID in the supported range by PokeAPI; as of now > 1000
    try:
        names = fetch_all_pokemon_names()
        max_id = 1025  # rough upper bound; not all ids exist but many do
        # Try up to a few times to find a Pokémon with a valid sprite
        for _ in range(10):
            pid = random.randint(1, max_id)
            sprite, name = get_sprite_for_pokemon(pid)
            if sprite:
                token = secrets.token_urlsafe(16)
                TOKENS[token] = { 'name': name, 'id': pid }
                # Generate random background positioning to emulate a crop
                # Increase zoom so we reveal less of the sprite (harder)
                # We'll set background-size to 500% so an even smaller snippet is shown initially
                bg_size = '500% 500%'
                # random position in %
                x = random.randint(0, 100)
                y = random.randint(0, 100)
                bg_pos = f"{x}% {y}%"
                return jsonify({
                    'token': token,
                    'name': name.replace('-', ' ').title(),  # for reveal
                    'sprite': sprite,
                    'bg_size': bg_size,
                    'bg_pos': bg_pos,
                })
        return jsonify({"error": "Could not find a sprite."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def normalize_name(s: str) -> str:
    return s.strip().lower().replace(' ', '-').replace("'", "").replace(".", "")


@app.route('/api/check-guess', methods=['POST'])
def check_guess():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    guess = data.get('guess', '')
    if not token or token not in TOKENS:
        return jsonify({"error": "Invalid token"}), 400
    answer = TOKENS.get(token)
    is_correct = normalize_name(guess) == normalize_name(answer['name'])
    return jsonify({
        'correct': bool(is_correct),
        'name': answer['name'].replace('-', ' ').title()
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
