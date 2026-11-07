// Sicherung der Datenbank – läuft auch, während die App benutzt wird.
//
// Aufruf (im Projektordner):   npm run backup
// Auf dem Server (per Docker): docker compose -f docker-compose.online.yml exec -T haushalt node server/backup.js
//
// Legt  data/backups/haushalt-JJJJ-MM-TT.db  an und behält die letzten KEEP Sicherungen.
// Zurückspielen: App stoppen, Sicherung als data/haushalt.db kopieren, App starten.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const KEEP = Number(process.env.BACKUP_KEEP) || 14;

const source = path.join(config.dataDir, 'haushalt.db');
const dir = path.join(config.dataDir, 'backups');
if (!fs.existsSync(source)) {
  console.error(`[backup] Keine Datenbank gefunden: ${source}`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // JJJJ-MM-TT
const target = path.join(dir, `haushalt-${day}.db`);
fs.rmSync(target, { force: true }); // heute schon gesichert? -> überschreiben

const db = new DatabaseSync(source, { readOnly: true });
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();
console.log(`[backup] Gesichert: ${target}`);

// Alte Sicherungen löschen
const old = fs.readdirSync(dir)
  .filter((f) => /^haushalt-\d{4}-\d{2}-\d{2}\.db$/.test(f))
  .sort()
  .slice(0, -KEEP);
for (const f of old) {
  fs.rmSync(path.join(dir, f));
  console.log(`[backup] Alte Sicherung gelöscht: ${f}`);
}
