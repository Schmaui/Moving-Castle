// Modul: Wunschzettel – Sachen, die ihr NICHT immer dahaben wollt
// (z. B. Zutaten für ein bestimmtes Rezept). Steht unter der Einkaufsliste.
// Abhaken = löschen (mit "Rückgängig" in der App).
import { registerCrud } from '../resource.js';

export default {
  name: 'wishes',
  inState: true,
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/wishes',
      table: 'wishes',
      orderBy: 'id',
      fields: {
        name:     { col: 'name',      type: 'text', required: true, max: 80 },
        amount:   { col: 'amount',    type: 'text', max: 40 },
        recipeId: { col: 'recipe_id', type: 'int',  ref: 'recipes' },
        addedBy:  { col: 'added_by',  type: 'int',  readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if (!existing) values.added_by = actor;
        },
      },
    });
  },
};
