# Kleines Image mit Node.js (läuft auf Raspberry Pi 64-bit UND auf x86-Mini-PCs).
# Node 24 bringt SQLite schon mit, deshalb wird nichts installiert oder kompiliert.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TZ=Europe/Berlin

WORKDIR /app
COPY package.json startdaten.json ./
COPY server ./server
COPY public ./public

# Datenordner gehört dem unprivilegierten Benutzer "node" (UID 1000)
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
