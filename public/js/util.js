// Kleine Helfer fürs DOM.

/**
 * Erzeugt ein Element. Texte werden IMMER als Text eingefügt (nie als HTML),
 * deshalb ist das automatisch sicher gegen eingeschleusten Code (XSS).
 *
 *   h('button', { class: 'btn', onclick: fn }, 'Speichern')
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on')) {
      if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') {
      el.value = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Falls du doch mal innerHTML brauchst: Text vorher hiermit escapen. */
export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Deutsche Mehrzahl: plural(3, 'Artikel fehlt', 'Artikel fehlen') */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Vergleicht Namen ohne Rücksicht auf Groß-/Kleinschreibung. */
export const sameName = (a, b) =>
  a.localeCompare(b, 'de', { sensitivity: 'base' }) === 0;

/** Menge/Einheit hübsch formatieren, z. B. "2 Dosen". */
export function formatAmount(item) {
  if (item.quantity == null && !item.unit) return '';
  const qty = item.quantity == null ? '' : item.quantity.toLocaleString('de-DE');
  return [qty, item.unit].filter(Boolean).join(' ');
}

// ---------- Datum (Kalendertage als "JJJJ-MM-TT", immer in der Zeit dieses Geräts) ----------
const pad = (n) => String(n).padStart(2, '0');
const toDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** Heute als "JJJJ-MM-TT". */
export const today = () => toDay(new Date());

/** Tage addieren: addDays('2026-11-07', 7) -> '2026-11-14'. */
export function addDays(day, n) {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** Monate addieren (31. -> letzter Tag des Monats, falls es den Tag nicht gibt). */
export function addMonths(day, n) {
  const d = fromDay(day);
  const target = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(target, last));
  return toDay(d);
}

/** Abstand in Tagen von a nach b (b - a). */
export const daysBetween = (a, b) => Math.round((fromDay(b) - fromDay(a)) / 86400000);

/** Wochentag-Kürzel, z. B. "Fr." */
export const weekday = (day) => fromDay(day).toLocaleDateString('de-DE', { weekday: 'short' });

/** Fälligkeit freundlich: "heute", "morgen", "seit 2 Tagen", "Fr. 14.11." */
export function formatDue(day) {
  const diff = daysBetween(today(), day);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'seit gestern';
  if (diff < -1) return `seit ${-diff} Tagen`;
  const d = fromDay(day);
  const date = `${d.getDate()}.${d.getMonth() + 1}.`;
  return diff < 7 ? `${weekday(day)} ${date}` : date;
}

/** Zeitpunkt (ISO) freundlich: "gerade eben", "vor 5 Min.", "heute 14:30", "gestern", "Mo. 3.11." */
export function formatWhen(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const diff = daysBetween(toDay(t), today());
  const time = `${t.getHours()}:${pad(t.getMinutes())}`;
  if (diff === 0) return `heute ${time}`;
  if (diff === 1) return `gestern ${time}`;
  return `${t.toLocaleDateString('de-DE', { weekday: 'short' })} ${t.getDate()}.${t.getMonth() + 1}.`;
}
