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
import recipes from './recipes.js';
import meals from './meals.js';
import wishes from './wishes.js';
import links from './links.js';
import notes from './notes.js';
import folders from './folders.js';
import docs from './docs.js';
import calendar from './calendar.js';
import movies from './movies.js';

export const MODULES = [people, categories, items, photos, settings, tasks, recipes, meals, wishes, links, notes, folders, docs, calendar, movies];
