// Modul: Unterordner im Ordner der Pinnwand (z. B. Verträge, Wohnung). Nur eine Ebene.
//
//   GET    /api/folders        Liste (kommt auch in /api/state mit)
//   POST   /api/folders        Neuer Ordner
//   PATCH  /api/folders/:id    Umbenennen / Reihenfolge
//   DELETE /api/folders/:id    Löschen – nur wenn leer (sonst 409)
import { registerCrud } from '../resource.js';

export default {
  name: 'folders',
  inState: true,
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/folders',
      table: 'folders',
      orderBy: 'sort, name COLLATE NOCASE',
      fields: {
        name: { col: 'name', type: 'text', required: true, max: 40 },
        sort: { col: 'sort', type: 'int',  default: 0 },
      },
      messages: {
        duplicate: 'Diesen Ordner gibt es schon',
        inUse: 'Im Ordner liegen noch Dateien – bitte erst löschen oder verschieben',
      },
    });
  },
};
