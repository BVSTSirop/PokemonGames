# Pokémon Mini Games (Flask + PokeAPI)

A small Flask web app with a first puzzle: guess the Pokémon from a cropped portion of its sprite. Uses data from https://pokeapi.co/.

## Features
- Fetches Pokémon names and sprites from PokeAPI
- Autocomplete for guesses
- Randomly cropped sprite portion per round

## Local Development

Prerequisites:
- Python 3.11 (recommended; other 3.10+ likely fine)
- pip

Steps (Windows PowerShell commands shown):

```powershell
# 1) Create & activate a virtual environment (recommended)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2) Install dependencies
pip install -r requirements.txt

# 3) Run the app (Flask development server)
python app.py

# Open http://localhost:5000 in your browser
```

Notes:
- The app uses PokeAPI; first load of the autocomplete list can take a moment.
- If PokeAPI rate limits you, simply wait and refresh.

## Project Structure
```
app.py               # Flask app (entry point)
static/              # JS/CSS assets
  game.js
  styles.css
templates/           # Jinja2 templates
  base.html
  index.html
Procfile             # Heroku process declaration
requirements.txt     # Python dependencies
runtime.txt          # Heroku Python version pin
main.py              # Unused sample file (kept for IDE)
```

## Deploying to Heroku

Prerequisites:
- A Heroku account and the Heroku CLI installed
- A Heroku app created (or create one)

Steps:
```bash
# Log in
heroku login

# From the repo root
heroku create your-app-name

# Set stack (optional, if not already default)
# heroku stack:set heroku-22

# Push code
git add .
git commit -m "Deploy Pokémon game"
heroku git:remote -a your-app-name
git push heroku main  # or 'git push heroku master' depending on branch

# Scale web dyno (first time only)
heroku ps:scale web=1

# Open
heroku open
```

Heroku uses the provided `Procfile` to launch `gunicorn app:app`. The app also respects the `PORT` environment variable provided by Heroku.

## Troubleshooting
- If you get a `ModuleNotFoundError`, ensure your virtual environment is active and dependencies are installed.
- If requests to PokeAPI fail, check your network/firewall and try again later.
- On Heroku, check logs: `heroku logs --tail`.
