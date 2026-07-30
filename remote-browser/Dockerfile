FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=0
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium xvfb x11vnc novnc websockify nginx tini ca-certificates curl dbus-x11 \
    fonts-liberation && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN chmod +x scripts/entrypoint.sh && chown -R node:node /app /home/node

EXPOSE 8080
VOLUME ["/data/chromium"]
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
