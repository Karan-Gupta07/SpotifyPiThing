"""
FastAPI backend for Raspberry Pi Spotify controller.
Serves the UI and API for playback control and now-playing.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.config import has_spotify_credentials
from backend.spotify_client import get_spotify_client, get_auth_url, exchange_code_for_token

# Build paths relative to project root
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(ROOT, "frontend", "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure data dir exists on startup (for token cache)."""
    from backend.config import DATA_DIR
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Spotify Pi Thing", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files (HTML, CSS, JS, images)
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------- Auth ----------

@app.get("/api/auth/status")
def auth_status():
    """Return whether the app is logged in to Spotify (has valid cached token)."""
    if not has_spotify_credentials():
        return {"authenticated": False, "configured": False}
    sp = get_spotify_client()
    return {"authenticated": sp is not None, "configured": True}


@app.get("/api/auth/login-url")
def auth_login_url():
    """Return the Spotify authorization URL. Frontend redirects user here for first-time login."""
    if not has_spotify_credentials():
        raise HTTPException(
            status_code=503,
            detail="Spotify credentials not set. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env",
        )
    url = get_auth_url()
    return {"url": url}


@app.get("/callback")
def auth_callback(code: str | None = None, error: str | None = None):
    """OAuth redirect target. Exchanges code for tokens and redirects to UI."""
    if error:
        return RedirectResponse(url="/static/index.html?error=" + error, status_code=302)
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    if not exchange_code_for_token(code):
        return RedirectResponse(url="/static/index.html?error=auth_failed", status_code=302)
    return RedirectResponse(url="/static/index.html?auth=ok", status_code=302)


# ---------- Playback ----------

@app.get("/api/now-playing")
def now_playing():
    """Return currently playing track (or null if nothing/no device)."""
    sp = get_spotify_client()
    if not sp:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        current = sp.current_playback()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not current or not current.get("item"):
        return {"track": None}
    item = current["item"]
    track_id = item.get("id")
    album = item.get("album") or {}
    images = album.get("images") or []
    art_url = images[0]["url"] if images else None
    artists = item.get("artists") or []
    artist_names = ", ".join(a.get("name", "") for a in artists)
    is_saved = False
    if track_id:
        try:
            is_saved = sp.current_user_saved_tracks_contains([track_id])[0]
        except Exception:
            pass
    return {
        "track": {
            "id": track_id,
            "name": item.get("name"),
            "artist": artist_names,
            "album": album.get("name"),
            "art_url": art_url,
            "is_playing": current.get("is_playing", False),
            "is_saved": is_saved,
        }
    }


def _require_client():
    sp = get_spotify_client()
    if not sp:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sp


@app.post("/api/play")
def play():
    """Resume playback."""
    _require_client().start_playback()
    return {"ok": True}


@app.post("/api/pause")
def pause():
    """Pause playback."""
    _require_client().pause_playback()
    return {"ok": True}


@app.post("/api/next")
def next_track():
    """Skip to next track."""
    _require_client().next_track()
    return {"ok": True}


@app.post("/api/previous")
def previous_track():
    """Go to previous track (or restart current)."""
    _require_client().previous_track()
    return {"ok": True}


@app.post("/api/like/toggle")
def like_toggle(track_id: str):
    """Add current track to Liked Songs, or remove if already saved."""
    if not track_id:
        raise HTTPException(status_code=400, detail="track_id required")
    sp = _require_client()
    try:
        saved = sp.current_user_saved_tracks_contains([track_id])[0]
        if saved:
            sp.current_user_saved_tracks_delete([track_id])
        else:
            sp.current_user_saved_tracks_add([track_id])
        return {"ok": True, "is_saved": not saved}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/volume")
def set_volume(volume_percent: int = 50):
    """Set volume (0-100). Optional; only works if Spotify is controlling a device volume."""
    if not 0 <= volume_percent <= 100:
        raise HTTPException(status_code=400, detail="volume_percent must be 0-100")
    _require_client().volume(volume_percent)
    return {"ok": True}


# Root redirect to UI (for kiosk: open http://localhost:8000/)
@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html", status_code=302)
