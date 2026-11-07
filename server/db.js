// Datenbank öffnen, Migrationen ausführen, kleine Helfer.
// Nutzt das in Node.js eingebaute SQLite (node:sqlite) – keine Zusatzpakete nötig.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { MIGRATIONS } from './migrations.js';

export function openDatabase(file = path.join(config.dataDir, 'haushalt.db')) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.accessSync(path.dirname(file), fs.constants.W_OK);
  } catch {
    throw new Error(
      `Datenordner "${path.dirname(file)}" ist nicht beschreibbar. ` +
      'Tipp: Ordner "data" vor dem Start anlegen (mkdir data) und Rechte prüfen.'
    );
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;     -- robuster bei gleichzeitigen Zugriffen
    PRAGMA foreign_keys = ON;      -- Verknüpfungen prüfen
    PRAGMA busy_timeout = 3000;
  `);
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (version <= current) return;
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version}`);
    });
    console.log(`[db] Migration ${version} ausgeführt`);
  });
}

/** Führt fn() in einer Transaktion aus (alles oder nichts). */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Revisionszähler: steigt bei jeder Änderung um 1.
 * Die Geräte fragen alle paar Sekunden "hat sich was geändert?" –
 * ist die Revision gleich, antwortet der Server nur mit "304 Not Modified".
 */
export function getRev(db) {
  return Number(db.prepare("SELECT value FROM meta WHERE key = 'rev'").get()?.value ?? 0);
}

export function bumpRev(db) {
  db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'rev'").run();
}

export const now = () => new Date().toISOString();
