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
