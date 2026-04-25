"""Spotify API client using Spotipy with persistent token cache."""
import logging
import time
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

logger = logging.getLogger(__name__)

# How many times the *backend* retries reading / refreshing the token on boot.
# This is separate from the frontend retry loop and catches transient network
# errors that Spotipy would otherwise swallow.
_TOKEN_RETRY_MAX = 3
_TOKEN_RETRY_DELAY = 2  # seconds


def get_spotify_client() -> Optional[spotipy.Spotify]:
    """Return authenticated Spotipy client if we have valid cached tokens.

    On cold boot the Pi's network may not be fully usable yet even though
    systemd says ``network-online.target`` is reached.  Spotipy's
    ``get_cached_token()`` and ``refresh_access_token()`` will fail
    silently and return ``None`` in that case.  We retry a few times so
    the caller doesn't immediately conclude "not authenticated".
    """
    auth = _auth_manager()

    for attempt in range(1, _TOKEN_RETRY_MAX + 1):
        try:
            token_info = auth.get_cached_token()
            if not token_info:
                # No cache file at all — genuinely not authenticated
                return None
            if auth.is_token_expired(token_info):
                logger.info("Token expired, refreshing (attempt %d/%d)…",
                            attempt, _TOKEN_RETRY_MAX)
                token_info = auth.refresh_access_token(token_info["refresh_token"])
            return spotipy.Spotify(auth_manager=auth)
        except Exception as exc:
            logger.warning("Token read/refresh attempt %d/%d failed: %s",
                           attempt, _TOKEN_RETRY_MAX, exc)
            if attempt < _TOKEN_RETRY_MAX:
                time.sleep(_TOKEN_RETRY_DELAY)
    # All retries exhausted — fall back to "not authenticated"
    logger.error("Could not obtain a valid Spotify token after %d attempts", _TOKEN_RETRY_MAX)
    return None


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
