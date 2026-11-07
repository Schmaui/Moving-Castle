// Modul: Rezepte.
//
//   GET    /api/recipes               Liste (kommt auch in /api/state mit)
//   POST   /api/recipes               Neues Rezept
//   PATCH  /api/recipes/:id           Ändern (auch Herz/Lieblingsgericht, Notizen)
//   DELETE /api/recipes/:id           Löschen
//   POST   /api/recipes/import        Rezept von einer Webseite holen: { "url": "https://…" }
//                                     -> Entwurf (wird NICHT gespeichert)
//   POST   /api/recipes/:id/gekocht   Zählt mit, wie oft und wann zuletzt gekocht
//
// Zutaten sind eine Liste: [{ "qty": 400, "unit": "g", "name": "Kichererbsen", "note": "abgetropft" }]
// Aus Text ("400 g Kichererbsen, abgetropft") macht das die App (public/js/recipes.js).
import { registerCrud } from '../resource.js';
import { HttpError, readJson } from '../http.js';
import { validateField } from '../validate.js';
import { bumpRev, now, transaction } from '../db.js';
import { config } from '../config.js';
import { importRecipe } from '../recipe-import.js';

const text = (max) => ({ type: 'text', max });

/** Zutatenliste prüfen und aufräumen. */
function checkIngredients(list, key) {
  if (!Array.isArray(list) || list.length > 80) throw new HttpError(400, `${key}: Liste mit höchstens 80 Zutaten erwartet`);
  return list.map((ing, i) => {
    if (!ing || typeof ing !== 'object') throw new HttpError(400, `${key}[${i}]: Zutat erwartet`);
    const qty = ing.qty ?? null;
    if (qty !== null && (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0)) {
      throw new HttpError(400, `${key}[${i}].qty: Zahl erwartet`);
    }
    return {
      qty,
      unit: validateField(text(20), ing.unit ?? null, `${key}[${i}].unit`),
      name: validateField({ ...text(80), required: true }, ing.name ?? null, `${key}[${i}].name`),
      note: validateField(text(120), ing.note ?? null, `${key}[${i}].note`),
    };
  });
}

function checkTags(list, key) {
  if (!Array.isArray(list) || list.length > 10) throw new HttpError(400, `${key}: höchstens 10 Schlagwörter`);
  const tags = list.map((t, i) => validateField(text(24), t, `${key}[${i}]`)).filter(Boolean);
  return [...new Set(tags)];
}

function checkUrl(value, key) {
  if (value === null || value === '') return null;
  try {
    const u = new URL(value);
    if (['http:', 'https:'].includes(u.protocol)) return value;
  } catch { /* unten */ }
  throw new HttpError(400, `${key}: Link erwartet`);
}

export default {
  name: 'recipes',
  inState: true,
  register(ctx) {
    const { db, router } = ctx;

    // Vor registerCrud, damit "import" nicht als :id verstanden wird
    router.post('/api/recipes/import', async ({ req }) => {
      const body = await readJson(req, config.maxBodyBytes);
      return importRecipe(body.url);
    });

    const api = registerCrud(ctx, {
      path: '/api/recipes',
      table: 'recipes',
      orderBy: 'title COLLATE NOCASE, id',
      fields: {
        title:       { col: 'title',       type: 'text', required: true, max: 120 },
        ingredients: { col: 'ingredients', type: 'json', max: 20000, check: checkIngredients, default: '[]' },
        steps:       { col: 'steps',       type: 'text', max: 8000, multiline: true },
        minutes:     { col: 'minutes',     type: 'int',  min: 0, maxValue: 2000 },
        servings:    { col: 'servings',    type: 'int',  min: 1, maxValue: 99 },
        tags:        { col: 'tags',        type: 'json', max: 600, check: checkTags, default: '[]' },
        favorite:    { col: 'favorite',    type: 'bool', default: 0 },
        notes:       { col: 'notes',       type: 'text', max: 2000, multiline: true },
        sourceUrl:   { col: 'source_url',  type: 'text', max: 500 },
        cookedCount: { col: 'cooked_count', type: 'int', readonly: true },
        lastCooked:  { col: 'last_cooked', type: 'text', readonly: true },
        createdBy:   { col: 'created_by',  type: 'int',  readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if (!existing) values.created_by = actor;
          if ('source_url' in values) values.source_url = checkUrl(values.source_url, 'sourceUrl');
        },
      },
    });

    router.post('/api/recipes/:id/gekocht', ({ params }) => {
      const recipe = api.get(Number(params.id));
      if (!recipe) throw new HttpError(404, 'Rezept nicht gefunden');
      transaction(db, () => {
        db.prepare('UPDATE recipes SET cooked_count = cooked_count + 1, last_cooked = ?, updated_at = ? WHERE id = ?')
          .run(now(), now(), recipe.id);
        bumpRev(db);
      });
      return api.get(recipe.id);
    });

    return api;
  },
};
