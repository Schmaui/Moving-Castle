// Füllt die Datenbank beim allerersten Start aus startdaten.json.
// Später geänderte Startdaten werden NICHT erneut eingelesen
// (sonst würden deine Änderungen überschrieben).
import fs from 'node:fs';
import { transaction, now, bumpRev } from './db.js';

export function seedIfEmpty(db, file) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categories').get();
  if (n > 0) return;
  if (!fs.existsSync(file)) {
    console.warn(`[seed] Keine Startdatei gefunden (${file}) – starte leer.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const insertCategory = db.prepare(
    'INSERT INTO categories (name, emoji, icon, area, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(`
    INSERT INTO items (category_id, name, missing, quantity, unit, note, sort, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
  `);

  let itemCount = 0;
  transaction(db, () => {
    const ts = now();
    data.kategorien.forEach((cat, ci) => {
      const { lastInsertRowid: catId } = insertCategory.run(cat.name, cat.emoji || '📦', cat.icon || 'kiste', cat.bereich === 'haushalt' ? 'haushalt' : 'kueche', ci, ts, ts);
      (cat.artikel || []).forEach((entry) => {
        // Ein Artikel ist entweder ein Text ("Milch") oder ein Objekt
        // ({ "name": "Milch", "quantity": 2, "unit": "l", "note": "Hafer" })
        const a = typeof entry === 'string' ? { name: entry } : entry;
        // sort = 0: Reihenfolge ergibt sich aus der Anlage-Reihenfolge, neue Artikel landen am Ende
        insertItem.run(catId, a.name, a.quantity ?? null, a.unit ?? null, a.note ?? null, 0, ts, ts);
        itemCount++;
      });
    });
    bumpRev(db);
  });
  console.log(`[seed] ${data.kategorien.length} Kategorien und ${itemCount} Artikel angelegt.`);
}
