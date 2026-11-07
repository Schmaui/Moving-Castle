// Zentrale Server-Einstellungen. Alles lässt sich per Umgebungsvariable
// (z. B. in docker-compose.yml) überschreiben.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT) || 8080,
  host: process.env.HOST || '0.0.0.0',
  // Hier liegt die SQLite-Datenbank (im Container: Volume /data)
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  // Wird nur beim allerersten Start eingelesen (leere Datenbank)
  seedFile: process.env.SEED_FILE || path.join(ROOT, 'startdaten.json'),
  publicDir: path.join(ROOT, 'public'),
  // Gemeinsames Haushalts-Passwort. Leer = keine Anmeldung (nur fürs Heimnetz!).
  password: process.env.HAUSHALT_PASSWORT || '',
  // "1", wenn ein Proxy (Caddy) davor sitzt: dann gelten dessen Angaben zu IP und HTTPS
  trustProxy: process.env.TRUST_PROXY === '1',
  // Maximale Größe eines JSON-Requests (Schutz vor Unsinn)
  maxBodyBytes: 16 * 1024,
};
