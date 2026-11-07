// Modul: Kategorien (z. B. "Konserven" mit Symbol "dose").
// Bereich (area): 'kueche' = Vorrat (Essen), 'haushalt' = Bad, Putzen, Drogerie …
import { registerCrud } from '../resource.js';

export const AREAS = ['kueche', 'haushalt'];

export default {
  name: 'categories',
  inState: true, // in /api/state mitliefern
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/categories',
      table: 'categories',
      orderBy: 'sort, id',
      messages: {
        duplicate: 'Diese Kategorie gibt es schon',
        inUse: 'Kategorie enthält noch Artikel – erst die Artikel löschen',
      },
      fields: {
        name:  { col: 'name',  type: 'text', required: true, max: 40 },
        icon:  { col: 'icon',  type: 'text', max: 30, default: 'kiste' }, // Name aus public/js/ui/art.js
        emoji: { col: 'emoji', type: 'text', max: 16, default: '📦' },   // alt, nur noch für Kompatibilität
        sort:  { col: 'sort',  type: 'int',  default: 0 },
        area:  { col: 'area',  type: 'text', values: AREAS, default: 'kueche' }, // Küche (Essen) oder Haushalt
      },
    });
  },
};
