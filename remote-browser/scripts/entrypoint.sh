#!/bin/sh
set -eu
test "${ALLOW_CLINICAL_WRITES:-false}" = "false" || { echo "ALLOW_CLINICAL_WRITES debe ser false" >&2; exit 1; }
export DISPLAY=:99
mkdir -p /data/chromium /tmp/runtime-node
chown -R node:node /data/chromium /tmp/runtime-node
chmod 700 /data/chromium /tmp/runtime-node
Xvfb :99 -screen 0 "${SCREEN_SIZE:-1280x800x24}" -nolisten tcp &
x11vnc -display :99 -localhost -forever -shared -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/websockify.log 2>&1 &
su node -s /bin/sh -c 'XDG_RUNTIME_DIR=/tmp/runtime-node chromium --no-sandbox --disable-dev-shm-usage --disable-sync --disable-translate --no-first-run --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir=/data/chromium about:blank' >/tmp/chromium.log 2>&1 &
sleep 2
su node -s /bin/sh -c 'PORT=3000 node src/server.js' &
PUBLIC_PORT="${PORT:-8080}"
sed "s/__PORT__/${PUBLIC_PORT}/" /app/scripts/nginx.conf.template >/tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
