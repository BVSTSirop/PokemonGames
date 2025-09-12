# server.py
import os, random, secrets, unicodedata
from functools import lru_cache
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, render_template, request, send_from_directory

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["JSON_SORT_KEYS"] = False

POKEAPI = "https://pokeapi.co/api/v2"
SUPPORTED_LANGS = {"en", "es", "fr", "de"}

# -----------------------
# Normalization utilities
# -----------------------
def normalize_name(s: str) -> str:
    if not isinstance(s, str):
        s = str(s or "")
    s = s.strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.casefold()
    # Remove separators; map gender; strip zero-width
    for ch in [" ", "-", "'", "’", "´", "`", "."]:
        s = s.replace(ch, "")
    s = s.replace("♀", "f").replace("♂", "m")
    s = s.replace("\u200b", "").replace("\u200c", "").replace("\u200d", "").replace("\ufeff", "")
    return s

# -----------------------
# Data fetch + cache
# -----------------------
@lru_cache(maxsize=1)
def get_pokemon_list():
    """List of {'id', 'slug', 'display_en'} ordered by id."""
    url = f"{POKEAPI}/pokemon?limit=20000"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    data = r.json().get("results", [])
    out = []
    for item in data:
        slug = item.get("name", "")
        u = item.get("url") or ""
        try:
            path = urlparse(u).path.strip("/").split("/")
            pid = int(path[-1]) if path[-1].isdigit() else int(path[-2])
        except Exception:
            continue
        out.append({
            "id": pid,
            "slug": slug,
            "display_en": slug.replace("-", " ").title()
        })
    out.sort(key=lambda x: x["id"])
    return out

@lru_cache(maxsize=4096)
def get_localized_name(poke_id: int, lang: str) -> str:
    """Localized display name with English fallback."""
    if lang not in SUPPORTED_LANGS:
        lang = "en"
    if lang == "en":
        for p in get_pokemon_list():
            if p["id"] == poke_id:
                return p["display_en"]
        return str(poke_id)
    r = requests.get(f"{POKEAPI}/pokemon-species/{poke_id}", timeout=10)
    r.raise_for_status()
    names = r.json().get("names", [])
    found_en = None
    for entry in names:
        nm = entry.get("name")
        lc = (entry.get("language") or {}).get("name")
        if lc == lang and nm:
            return nm
        if lc == "en" and nm:
            found_en = nm
    # fallback to our English display title casing if API English missing
    if not found_en:
        for p in get_pokemon_list():
            if p["id"] == poke_id:
                found_en = p["display_en"]
                break
    return found_en or str(poke_id)

@lru_cache(maxsize=4096)
def get_sprite_for_id(poke_id: int) -> str | None:
    r = requests.get(f"{POKEAPI}/pokemon/{poke_id}", timeout=20)
    r.raise_for_status()
    j = r.json()
    art = (
        j["sprites"].get("other", {})
        .get("official-artwork", {})
        .get("front_default")
    ) or j["sprites"].get("front_default")
    if not art:
        other = j["sprites"].get("other", {})
        for v in other.values():
            if isinstance(v, dict) and v.get("front_default"):
                return v["front_default"]
    return art

# -----------------------
# Routes
# -----------------------
@app.get("/")
def index():
    return render_template("index.html")

@app.get("/static/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.get("/api/suggest")
def suggest():
    q = (request.args.get("q") or "").strip()
    lang = (request.args.get("lang") or "en").lower()
    limit = min(max(int(request.args.get("limit", "20")), 1), 50)
    if not q:
        return jsonify([])

    items = get_pokemon_list()
    qn = normalize_name(q)

    # Build (id, localized) pairs lazily
    def localized_name(pid): return get_localized_name(pid, lang)

    # A quick two-phase match: startswith, then contains
    starts, contains = [], []
    for p in items:
        nm = localized_name(p["id"]) if lang != "en" else p["display_en"]
        nn = normalize_name(nm)
        if nn.startswith(qn): starts.append(nm)
        elif qn in nn: contains.append(nm)
        if len(starts) >= limit and len(contains) >= limit:
            # early exit if we already have enough in either bucket
            pass
    result = (starts + contains)[:limit]
    # dedupe while preserving order
    seen, out = set(), []
    for n in result:
        if n not in seen:
            out.append(n); seen.add(n)
    return jsonify(out[:limit])

@app.get("/api/round")
def round_data():
    lang = (request.args.get("lang") or "en").lower()
    if lang not in SUPPORTED_LANGS: lang = "en"

    try:
        items = get_pokemon_list()  # cached after first success
    except RequestException as e:
        return jsonify({"error": f"list_fetch_failed: {e.__class__.__name__}"}), 502

    if not items:
        return jsonify({"error": "no_items"}), 503

    max_id = items[-1]["id"]
    attempts = 12
    last_err = None

    for _ in range(attempts):
        try:
            pid = random.randint(1, max_id)
            sprite = get_sprite_for_id(pid)  # cached per id
            if not sprite:
                continue

            display_local = get_localized_name(pid, lang)
            display_en = next((p["display_en"] for p in items if p["id"] == pid), None)
            slug = next((p["slug"] for p in items if p["id"] == pid), None)
            accepts = list({normalize_name(x) for x in (display_local, display_en, slug)})

            bg_size = "500% 500%"
            x, y = random.randint(0, 100), random.randint(0, 100)
            bg_pos = f"{x}% {y}%"
            token = secrets.token_urlsafe(12)

            return jsonify({
                "token": token,
                "id": pid,
                "slug": slug,
                "display_en": display_en,
                "display_local": display_local,
                "accepts": accepts,
                "sprite": sprite,
                "bg_size": bg_size,
                "bg_pos": bg_pos,
            })
        except (RequestException, Timeout) as e:
            last_err = e
            # brief jittered backoff to be nice to PokeAPI
            time.sleep(0.08 + random.random() * 0.12)
            continue
        except Exception as e:
            # Any other unexpected error: record and keep trying a new id
            last_err = e
            continue

    # If we got here, we failed all attempts
    msg = f"round_build_failed: {last_err.__class__.__name__ if last_err else 'unknown'}"
    return jsonify({"error": msg}), 502
    
@app.post("/api/verify")  # optional: analytics / anti-cheat
def verify():
    data = request.get_json(silent=True) or {}
    guess = normalize_name(data.get("guess", ""))
    accepts = set(data.get("accepts") or [])
    return jsonify({"correct": guess in accepts})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
