#!/bin/bash
# Waits for the backend to be up, then opens Chromium in kiosk (fullscreen).
# Use with autostart so the UI appears after the Pi logs in.

URL="http://127.0.0.1:8888/"
MAX_WAIT=30

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
  exec chromium-browser --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble "$URL"
elif command -v chromium &>/dev/null; then
  exec chromium --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble "$URL"
else
  echo "Chromium not found. Install: sudo apt install chromium-browser"
  exit 1
fi
