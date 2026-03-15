#!/bin/bash
# Waits for the backend to be up, then opens Chromium in kiosk (fullscreen).
# Use with autostart so the UI appears after the Pi logs in.

URL="http://127.0.0.1:8888/"
MAX_WAIT=30
LOG="/tmp/spotify-pi-kiosk.log"

# Give the desktop session a moment to be ready (helps autostart)
sleep 3

echo "$(date): Starting Spotify Pi Thing kiosk" >> "$LOG" 2>/dev/null || true
echo "Waiting for Spotify Pi Thing backend..."
for i in $(seq 1 $MAX_WAIT); do
  if curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null | grep -q "200\|302"; then
    echo "Backend is up. Launching kiosk."
    break
  fi
  if [ $i -eq $MAX_WAIT ]; then
    echo "Backend did not respond in time. Launching anyway."
  fi
  sleep 1
done

# Raspberry Pi OS typically has chromium-browser; some distros use chromium.
if command -v chromium-browser &>/dev/null; then
  echo "$(date): Launching chromium-browser" >> "$LOG" 2>/dev/null || true
  exec chromium-browser --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --password-store=basic "$URL"
elif command -v chromium &>/dev/null; then
  echo "$(date): Launching chromium" >> "$LOG" 2>/dev/null || true
  exec chromium --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --password-store=basic "$URL"
else
  echo "Chromium not found. Install: sudo apt install chromium-browser"
  echo "$(date): ERROR Chromium not found" >> "$LOG" 2>/dev/null || true
  exit 1
fi
