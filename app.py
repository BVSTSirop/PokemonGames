import os
from flask import Flask

from games.guess import bp as guess_bp
from games.type_matchup import bp as type_bp
from games.quiz import bp as quiz_bp
from games.entry_guess import bp as entry_bp
from games.daily import bp as daily_bp
from games.scream import bp as scream_bp
from games.silhouette import bp as silhouette_bp
from games.pixelate import bp as pixelate_bp
from games.tcg import bp as tcg_bp
from services import pokemon as services

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# Ensure a stable secret key for stateless token signing/verification.
# Prefer environment variable; fall back to a deterministic dev default.
app.secret_key = os.environ.get('SECRET_KEY') or 'pokemon-games-dev-secret-key'

# Register game blueprints (no prefixes to preserve existing routes)
app.register_blueprint(guess_bp)
app.register_blueprint(type_bp)
app.register_blueprint(quiz_bp)
app.register_blueprint(entry_bp)
app.register_blueprint(daily_bp)
app.register_blueprint(scream_bp)
app.register_blueprint(silhouette_bp)
app.register_blueprint(pixelate_bp)
app.register_blueprint(tcg_bp)


# Schedule warmup once on the first incoming request (Flask 3.1 compatible)
@app.before_request
def _schedule_warmup():
    if not services.WARMUP_SCHEDULED:
        services.EXECUTOR.submit(services.warm_up_all_names)
        services.WARMUP_SCHEDULED = True


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
