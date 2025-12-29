import hmac
import hashlib
from flask import current_app


def sign_token(poke_id: int) -> str:
    """Create a stateless signed token encoding the Pokémon id.
    Format: "<id>.<hex_sha256_hmac>" where HMAC is over the ascii id using app.secret_key.
    """
    try:
        key = (current_app.secret_key or '').encode('utf-8')
    except Exception:
        key = b''
    msg = str(int(poke_id)).encode('ascii')
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return f"{int(poke_id)}.{sig}"


def verify_token(token: str):
    """Verify signed token and return embedded Pokémon id (int) or None if invalid."""
    if not isinstance(token, str) or '.' not in token:
        return None
    pid_str, sig_hex = token.split('.', 1)
    try:
        pid = int(pid_str)
    except Exception:
        return None
    try:
        key = (current_app.secret_key or '').encode('utf-8')
    except Exception:
        key = b''
    msg = str(pid).encode('ascii')
    expected = hmac.new(key, msg, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, sig_hex):
        return pid
    return None
