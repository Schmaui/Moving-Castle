// Liste aller Module. Neuer Bereich (z. B. Aufgaben):
//   1. Migration in ../migrations.js anhängen
//   2. Datei modules/tasks.js anlegen (items.js als Vorlage)
//   3. Hier importieren und eintragen
import categories from './categories.js';
import items from './items.js';
import photos from './photos.js';
import settings from './settings.js';
import people from './people.js';
import tasks from './tasks.js';

export const MODULES = [people, categories, items, photos, settings, tasks];
