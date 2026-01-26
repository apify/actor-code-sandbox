#!/bin/bash
# VNC + Browser Startup Script for Apify AI Sandbox
# Orchestrates X11 virtual display, window manager, Firefox, VNC server, and noVNC

set -e

echo "[VNC] Starting X11 virtual display..."
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
XVFB_PID=$!
sleep 2

echo "[VNC] Starting Openbox window manager..."
DISPLAY=:99 openbox &
OPENBOX_PID=$!
sleep 1

echo "[VNC] Starting Firefox browser..."
# Create unique Firefox profile directory
FIREFOX_PROFILE="/tmp/firefox-profile-$$-$(date +%s)"
mkdir -p "$FIREFOX_PROFILE"

# Start Firefox with isolated profile
DISPLAY=:99 firefox \
    --new-instance \
    --no-remote \
    --profile "$FIREFOX_PROFILE" \
    about:blank &
FIREFOX_PID=$!
sleep 3

echo "[VNC] Starting x11vnc server on display :99..."
x11vnc -display :99 -forever -shared -rfbport 5900 -nopw -quiet &
X11VNC_PID=$!
sleep 1

echo "[VNC] Starting websockify (noVNC) on port 6080..."
websockify --web /opt/noVNC 6080 localhost:5900 2>&1 | sed 's/^/[websockify] /' &
WEBSOCKIFY_PID=$!
sleep 2
echo "[VNC] websockify should be ready on http://localhost:6080"

echo "[VNC] Browser stack started successfully"
echo "[VNC]   Xvfb PID: $XVFB_PID"
echo "[VNC]   Openbox PID: $OPENBOX_PID"
echo "[VNC]   Firefox PID: $FIREFOX_PID"
echo "[VNC]   x11vnc PID: $X11VNC_PID"
echo "[VNC]   websockify PID: $WEBSOCKIFY_PID"

# Wait for websockify (main process)
wait $WEBSOCKIFY_PID
