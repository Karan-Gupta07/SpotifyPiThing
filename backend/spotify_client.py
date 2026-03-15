"""Spotify API client using Spotipy with persistent token cache."""
from typing import Optional

import spotipy
from spotipy.oauth2 import SpotifyOAuth

from backend.config import (
    CACHE_PATH,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    SPOTIFY_REDIRECT_URI,
    SCOPES,
)


def get_spotify_client() -> Optional[spotipy.Spotify]:
    """Return authenticated Spotipy client if we have valid cached tokens."""
    auth = _auth_manager()
    token_info = auth.get_cached_token()
    if not token_info:
        return None
    # Refresh if expired
    if auth.is_token_expired(token_info):
        token_info = auth.refresh_access_token(token_info["refresh_token"])
    return spotipy.Spotify(auth_manager=auth)


def _auth_manager() -> SpotifyOAuth:
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=" ".join(SCOPES),
        cache_path=CACHE_PATH,
        open_browser=False,
    )


def get_auth_url() -> str:
    """Return the URL to send the user to for Spotify authorization."""
    auth = _auth_manager()
    result = auth.get_authorize_url()
    return result[0] if isinstance(result, tuple) else result


def exchange_code_for_token(code: str) -> bool:
    """Exchange authorization code for tokens and cache them. Returns True on success."""
    auth = _auth_manager()
    try:
        auth.get_access_token(code)
        return True
    except Exception:
        return False
