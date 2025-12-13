from flask import Blueprint, jsonify, render_template, request, current_app
import hmac
import hashlib
import os
import random
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from services.pokemon import (
    SUPPORTED_LANGS,
    get_localized_name,
    get_pokemon_list,
    pick_random_id_for_gen,
)

bp = Blueprint('tcg', __name__)


def _log_debug(message: str, **fields):
    """Best-effort debug logger that prefers Flask's app logger.
    Never logs secrets. Intended for troubleshooting TCG card fetching.
    """
    try:
        if fields:
            current_app.logger.debug(f"[TCG] {message} | {fields}")
        else:
            current_app.logger.debug(f"[TCG] {message}")
    except Exception:
        # Fallback to stdout if app logger not available
        try:
            print(f"[TCG] {message} | {fields}")
        except Exception:
            pass


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


def _tcg_api_key():
    # Prefer environment variable, fallback to provided key for convenience
    return os.environ.get('POKEMONTCG_API_KEY') or '9c9c723b-6163-4c89-9846-635ed3485caa'


# Shared HTTP session with retries/backoff
_TCG_SESSION = None


def _get_tcg_session():
    global _TCG_SESSION
    if _TCG_SESSION is not None:
        return _TCG_SESSION
    s = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.4,
        status_forcelist=[502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=20)
    s.mount('http://', adapter)
    s.mount('https://', adapter)
    _TCG_SESSION = s
    return s


# Simple in-memory cache for card image URLs, keyed by English name
TCG_IMAGE_CACHE = {}
TCG_IMAGE_TTL = 24 * 60 * 60  # 24 hours


def _find_card_image_for_pokemon(display_en: str):
    """Query TCGdex API for a card image for the given English display name.
    Returns (image_url, card_id) or (None, None).
    """
    # TCGdex v2 English endpoint; query via `name=`
    base = 'https://api.tcgdex.net/v2/en/cards'
    # Cache hit short-circuit
    now = time.time()
    cached = TCG_IMAGE_CACHE.get(display_en)
    if cached and cached.get('exp', 0) > now:
        _log_debug('Cache hit for display name', display_name=display_en)
        return cached['url'], cached['id']

    # TCGdex supports simple substring search by `name` param
    params_primary = { 'name': display_en }
    first_word = display_en.split()[0]
    params_fallback = { 'name': first_word }
    headers = {
        'User-Agent': 'pokemon-games/1.0 (+https://example.local)'
    }
    session = _get_tcg_session()
    timeout = (5, 8)  # (connect, read) seconds
    try:
        t0 = time.perf_counter()
        _log_debug('Searching TCG cards (primary)', display_name=display_en, params=params_primary)
        # Prepare request to capture the exact URL (including encoded params) for logging
        req_primary = requests.Request('GET', base, params=params_primary, headers=headers)
        prepped_primary = session.prepare_request(req_primary)
        _log_debug('Primary request URL', url=prepped_primary.url)
        resp = session.send(prepped_primary, timeout=timeout)
        resp.raise_for_status()
        data = resp.json() or []
        # TCGdex returns a list of card objects
        cards = data if isinstance(data, list) else []
        _log_debug('Primary query returned cards', count=len(cards), ms=round((time.perf_counter()-t0)*1000))
        # Filter to ones with image field
        candidates = []
        for c in cards:
            img = c.get('image')
            if not img:
                continue
            # Ensure we point to an actual image asset; add '/high.png' if missing extension
            if isinstance(img, str) and not img.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                img_url = img.rstrip('/') + '/high.png'
            else:
                img_url = img
            cid = c.get('id') or c.get('localId') or None
            candidates.append((img_url, cid))
        _log_debug('Primary candidates filtered', candidates=len(candidates))
        if not candidates:
            # Try a fallback broader search (first word of the name)
            t1 = time.perf_counter()
            _log_debug('No primary candidates, trying fallback', params=params_fallback)
            req_fallback = requests.Request('GET', base, params=params_fallback, headers=headers)
            prepped_fallback = session.prepare_request(req_fallback)
            _log_debug('Fallback request URL', url=prepped_fallback.url)
            resp2 = session.send(prepped_fallback, timeout=timeout)
            resp2.raise_for_status()
            data2 = resp2.json() or []
            cards2 = data2 if isinstance(data2, list) else []
            _log_debug('Fallback query returned cards', count=len(cards2), ms=round((time.perf_counter()-t1)*1000))
            for c in cards2:
                img = c.get('image')
                if not img:
                    continue
                if isinstance(img, str) and not img.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    img_url = img.rstrip('/') + '/high.png'
                else:
                    img_url = img
                cid = c.get('id') or c.get('localId') or None
                candidates.append((img_url, cid))
        _log_debug('All candidates (post-fallback if any)', candidates=len(candidates))
        if not candidates:
            _log_debug('No candidates found after all attempts', display_name=display_en)
            return None, None
        choice = random.choice(candidates)
        _log_debug('Selected candidate', card_id=choice[1], image_url=choice[0])
        # store in cache
        TCG_IMAGE_CACHE[display_en] = {'url': choice[0], 'id': choice[1], 'exp': now + TCG_IMAGE_TTL}
        return choice
    except Exception as e:
        _log_debug('Exception during TCG fetch', error=str(e), display_name=display_en)
        return None, None


@bp.route('/tcg')
def index():
    return render_template('tcg.html', active_page='tcg')


@bp.route('/api/tcg/random')
def random_tcg():
    try:
        lang = (request.args.get('lang') or 'en').lower()
        gen = (request.args.get('gen') or '').strip()
        if lang not in SUPPORTED_LANGS:
            lang = 'en'

        # We'll try multiple times to find a card image for a random Pokémon
        lst = get_pokemon_list()
        _log_debug('Starting TCG random round', lang=lang, gen=gen or 'all')
        for attempt in range(1, 9):
            pid = pick_random_id_for_gen(gen)
            _log_debug('Attempt pick', attempt=attempt, pid=pid)
            # Find display english name for pid
            display_en = None
            for p in lst:
                if p['id'] == pid:
                    display_en = p['display_en']
                    break
            if not display_en:
                _log_debug('No display_en found for pid, retrying', pid=pid)
                continue
            _log_debug('Resolved display_en', pid=pid, display_en=display_en)
            image_url, _card_id = _find_card_image_for_pokemon(display_en)
            if image_url:
                token = _sign_token(pid)
                display_name = get_localized_name(pid, lang)
                _log_debug('Found image for round', pid=pid, display_name=display_name, image_url=image_url)
                return jsonify({
                    'token': token,
                    'name': display_name,
                    'image': image_url,
                    'bg_size': 'contain',
                    'bg_pos': 'center center',
                })
        _log_debug('Exhausted attempts without finding card image')
        return jsonify({'error': 'Could not find a TCG card image.'}), 500
    except Exception as e:
        _log_debug('Exception in /api/tcg/random', error=str(e))
        return jsonify({'error': str(e)}), 500
