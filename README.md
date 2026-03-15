# Spotify Pi Thing

A standalone Raspberry Pi Spotify controller that acts like a small in-car console. The Pi runs a FastAPI backend (Spotipy + OAuth) and serves a touch-optimized UI in a fullscreen browser. Everything runs locally on the device.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Raspberry Pi                                                │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │  Browser (fullscreen)│◄──►│  FastAPI (127.0.0.1:8888)   │ │
│  │  /static/index.html  │    │  /api/now-playing           │ │
│  │  Touch UI            │    │  /api/play, /pause, /next   │ │
│  │                      │    │  /api/previous, /volume     │ │
│  │                      │    │  /callback (OAuth)          │ │
│  └─────────────────────┘    └──────────────┬──────────────┘ │
│                                            │                 │
│                               ┌────────────▼──────────────┐  │
│                               │  Spotipy → Spotify Web API │  │
│                               │  Token cache: ~/.spotify-   │  │
│                               │  pi-thing/.spotify_cache   │  │
│                               └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

- **Backend**: Python 3, FastAPI, Spotipy. Serves static frontend and REST API. OAuth tokens are stored under `~/.spotify-pi-thing/` so the device can reconnect to Spotify automatically after reboot.
- **Frontend**: Single-page HTML/CSS/JS, large touch targets, no build step. Polls `/api/now-playing` every 3 seconds and calls playback endpoints on button press.
- **Boot**: Run the server at startup (e.g. systemd) and start the browser in kiosk mode pointing at `http://127.0.0.1:8888/`.

## Deploy on Raspberry Pi (GitHub → Pi → startup + fullscreen)

### 1. Push the project to GitHub (from your PC)

```bash
cd C:\Users\Karan\CursorProj\SpotifyPiThing
git init
git add .
git commit -m "Spotify Pi Thing"
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/SpotifyPiThing.git
git branch -M main
git push -u origin main
```

(Don’t commit `.env` — it’s in `.gitignore`. You’ll create `.env` on the Pi.)

### 2. On the Pi: clone, install, configure

SSH into the Pi or use a terminal on the device, then:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/SpotifyPiThing.git
cd SpotifyPiThing

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
nano .env   # or: cat >> .env
```

Add your Spotify credentials to `.env` (same as on Windows):

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

Save and exit. Then test once:

```bash
source venv/bin/activate
python run.py
```

On the Pi (or from another device using the Pi’s IP), open `http://127.0.0.1:8888/` or `http://<Pi-IP>:8888/`, click **Log in with Spotify**, and complete login. After that you can stop the server (Ctrl+C). The token is saved so it will reconnect on every boot.

### 3. Start the backend at boot (systemd)

```bash
sudo cp deploy/spotify-pi-thing.service /etc/systemd/system/
# If the project is not in /home/pi/SpotifyPiThing, edit the service first:
#   sudo nano /etc/systemd/system/spotify-pi-thing.service
#   Update User=, WorkingDirectory=, Environment=, ExecStart= paths.

sudo systemctl daemon-reload
sudo systemctl enable spotify-pi-thing
sudo systemctl start spotify-pi-thing
```

Check that it’s running: `curl -s http://127.0.0.1:8888/api/auth/status`

### 4. Open the UI fullscreen at login (kiosk)

This makes Chromium start in kiosk (fullscreen) when the Pi user logs in (e.g. after boot into desktop):

```bash
chmod +x deploy/launch-kiosk.sh

mkdir -p ~/.config/autostart
cp deploy/spotify-pi-thing-kiosk.desktop ~/.config/autostart/
```

If the project is **not** in `/home/pi/SpotifyPiThing`, edit the desktop file and the script:

```bash
nano ~/.config/autostart/spotify-pi-thing-kiosk.desktop
# Set Exec= to the full path of launch-kiosk.sh, e.g. /home/pi/SpotifyPiThing/deploy/launch-kiosk.sh

nano deploy/launch-kiosk.sh
# No path changes needed inside the script; it just opens the URL.
```

Then reboot (or log out and log in). The Pi should start the backend at boot and, after you log in, open the Spotify UI in fullscreen.

**Optional:** To avoid the screen going blank on the 3.5" display:

