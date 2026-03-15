#!/bin/bash
# Run this on the Pi from the project root. It installs the backend service
# and kiosk autostart using the current user and path (no manual editing).
set -e

INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT_USER="$(whoami)"

echo "Project: $INSTALL_DIR"
echo "User:    $CURRENT_USER"
echo ""

# --- Backend (systemd) ---
echo "Installing systemd service..."
SERVICE_FILE="/tmp/spotify-pi-thing.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Spotify Pi Thing API
After=network-online.target
WantedBy=multi-user.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin
Environment=PYTHONPATH=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8888
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo cp "$SERVICE_FILE" /etc/systemd/system/spotify-pi-thing.service
sudo systemctl daemon-reload
sudo systemctl enable spotify-pi-thing
sudo systemctl restart spotify-pi-thing
echo "Backend service installed and started."

# --- Kiosk (autostart) ---
echo "Installing kiosk autostart..."
mkdir -p "$HOME/.config/autostart"
DESKTOP_FILE="$HOME/.config/autostart/spotify-pi-thing-kiosk.desktop"
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Type=Application
Name=Spotify Pi Thing Kiosk
Comment=Open Spotify Pi Thing in fullscreen
Exec=/bin/bash $INSTALL_DIR/deploy/launch-kiosk.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF
echo "Kiosk desktop file written to $DESKTOP_FILE"

chmod +x "$INSTALL_DIR/deploy/launch-kiosk.sh"
echo ""

# --- Check backend ---
sleep 2
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8888/api/auth/status 2>/dev/null | grep -q "200"; then
  echo "Backend is responding on http://127.0.0.1:8888"
else
  echo "Backend may still be starting. Check: sudo systemctl status spotify-pi-thing"
fi

echo ""
echo "Done. Log out and log in (or reboot) for the browser to open automatically."
echo "If it still does not open: run ./deploy/launch-kiosk.sh by hand to see any errors."
