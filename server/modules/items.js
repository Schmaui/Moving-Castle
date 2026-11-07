// Modul: Artikel (Vorrat / Einkaufsliste)
// Neues Feld? 1) Migration in migrations.js, 2) Zeile in "fields" unten. Fertig.
import { registerCrud } from '../resource.js';
import { now } from '../db.js';

/**
 * Mengen (optional): Gibt es eine Mindestmenge, ergibt sich "fehlt" von selbst.
 *  - Menge oder Mindestmenge geändert  -> fehlt, wenn weniger da als die Mindestmenge
 *  - als "wieder da" abgehakt, ohne Menge -> auf die Mindestmenge auffüllen
 */
function applyAmounts(values, existing) {
  const qty = 'quantity' in values ? values.quantity : existing?.quantity ?? null;
  const min = 'min_qty' in values ? values.min_qty : existing?.minQty ?? null;
  if (min == null) return;
  if ('quantity' in values || 'min_qty' in values) {
    // ausdrücklich "fehlt" mitgeschickt (z. B. Rückgängig) bleibt "fehlt"
    values.missing = values.missing === 1 || qty == null || qty < min ? 1 : 0;
  } else if ('missing' in values && !values.missing && (qty == null || qty < min)) {
    values.quantity = min;
  }
}

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
        quantity:     { col: 'quantity',      type: 'number', min: 0 },             // wie viel da ist (optional)
        minQty:       { col: 'min_qty',       type: 'number', min: 0 },             // Mindestmenge (optional)
        unit:         { col: 'unit',          type: 'text',   max: 20 },
        note:         { col: 'note',          type: 'text',   max: 500, multiline: true },
        sort:         { col: 'sort',          type: 'int',    default: 0 },
        missingBy:    { col: 'missing_by',    type: 'int',    readonly: true }, // wer hat's auf die Liste gesetzt
        boughtBy:     { col: 'bought_by',     type: 'int',    readonly: true }, // wer hat's zuletzt gekauft
        boughtAt:     { col: 'bought_at',     type: 'text',   readonly: true },
      },
      hooks: {
        // "fehlt seit", "wer hat's draufgesetzt" und "wer hat's gekauft" automatisch pflegen
        beforeWrite(values, existing, { actor }) {
          applyAmounts(values, existing);
          if (!('missing' in values)) return;
          const was = existing ? existing.missing : false;
          if (values.missing && !was) {
            values.missing_since = now();
            values.missing_by = actor;
          }
          if (!values.missing) {
            values.missing_since = null;
            values.missing_by = null;
            if (was) {
              values.bought_by = actor;
              values.bought_at = now();
            }
          }
        },
      },
    });
  },
};
