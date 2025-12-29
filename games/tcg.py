from flask import Blueprint, jsonify, render_template, request, current_app
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
    get_species_metadata,
)
from services.tokens import sign_token as _sign_token

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


# Simple in-memory cache for card image URLs, keyed by language + display name
TCG_IMAGE_CACHE = {}
TCG_IMAGE_TTL = 24 * 60 * 60  # 24 hours


def _find_card_image_for_pokemon(display_name, lang, display_en=None):
    """Query TCGdex API for a card image for the given display name in the selected language.
    Returns (image_url, card_id) or (None, None). Falls back to English if needed.
    """
    session = _get_tcg_session()
    timeout = (5, 8)  # (connect, read) seconds
    headers = { 'User-Agent': 'pokemon-games/1.0 (+https://example.local)' }

    def _collect_candidates(card_list):
        out = []
        for c in card_list:
            img = c.get('image')
            if not img:
                continue
            if isinstance(img, str) and not img.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                img_url = img.rstrip('/') + '/high.png'
            else:
                img_url = img
            cid = c.get('id') or c.get('localId') or None
            out.append((img_url, cid))
        return out

    def _query_one(q_lang, name_for_lang):
        base = f'https://api.tcgdex.net/v2/{q_lang}/cards'
        # Cache per language+name
        now = time.time()
        cache_key = f"{q_lang}:{name_for_lang}"
        cached = TCG_IMAGE_CACHE.get(cache_key)
        if cached and cached.get('exp', 0) > now:
            _log_debug('Cache hit for display name', lang=q_lang, display_name=name_for_lang)
            return cached['url'], cached['id']

        params_primary = { 'name': name_for_lang }
        first_word = name_for_lang.split()[0]
        params_fallback = { 'name': first_word }

        # Primary request
        t0 = time.perf_counter()
        _log_debug('Searching TCG cards (primary)', lang=q_lang, display_name=name_for_lang, params=params_primary)
        req_primary = requests.Request('GET', base, params=params_primary, headers=headers)
        prepped_primary = session.prepare_request(req_primary)
        _log_debug('Primary request URL', url=prepped_primary.url)
        resp = session.send(prepped_primary, timeout=timeout)
        resp.raise_for_status()
        data = resp.json() or []
        cards = data if isinstance(data, list) else []
        _log_debug('Primary query returned cards', count=len(cards), ms=round((time.perf_counter()-t0)*1000))
        candidates = _collect_candidates(cards)
        _log_debug('Primary candidates filtered', candidates=len(candidates))

        # Fallback by first word
        if not candidates:
            t1 = time.perf_counter()
            _log_debug('No primary candidates, trying fallback', lang=q_lang, params=params_fallback)
            req_fallback = requests.Request('GET', base, params=params_fallback, headers=headers)
            prepped_fallback = session.prepare_request(req_fallback)
            _log_debug('Fallback request URL', url=prepped_fallback.url)
            resp2 = session.send(prepped_fallback, timeout=timeout)
            resp2.raise_for_status()
            data2 = resp2.json() or []
            cards2 = data2 if isinstance(data2, list) else []
            _log_debug('Fallback query returned cards', count=len(cards2), ms=round((time.perf_counter()-t1)*1000))
            candidates = _collect_candidates(cards2)

        _log_debug('All candidates (post-fallback if any)', lang=q_lang, candidates=len(candidates))
        if not candidates:
            return None, None

        choice = random.choice(candidates)
        _log_debug('Selected candidate', lang=q_lang, card_id=choice[1], image_url=choice[0])
        TCG_IMAGE_CACHE[cache_key] = { 'url': choice[0], 'id': choice[1], 'exp': now + TCG_IMAGE_TTL }
        return choice

    # First try the selected language
    try:
        res = _query_one(lang, display_name)
        if res and res[0]:
            return res
    except Exception as e:
        _log_debug('Exception during TCG fetch (selected lang)', error=str(e), lang=lang, display_name=display_name)

    # Fallback to English
    if lang != 'en':
        try:
            res = _query_one('en', display_en or display_name)
            if res and res[0]:
                return res
        except Exception as e:
            _log_debug('Exception during TCG fetch (fallback en)', error=str(e), display_name=display_en or display_name)

    _log_debug('No candidates found after all attempts', display_name=display_name, lang=lang)
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
            # Resolve localized name for the selected language (used for suggestions and for TCGdex query)
            display_local = get_localized_name(pid, lang) or display_en
            _log_debug('Resolved names', pid=pid, display_en=display_en, display_local=display_local, lang=lang)
            image_url, _card_id = _find_card_image_for_pokemon(display_local, lang, display_en)
            if image_url:
                token = _sign_token(pid)
                display_name = get_localized_name(pid, lang)
                meta = get_species_metadata(pid)
                _log_debug('Found image for round', pid=pid, display_name=display_name, image_url=image_url)
                return jsonify({
                    'token': token,
                    'id': pid,
                    'name': display_name,
                    'image': image_url,
                    'bg_size': 'contain',
                    'bg_pos': 'center center',
                    'color': meta.get('color') or '',
                    'generation': meta.get('generation') or '',
                })
        _log_debug('Exhausted attempts without finding card image')
        return jsonify({'error': 'Could not find a TCG card image.'}), 500
    except Exception as e:
        _log_debug('Exception in /api/tcg/random', error=str(e))
        return jsonify({'error': str(e)}), 500
