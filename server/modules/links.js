// Modul: gemerkte Zuordnungen "Zutat -> Vorratsartikel".
// Wenn die App eine Rezept-Zutat falsch zuordnet und ihr sie korrigiert,
// wird das hier gespeichert und gilt dann für alle Rezepte.
//   nameKey: Zutat in Kleinbuchstaben (z. B. "nudeln")
//   itemId:  Vorratsartikel – oder leer = "gehört nicht zum Vorrat" (-> Wunschzettel)
import { registerCrud } from '../resource.js';

export default {
  name: 'links',
  inState: true,
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/links',
      table: 'ingredient_links',
      orderBy: 'id',
      messages: { duplicate: 'Für diese Zutat gibt es schon eine Zuordnung' },
      fields: {
        nameKey: { col: 'name_key', type: 'text', required: true, max: 80 },
        itemId:  { col: 'item_id',  type: 'int',  ref: 'items' },
      },
    });
  },
};
