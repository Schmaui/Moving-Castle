// Rezept-Logik ohne Anzeige: Zutaten verstehen und mit dem Vorrat abgleichen.
//
//   parseIngredient('400 g Kichererbsen, abgetropft')
//     -> { qty: 400, unit: 'g', name: 'Kichererbsen', note: 'abgetropft' }
//   matchIngredient(zutat, state)  -> passender Vorratsartikel (oder null)
//   ingredientStatus(zutat, state) -> { item, status: 'da' | 'knapp' | 'fehlt' | 'extra' }
//
// NEUES SYNONYM? Unten in SYNONYMS eine Gruppe ergänzen (alles kleingeschrieben).

// ---------- Einheiten ----------
// Schreibweisen -> einheitlicher Name. factor/base: zum Umrechnen (kg -> g, l -> ml)
const UNITS = {
  g: { name: 'g' }, gr: { name: 'g' }, gramm: { name: 'g' },
  kg: { name: 'g', factor: 1000 }, kilo: { name: 'g', factor: 1000 },
  ml: { name: 'ml' }, cl: { name: 'ml', factor: 10 }, l: { name: 'ml', factor: 1000 }, liter: { name: 'ml', factor: 1000 },
  el: { name: 'EL' }, essl: { name: 'EL' }, esslöffel: { name: 'EL' },
  tl: { name: 'TL' }, teel: { name: 'TL' }, teelöffel: { name: 'TL' },
  prise: { name: 'Prise' }, prisen: { name: 'Prise' }, msp: { name: 'Msp' },
  stück: { name: 'Stück', count: true }, stk: { name: 'Stück', count: true }, st: { name: 'Stück', count: true },
  dose: { name: 'Dose', count: true }, dosen: { name: 'Dose', count: true },
  glas: { name: 'Glas', count: true }, gläser: { name: 'Glas', count: true },
  packung: { name: 'Packung', count: true }, packungen: { name: 'Packung', count: true },
  pck: { name: 'Packung', count: true }, pkg: { name: 'Packung', count: true }, päckchen: { name: 'Packung', count: true },
  becher: { name: 'Becher', count: true }, flasche: { name: 'Flasche', count: true }, flaschen: { name: 'Flasche', count: true },
  bund: { name: 'Bund', count: true }, zehe: { name: 'Zehe', count: true }, zehen: { name: 'Zehe', count: true },
  scheibe: { name: 'Scheibe', count: true }, scheiben: { name: 'Scheibe', count: true },
  tasse: { name: 'Tasse' }, tassen: { name: 'Tasse' }, handvoll: { name: 'Handvoll' }, cm: { name: 'cm' },
};
const unitInfo = (u) => (u ? UNITS[String(u).toLowerCase().replace(/\.$/, '')] : null);

/** Einheit hübsch schreiben ("dosen" -> "Dose"). Unbekannte bleiben, wie sie sind. */
export const normalizeUnit = (u) => unitInfo(u)?.name || (u ? String(u).trim() : null);

/** Menge von einer Einheit in eine andere umrechnen (nur g/kg, ml/l oder gleiche Einheit). Sonst null. */
export function convert(qty, from, to) {
  if (qty == null) return null;
  const a = unitInfo(from), b = unitInfo(to);
  if (!from && !to) return qty;
  if (!a || !b || a.name !== b.name) {
    // Stück ohne Einheit = Stück
    if ((!from && b?.count && b.name === 'Stück') || (!to && a?.count && a.name === 'Stück')) return qty;
    return null;
  }
  return (qty * (a.factor || 1)) / (b.factor || 1);
}

/** Ist das eine "zählbare" Einheit (Dose, Packung, Stück …) oder keine Einheit? */
export const isCountUnit = (u) => !u || Boolean(unitInfo(u)?.count);

