// Liste aller Module. Neuer Bereich (z. B. Aufgaben):
//   1. Migration in ../migrations.js anhängen
//   2. Datei modules/tasks.js anlegen (items.js als Vorlage)
//   3. Hier importieren und eintragen
import categories from './categories.js';
import items from './items.js';
import photos from './photos.js';

export const MODULES = [categories, items, photos];
