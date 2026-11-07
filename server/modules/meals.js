// Modul: Wochenplan (Abendessen). Pro Tag bis zu 2 Vorschläge (slot 1 und 2),
// einer wird "gewählt" (Das gibt's), danach "gekocht".
//
//   GET/POST /api/meals, PATCH/DELETE /api/meals/:id
//   Felder: day ("JJJJ-MM-TT"), slot (1|2), recipeId ODER title (z. B. "Reste"), chosen, cooked
import { registerCrud } from '../resource.js';
import { HttpError } from '../http.js';

const KEEP_DAYS = 60; // alte Tage nach so vielen Tagen aufräumen

export default {
  name: 'meals',
  inState: true,
  register(ctx) {
    const { db } = ctx;
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    db.prepare('DELETE FROM meals WHERE day < ?').run(cutoff);

    return registerCrud(ctx, {
      path: '/api/meals',
      table: 'meals',
      orderBy: 'day, slot',
      messages: { duplicate: 'An diesem Abend ist der Platz schon belegt' },
      fields: {
        day:       { col: 'day',       type: 'date', required: true },
        slot:      { col: 'slot',      type: 'int',  min: 1, maxValue: 2, default: 1 },
        recipeId:  { col: 'recipe_id', type: 'int',  ref: 'recipes' },
        title:     { col: 'title',     type: 'text', max: 80 },
        chosen:    { col: 'chosen',    type: 'bool', default: 0 },
        cooked:    { col: 'cooked',    type: 'bool', default: 0 },
        createdBy: { col: 'created_by', type: 'int', readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if (!existing) {
            values.created_by = actor;
            if (values.recipe_id == null && values.title == null) throw new HttpError(400, 'Rezept oder Text fehlt');
          }
        },
      },
    });
  },
};
