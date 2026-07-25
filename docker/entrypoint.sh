#!/bin/sh
set -eu
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 "${SCREEN_WIDTH:-430}x${SCREEN_HEIGHT:-932}x24" -nolisten tcp &
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display :99 -forever -shared -rfbport 5900 -localhost -nopw >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
exec npm run dev