// ---------- Zutat aus Text ----------
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
// Reihenfolge wichtig: "1 1/2" vor "1/2" vor "1,5"
const NUM = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|bis)\s*${NUM})?\s*`, 'i');

function parseNumber(s) {
  s = s.trim();
  let m;
  if ((m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s))) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if ((m = /^(\d+)\s*\/\s*(\d+)$/.exec(s))) return Number(m[1]) / Number(m[2]);
  if ((m = /^(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔⅛])?$/.exec(s))) return Number(m[1].replace(',', '.')) + (FRACTIONS[m[2]] || 0);
  if (FRACTIONS[s] != null) return FRACTIONS[s];
  return null;
}

/** "400 g Kichererbsen (abgetropft)" -> { qty, unit, name, note } */
export function parseIngredient(line) {
  let s = String(line || '').replace(/^\s*[-•*·–]\s*/, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let qty = null, unit = null;
  const q = QTY_RE.exec(s);
  if (q) {
    qty = parseNumber(q[1]);
    s = s.slice(q[0].length);
    // "400g" ohne Leerzeichen
    const u = /^([A-Za-zÄÖÜäöüß]+\.?)(?=\s|$|,)/.exec(s);
    if (u && unitInfo(u[1])) {
      unit = normalizeUnit(u[1]);
      s = s.slice(u[0].length).trim();
    }
  }
  let name = s, note = null;
  const paren = /\(([^)]*)\)/.exec(name);
  if (paren) { note = paren[1].trim(); name = name.replace(paren[0], '').trim(); }
  const comma = name.indexOf(',');
  if (comma > 0) {
    note = [name.slice(comma + 1).trim(), note].filter(Boolean).join(', ');
    name = name.slice(0, comma).trim();
  }
  name = name.replace(/^(?:etwas|einige|evtl\.?|ca\.?)\s+/i, '').trim();
  if (!name) return null;
  return { qty, unit, name: name.slice(0, 80), note: note ? note.slice(0, 120) : null };
}

/** Zutat wieder als Text ("400 g Kichererbsen, abgetropft"). */
export function ingredientText(ing, factor = 1) {
  return [formatQty(ing.qty != null ? ing.qty * factor : null), ing.unit, ing.name].filter(Boolean).join(' ') +
    (ing.note ? `, ${ing.note}` : '');
}

export function formatQty(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

// ---------- Abgleich mit dem Vorrat ----------
// Gruppen von Namen, die als "dasselbe" zählen (kleingeschrieben)
const SYNONYMS = [
  ['nudeln', 'pasta', 'penne', 'fusilli', 'spaghetti', 'farfalle', 'rigatoni', 'tagliatelle', 'makkaroni'],
  ['lasagneplatten', 'lasagneteig', 'lasagne'],
  ['gemüsebrühe', 'brühe', 'gemüsefond', 'brühpulver'],
  ['paprikapulver', 'paprika edelsüß', 'paprika geräuchert', 'paprika rosenscharf', 'paprikapulver edelsüß'],
  ['chili', 'chiliflocken', 'chilipulver', 'cayennepfeffer'],
  ['sojasoße', 'sojasauce', 'sojasoße', 'tamari', 'shoyu'],
  ['olivenöl', 'öl', 'pflanzenöl', 'rapsöl', 'sonnenblumenöl'],
  ['zucker', 'rohrzucker', 'kristallzucker'],
  ['speisestärke', 'stärke', 'maisstärke'],
  ['tomaten (gehackt)', 'gehackte tomaten', 'tomaten aus der dose', 'stückige tomaten', 'passierte tomaten', 'dosentomaten'],
  ['kokosmilch', 'kokosnussmilch'],
  ['milch', 'hafermilch', 'sojamilch', 'pflanzenmilch', 'mandelmilch'],
  ['joghurt', 'sojajoghurt', 'pflanzenjoghurt'],
  ['butter', 'margarine', 'vegane butter'],
  ['frühlingszwiebeln', 'lauchzwiebeln'],
  ['knoblauch', 'knoblauchzehe', 'knoblauchzehen'],
  ['zwiebeln', 'zwiebel', 'rote zwiebel', 'rote zwiebeln'],
  ['kidneybohnen', 'rote bohnen'],
  ['soja-granulat', 'sojagranulat', 'sojahack'],
  ['hefe', 'trockenhefe', 'frischhefe'],
  ['reis', 'basmatireis', 'basmati', 'jasminreis', 'langkornreis', 'risottoreis', 'sushireis'],
  ['italienische kräuter', 'oregano', 'kräuter'],
];

/** Name als Schlüssel: klein, ohne Klammern und Sonderzeichen. */
export function nameKey(name) {
  return String(name || '').toLowerCase().normalize('NFC')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zäöüß0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['frisch', 'frische', 'frischer', 'klein', 'kleine', 'groß', 'große', 'bio',
  'vegan', 'vegane', 'veganer', 'getrocknet', 'getrocknete', 'gemahlen', 'gemahlener', 'optional', 'und', 'oder', 'zum',
  'für', 'den', 'die', 'der', 'nach', 'belieben', 'geschmack', 'etwas', 'tk', 'gefroren', 'reif', 'reife']);
const stem = (w) => (w.length > 4 ? w.replace(/(innen|en|er|n|e|s)$/, '') : w);
const tokens = (key, keepStop = false) => key.split(/[ -]+/).filter((w) => w.length > 1 && (keepStop || !STOP.has(w)));
const synonymGroup = (key) => SYNONYMS.find((g) => g.includes(key) || tokens(key).some((t) => g.includes(t)));

/** Wie gut passt Vorratsartikel itemName zur Zutat ingKey? (0 = gar nicht) */
function score(ingKey, itemName) {
  const ik = nameKey(itemName);
  if (!ik) return 0;
  // "Tomaten (gehackt)" passt nicht ganz so gut zu "Tomaten" wie "Tomate"
  if (ik === ingKey) return itemName.includes('(') ? 85 : 100;
  // Füllwörter nur bei der Zutat weglassen: "Getrocknete Tomaten" bleibt etwas anderes als "Tomaten"
  const it = tokens(ik, true).map(stem), gt = tokens(ingKey).map(stem);
  if (it.length && gt.length && it.join(' ') === gt.join(' ')) return 90;
  const g = synonymGroup(ingKey);
  if (g && (g.includes(ik) || g.includes(itemName.toLowerCase()))) return 70;
  if (gt.length === 1 && it.includes(gt[0])) return 60;       // "Paprika" ~ "Paprika edelsüß"
  if (it.length === 1 && gt.includes(it[0])) return 55;       // "rote Zwiebeln" ~ "Zwiebeln"
  // "Knoblauchzehen" ~ "Knoblauch", "Räuchertofu" ~ "Tofu"
  if (gt.some((w) => it.some((v) => v.length >= 4 && (w.startsWith(v) || w.endsWith(v))))) return 35;
  return 0;
}

/**
 * Passender Vorratsartikel für eine Zutat.
 * Gemerkte Zuordnung (state.links) geht vor. Gibt { item, linked } zurück;
 * item = null heißt: gehört nicht zum Vorrat.
 */
export function matchIngredient(ing, state) {
  const key = nameKey(ing.name);
  const link = (state.links || []).find((l) => l.nameKey === key);
  if (link) return { item: state.items.find((i) => i.id === link.itemId) || null, linked: true, key };
  let best = null, bestScore = 0;
  for (const item of state.items) {
    const s = score(key, item.name);
    // bei Gleichstand das, was gerade da ist
    if (s > bestScore || (s === bestScore && s > 0 && best?.missing && !item.missing)) { best = item; bestScore = s; }
  }
  return { item: bestScore >= 35 ? best : null, linked: false, key };
}

/** Status einer Zutat: da / knapp (zu wenig) / fehlt / extra (nicht im Vorrat -> Wunschzettel). */
export function ingredientStatus(ing, state) {
  const { item, linked, key } = matchIngredient(ing, state);
  if (!item) return { item: null, linked, key, status: 'extra' };
  if (item.missing) return { item, linked, key, status: 'fehlt' };
  if (item.quantity != null) {
    if (item.quantity <= 0) return { item, linked, key, status: 'fehlt' };
    const need = convert(ing.qty, ing.unit, item.unit);
    if (need != null && item.quantity < need) return { item, linked, key, status: 'knapp' };
  }
  return { item, linked, key, status: 'da' };
}

/** Überblick über ein Rezept: was fehlt (Vorrat) und was ist extra (Wunschzettel)? */
export function recipeStatus(recipe, state) {
  const rows = (recipe.ingredients || []).map((ing) => ({ ing, ...ingredientStatus(ing, state) }));
  const missing = rows.filter((r) => r.status === 'fehlt' || r.status === 'knapp');
  const extra = rows.filter((r) => r.status === 'extra' && !onWishlist(r.ing, state));
  return { rows, missing, extra, ready: missing.length === 0 && extra.length === 0 };
}

export const onWishlist = (ing, state) =>
  (state.wishes || []).some((w) => nameKey(w.name) === nameKey(ing.name));

/**
 * Vorschlag, was nach dem Kochen vom Vorrat abgezogen wird.
 * Nur für Artikel mit Menge; ohne Umrechnung (z. B. 400 g vs. Dosen) 1 Stück/Dose.
 */
export function deductionPlan(recipe, state) {
  const plan = new Map(); // itemId -> { item, from, to }
  for (const ing of recipe.ingredients || []) {
    const { item } = matchIngredient(ing, state);
    if (!item) continue;
    const entry = plan.get(item.id) || { item, from: item.quantity, to: item.quantity, empty: false };
    if (item.quantity != null) {
      const conv = convert(ing.qty, ing.unit, item.unit);
      const amount = conv ?? (isCountUnit(item.unit) ? 1 : 0);
      entry.to = Math.max(0, Math.round((entry.to - amount) * 100) / 100);
    }
    plan.set(item.id, entry);
  }
  return [...plan.values()];
}

/** Zeit hübsch: 90 -> "1 Std. 30 Min." */
export function formatMinutes(m) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return [h && `${h} Std.`, r && `${r} Min.`].filter(Boolean).join(' ');
}
