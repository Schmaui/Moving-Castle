// Modul: Artikel (Vorrat / Einkaufsliste)
// Neues Feld? 1) Migration in migrations.js, 2) Zeile in "fields" unten. Fertig.
import { registerCrud } from '../resource.js';
import { now } from '../db.js';

export default {
  name: 'items',
  inState: true,
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/items',
      table: 'items',
      orderBy: 'sort, id',
      messages: { duplicate: 'Diesen Artikel gibt es in der Kategorie schon' },
      fields: {
        categoryId:   { col: 'category_id',   type: 'int',    required: true, ref: 'categories' },
        name:         { col: 'name',          type: 'text',   required: true, max: 80 },
        missing:      { col: 'missing',       type: 'bool',   default: 0 },
        missingSince: { col: 'missing_since', type: 'text',   readonly: true },
        quantity:     { col: 'quantity',      type: 'number', min: 0 },
        unit:         { col: 'unit',          type: 'text',   max: 20 },
        note:         { col: 'note',          type: 'text',   max: 500, multiline: true },
        sort:         { col: 'sort',          type: 'int',    default: 0 },
      },
      hooks: {
        // "fehlt seit" automatisch pflegen
        beforeWrite(values, existing) {
          if (!('missing' in values)) return;
          const was = existing ? existing.missing : false;
          if (values.missing && !was) values.missing_since = now();
          if (!values.missing) values.missing_since = null;
        },
      },
    });
  },
};
