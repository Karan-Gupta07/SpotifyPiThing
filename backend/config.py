"""Configuration loaded from environment."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Path for token cache so tokens persist across reboots (auto-reconnect)
DATA_DIR = Path(os.getenv("SPOTIFY_DATA_DIR", os.path.expanduser("~/.spotify-pi-thing")))
CACHE_PATH = str(DATA_DIR / ".spotify_cache")

# Ensure data dir exists for token storage
DATA_DIR.mkdir(parents=True, exist_ok=True)

SPOTIFY_CLIENT_ID = (os.getenv("SPOTIFY_CLIENT_ID") or os.getenv("SPOTIPY_CLIENT_ID") or "").strip()
SPOTIFY_CLIENT_SECRET = (os.getenv("SPOTIFY_CLIENT_SECRET") or os.getenv("SPOTIPY_CLIENT_SECRET") or "").strip()
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8888/callback")


def has_spotify_credentials() -> bool:
    """True if both client id and secret are set (so we can attempt auth)."""
    return bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET)

# Scopes needed for playback and now-playing
SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
]
