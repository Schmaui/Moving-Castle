// Nachbau der wichtigsten Teile der iPhone-App „Scriptable“ – nur zum Testen des Widget-Skripts
// (public/widget/moving-castle-widget.js) hier am Computer. Führt das Skript aus und macht aus dem
// Widget eine HTML-Seite, die scripts/screenshots.cjs fotografiert.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SIZES = { small: [170, 170], medium: [364, 170], large: [364, 382] }; // iPhone 13 (Punkte)

/** Führt das Skript aus. Ergebnis: das Widget als Baum (oder Fehler). */
async function runWidget(source, { family = 'medium', parameter = null } = {}) {
  let result = null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptable-'));

  class Color { constructor(hex) { this.hex = hex; } }
  class Font {
    constructor(name, size) { this.name = name; this.size = size; }
    static systemFont(s) { return new Font('system', s); }
    static boldSystemFont(s) { return new Font('system-bold', s); }
    static italicSystemFont(s) { return new Font('system-italic', s); }
  }
  class Size { constructor(w, h) { this.width = w; this.height = h; } }
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  class Path {
    constructor() { this.points = []; }
    move(p) { this.points.push([p]); }
    addLine(p) { this.points.at(-1).push(p); }
  }
  class DrawContext {
    constructor() { this.lines = []; this.size = new Size(100, 100); }
    addPath(p) { this.path = p; }
    setStrokeColor(c) { this.color = c.hex; }
    setLineWidth(w) { this.width = w; }
    strokePath() { for (const seg of this.path.points) this.lines.push({ pts: seg, color: this.color, width: this.width }); }
    getImage() { return { kind: 'drawing', size: this.size, lines: this.lines }; }
  }
  class LinearGradient { constructor() { this.colors = []; this.locations = []; } }
  class WidgetText { constructor(text) { this.type = 'text'; this.text = String(text); } }
  class WidgetImage { constructor(img) { this.type = 'image'; this.image = img; } }
  class WidgetStack {
    constructor() { this.type = 'stack'; this.dir = 'v'; this.children = []; this.padding = [0, 0, 0, 0]; }
    layoutHorizontally() { this.dir = 'h'; }
    layoutVertically() { this.dir = 'v'; }
    centerAlignContent() { this.center = true; }
    setPadding(t, l, b, r) { this.padding = [t, l, b, r]; }
    addStack() { const s = new WidgetStack(); this.children.push(s); return s; }
    addText(t) { const x = new WidgetText(t); this.children.push(x); return x; }
    addImage(i) { const x = new WidgetImage(i); this.children.push(x); return x; }
    addSpacer(n) { this.children.push({ type: 'spacer', length: n ?? null }); }
  }
  class ListWidget extends WidgetStack {
    presentMedium() { result = this; return Promise.resolve(); }
  }
  class Request {
    constructor(url) { this.url = url; this.headers = {}; this.response = {}; }
    async loadJSON() {
      const res = await fetch(this.url, { headers: this.headers });
      this.response = { statusCode: res.status };
      return res.json();
    }
  }
  const FileManager = {
    local: () => ({
      documentsDirectory: () => dir,
      joinPath: (a, b) => path.join(a, b),
      writeString: (f, s) => fs.writeFileSync(f, s),
      readString: (f) => fs.readFileSync(f, 'utf8'),
      fileExists: (f) => fs.existsSync(f),
    }),
  };
  const Script = { setWidget: (w) => { result = w; }, complete: () => {} };
  const config = { widgetFamily: family, runsInWidget: true };
  const args = { widgetParameter: parameter };

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const names = ['Color', 'Font', 'Size', 'Point', 'Path', 'DrawContext', 'LinearGradient', 'ListWidget', 'Request', 'FileManager', 'Script', 'config', 'args'];
  await new AsyncFunction(...names, source)(Color, Font, Size, Point, Path, DrawContext, LinearGradient, ListWidget, Request, FileManager, Script, config, args);
  fs.rmSync(dir, { recursive: true, force: true });
  if (!result) throw new Error('Skript hat kein Widget gesetzt');
  return result;
}

// ---------- Widget -> HTML ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fontCss(f) {
  if (!f) return 'font: 12px -apple-system, sans-serif;';
  if (f.name === 'Noteworthy-Bold') return `font: 700 ${f.size + 3}px Caveat, cursive;`;
  const style = f.name === 'system-italic' ? 'italic ' : '';
  const weight = f.name === 'system-bold' ? '700 ' : '';
  return `font: ${style}${weight}${f.size}px Nunito, -apple-system, sans-serif;`;
}

function node(n, parentDir) {
  if (n.type === 'spacer') {
    return n.length == null ? '<div style="flex:1 1 0"></div>'
      : `<div style="flex:0 0 ${n.length}px"></div>`;
  }
  if (n.type === 'text') {
    const clamp = n.lineLimit ? `display:-webkit-box;-webkit-line-clamp:${n.lineLimit};-webkit-box-orient:vertical;overflow:hidden;` : '';
    return `<div style="${fontCss(n.font)}color:${n.textColor?.hex || '#000'};${clamp}white-space:pre-wrap;flex:0 0 auto">${esc(n.text)}</div>`;
  }
  if (n.type === 'image') {
    const { width, height } = n.imageSize || n.image.size;
    const lines = n.image.lines.map((l) => `<polyline fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="${l.color}" stroke-width="${l.width}" points="${l.pts.map((p) => `${p.x},${p.y}`).join(' ')}"/>`).join('');
    return `<svg viewBox="0 0 ${n.image.size.width} ${n.image.size.height}" width="${width}" height="${height}" style="flex:0 0 auto">${lines}</svg>`;
  }
  const [t, l, b, r] = n.padding;
  const bg = n.backgroundColor ? `background:${n.backgroundColor.hex};` : '';
  const grow = parentDir === 'h' ? 'flex:1 1 0;min-width:0;' : 'flex:0 0 auto;';
  const height = n.size?.height ? `height:${n.size.height}px;` : '';
  return `<div style="display:flex;flex-direction:${n.dir === 'h' ? 'row' : 'column'};${n.center ? 'align-items:center;' : ''}${bg}border-radius:${n.cornerRadius || 0}px;padding:${t}px ${r}px ${b}px ${l}px;${grow}${height}${n.dir === 'v' && parentDir === 'h' ? 'align-self:stretch;' : ''}overflow:hidden">${n.children.map((c) => node(c, n.dir)).join('')}</div>`;
}

function widgetHtml(widgets, base) {
  const cards = widgets.map(({ widget, family, label }) => {
    const [w, h] = SIZES[family];
    const g = widget.backgroundGradient ? `linear-gradient(180deg, ${widget.backgroundGradient.colors.map((c) => c.hex).join(', ')})` : '#fff';
    const [t, l, b, r] = widget.padding;
    return `<figure><div class="w" style="width:${w}px;height:${h}px;background:${g};padding:${t}px ${r}px ${b}px ${l}px">${widget.children.map((c) => node(c, 'v')).join('')}</div><figcaption>${esc(label)}</figcaption></figure>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${base}/css/fonts.css"><style>
    body{margin:0;padding:24px;background:#d9d4e3 linear-gradient(160deg,#cfd8ea,#e8d5e2);display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;font-family:Nunito,sans-serif}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}
    figcaption{font-size:13px;color:#3b2d33}
    .w{box-sizing:border-box;border-radius:22px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 6px 18px rgb(0 0 0 / .18)}
    .w *{box-sizing:border-box}
  </style></head><body>${cards}</body></html>`;
}

module.exports = { runWidget, widgetHtml, SIZES };