- Raspberry Pi OS: **Menu → Preferences → Screen Configuration** (or **raspi-config → Display**) and disable screen blanking, or run:

  ```bash
  sudo raspi-config
  # Display Options → Screen Blanking → No
  ```

### 5. Updating after you push changes

On the Pi:

```bash
cd ~/SpotifyPiThing
git pull
source venv/bin/activate
pip install -r requirements.txt
# Restart the service so it uses the new code:
sudo systemctl restart spotify-pi-thing
```

Then reload the browser (or log out and back in if you use the kiosk autostart).

---

## Setup (development)

### 1. Spotify app

1. Go to [Spotify Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Add **Redirect URI**: `http://127.0.0.1:8888/callback` (or `http://<Pi-IP>:8888/callback` if you log in from another device once).
3. Copy Client ID and Client Secret.

### 2. On the Raspberry Pi

```bash
# Clone or copy the project, then:
cd SpotifyPiThing
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
```

### 3. Run

```bash
# From project root with venv activated
python run.py
# or: uvicorn backend.main:app --host 0.0.0.0 --port 8888
```

Open `http://127.0.0.1:8888/` (or `http://<Pi-IP>:8888/` from another device for first-time login). Click “Log in with Spotify”, authorize, and you’ll be redirected back to the player. After that, the Pi can stay on `http://127.0.0.1:8888/` and will use the cached token on every boot.

## Boot into UI automatically

For **launch at startup** and **fullscreen kiosk** on the Pi, see **Deploy on Raspberry Pi** above. The repo includes `deploy/spotify-pi-thing.service` (systemd) and `deploy/launch-kiosk.sh` + `deploy/spotify-pi-thing-kiosk.desktop` (autostart Chromium in kiosk).

<details>
<summary>Legacy: manual systemd unit</summary>

Create `/etc/systemd/system/spotify-pi-thing.service`:

```ini
[Unit]
Description=Spotify Pi Thing API
After=network-online.target
WantedBy=multi-user.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/SpotifyPiThing
Environment=PATH=/home/pi/SpotifyPiThing/venv/bin
ExecStart=/home/pi/SpotifyPiThing/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8888
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable spotify-pi-thing
sudo systemctl start spotify-pi-thing
```

Adjust paths and `User` if your project or user is different.

</details>

## API (backend)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/status` | `{ "authenticated": true \| false }` |
| GET | `/api/auth/login-url` | `{ "url": "https://..." }` |
| GET | `/callback?code=...` | OAuth redirect; exchanges code and redirects to UI |
| GET | `/api/now-playing` | `{ "track": { "name", "artist", "album", "art_url", "is_playing" } \| null }` |
| POST | `/api/play` | Resume playback |
| POST | `/api/pause` | Pause playback |
| POST | `/api/next` | Next track |
| POST | `/api/previous` | Previous track |
| POST | `/api/volume?volume_percent=0-100` | Set volume (optional) |

## Tech stack

- **Raspberry Pi** – host
- **Python 3** – backend
- **FastAPI** – HTTP server and API
- **Spotipy** – Spotify Web API and OAuth
- **Frontend** – HTML/CSS/JS (no framework), large touch targets for 3.5–5" screens

## Windows (dev) vs Pi OS (deploy)

Using **`http://127.0.0.1:8888/callback`** works on both:

- **Same redirect URI**: Spotify doesn’t care whether the request comes from Windows or Linux. As long as the app is listening on 8888 and the redirect URI in the Dashboard is `http://127.0.0.1:8888/callback`, OAuth works on either OS.
- **Token is per machine**: The cached token lives under `~/.spotify-pi-thing/` on whichever machine runs the app. If you log in on Windows (e.g. while developing), that token stays on Windows. On the Pi you’ll do **one** “Log in with Spotify” in the Pi’s browser; after that the Pi keeps its own token and reconnects on boot. No need to match OSes.
- **No code changes**: The same repo and `.env` (same Client ID / Secret, same redirect URI) are fine on both. Just run the server on 8888 on each machine you use.

## Optional env

- `SPOTIFY_REDIRECT_URI` – default `http://127.0.0.1:8888/callback`
- `SPOTIFY_DATA_DIR` – directory for token cache; default `~/.spotify-pi-thing`
