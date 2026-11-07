// Rezept von einer Webseite holen.
// Fast alle großen Rezeptseiten (Chefkoch, Bianca Zapatka, Eat this!, …) haben unsichtbar
// ein maschinenlesbares Rezept eingebaut ("schema.org/Recipe" als JSON-LD). Das lesen wir aus.
// Ergebnis ist nur ein ENTWURF – gespeichert wird erst, wenn ihr in der App auf "Speichern" tippt.
//
// Sicherheit: Der Server ruft nur normale Internet-Adressen ab (keine Adressen im eigenen
// Netz wie 192.168.x.x oder localhost), höchstens 3 MB, höchstens 10 Sekunden.
import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './http.js';
import { config } from './config.js';

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 4;

/** Holt die Seite und gibt { title, ingredients: [Text], steps: [Text], minutes, servings, tags, sourceUrl } zurück. */
export async function importRecipe(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); } catch { throw new HttpError(400, 'Das sieht nicht wie ein Link aus'); }
  const html = await fetchPage(url);
  const recipe = findRecipe(html);
  if (!recipe) throw new HttpError(422, 'Auf der Seite habe ich kein Rezept gefunden – bitte selbst eintippen');
  return toDraft(recipe, url.href);
}

// ---------- Abrufen ----------
async function fetchPage(url) {
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MovingCastle-Rezeptimport/1.0)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9',
        },
      });
    } catch {
      throw new HttpError(502, 'Die Seite war nicht erreichbar');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new HttpError(502, `Die Seite hat nicht geantwortet (Fehler ${res.status})`);
    return readLimited(res);
  }
  throw new HttpError(502, 'Zu viele Weiterleitungen');
}

async function readLimited(res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new HttpError(413, 'Die Seite ist zu groß');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Nur http(s) und nur öffentliche Adressen (Schutz für den Server). */
async function assertPublic(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Nur http- und https-Links');
  if (config.importAllowPrivate) return;
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new HttpError(502, 'Diese Adresse gibt es nicht');
  }
  if (!addresses.length || addresses.some((a) => isPrivate(a.address))) {
    throw new HttpError(400, 'Diese Adresse darf nicht abgerufen werden');
  }
}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivate(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// ---------- Rezept in der Seite finden ----------
export function findRecipe(html) {
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const [, body] of html.matchAll(re)) {
    let data;
    try { data = JSON.parse(body.trim()); } catch { continue; }
    const found = walk(data);
    if (found) return found;
  }
  return null;
}

function walk(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = walk(n, depth + 1); if (r) return r; }
    return null;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  return walk(node['@graph'], depth + 1) || walk(node.mainEntity, depth + 1);
}

// ---------- In einen Entwurf umwandeln ----------
function toDraft(r, sourceUrl) {
  const ingredients = asList(r.recipeIngredient || r.ingredients).map(clean).filter(Boolean).slice(0, 80);
  const steps = instructions(r.recipeInstructions).map(clean).filter(Boolean).slice(0, 60);
  const keywords = typeof r.keywords === 'string' ? r.keywords.split(',') : asList(r.keywords);
  const tags = [...new Set([...asList(r.recipeCategory), ...keywords].map(clean).filter((t) => t && t.length <= 24))].slice(0, 6);
  return {
    title: clean(r.name).slice(0, 120) || 'Neues Rezept',
    ingredients,
    steps,
    minutes: duration(r.totalTime) || (duration(r.prepTime) + duration(r.cookTime)) || null,
    servings: servings(r.recipeYield),
    tags,
    sourceUrl,
  };
}

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v.flat() : [v]).filter((x) => typeof x === 'string');

function instructions(v) {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\n+|(?<=\.)\s+(?=[A-ZÄÖÜ])/);
  if (Array.isArray(v)) return v.flatMap(instructions);
  if (typeof v === 'object') {
    if (v.itemListElement) return instructions(v.itemListElement);
    return [v.text || v.name || ''];
  }
  return [];
}

/** HTML-Reste und Sonderzeichen entfernen. */
function clean(text) {
  return String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1') // "anbraten ." -> "anbraten."
    .trim();
}

/** "PT1H30M" -> 90 */
function duration(v) {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(v || ''));
  if (!m) return 0;
  return (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
}

function servings(v) {
  const first = Array.isArray(v) ? v[0] : v;
  const n = parseInt(String(first ?? ''), 10);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}
