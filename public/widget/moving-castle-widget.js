// moving castle – Widget für den iPhone-Home-Bildschirm (und den Mac-Schreibtisch)
// Läuft in der kostenlosen App „Scriptable“. Einrichten: in der App unter „Mehr → Widget“.
//
// Mehrere Widgets mit verschiedenem Inhalt? Widget lange drücken → „Widget bearbeiten“ →
// bei „Parameter“ z. B.  liste  oder  aufgaben,essen  eintragen.
// Möglich: liste, aufgaben, essen, tuer, termine
//
// Diese beiden Zeilen setzt die App beim Einrichten ein (der Schlüssel ist geheim!):
const APP = '__APP__';
const KEY = '__KEY__';

// ---------- Farben wie in der App ----------
const FRIDGE = {
  mauve: ['#c9a9bc', '#b48ea4'], rose: ['#ecc4bf', '#dba7a1'], mint: ['#c6e0d1', '#a8cbb6'],
  salbei: ['#c9d2b1', '#adb991'], himmel: ['#c2d4e2', '#a2b9cc'], creme: ['#f4eadb', '#e5d4b6'],
};
const ON_FRIDGE = {
  mauve: '#3a2230', rose: '#4f2522', mint: '#1f3f35', salbei: '#2f3b25', himmel: '#1f3446', creme: '#45352a',
};
const PAPER = { gelb: '#fbefb4', rosa: '#f8d3d9', mint: '#d2ecd9', blau: '#d3e4f3' };
const INK = { tinte: '#2e2a4f', rot: '#c4384a', blau: '#2d64a8', gruen: '#3c7d4c' };
const TEXT = new Color('#3b2d33');
const MUTED = new Color('#6d5961');
const hand = (size) => new Font('Noteworthy-Bold', size);

// ---------- Bereiche ----------
const SECTIONS = {
  liste: {
    paper: 'gelb', url: '#/liste',
    title: (d) => `Einkaufsliste${d.liste.length ? ` (${d.liste.length})` : ''}`,
    lines: (d) => d.liste.map((i) => i.name),
    empty: 'Alles da ♡',
  },
  aufgaben: {
    paper: 'rosa', url: '#/aufgaben',
    title: () => 'Heute dran',
    lines: (d) => d.aufgaben.map((t) => `☐ ${t.title}${t.overdue ? ' !' : ''}`),
    empty: 'Nichts zu tun ♡',
  },
  essen: {
    paper: 'mint', url: '#/kochen',
    title: () => 'Heute gibt’s',
    lines: (d) => d.essen,
    empty: 'Noch nichts geplant',
  },
  tuer: {
    paper: 'blau', url: '#/vorrat',
    title: (d) => (d.tuer ? `Von ${d.tuer.from} ♡` : 'An der Tür'),
    lines: (d) => (d.tuer?.body ? [d.tuer.body] : []),
    empty: 'Keine Nachricht',
  },
  termine: {
    paper: 'gelb', url: '#/kalender',
    title: () => 'Termine heute',
    lines: (d) => d.termine.map((e) => (e.time ? `${e.time} ${e.title}` : e.title)),
    empty: 'Keine Termine',
  },
};

// ---------- Daten holen (bei Funkloch: die zuletzt geholten zeigen) ----------
const files = FileManager.local();
const cacheFile = files.joinPath(files.documentsDirectory(), 'moving-castle-widget.json');

async function loadData() {
  try {
    const req = new Request(`${APP}/api/widget/daten`);
    req.headers = { 'X-Widget-Key': KEY };
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (req.response.statusCode === 401) return { error: 'Widget-Schlüssel ungültig – bitte in der App unter „Mehr → Widget“ neu einrichten.' };
    if (req.response.statusCode !== 200) throw new Error(String(req.response.statusCode));
    files.writeString(cacheFile, JSON.stringify(data));
    return data;
  } catch (e) {
    if (files.fileExists(cacheFile)) return { ...JSON.parse(files.readString(cacheFile)), offline: true };
    return { error: 'Keine Verbindung zum moving castle.' };
  }
}

// ---------- Gemaltes Bild der Nachricht ----------
function drawingImage(strokes) {
  const ctx = new DrawContext();
  ctx.size = new Size(400, 300);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  for (const s of strokes) {
    const path = new Path();
    path.move(new Point(s.p[0], s.p[1]));
    if (s.p.length <= 2) path.addLine(new Point(s.p[0] + 1, s.p[1]));
    for (let i = 2; i < s.p.length; i += 2) path.addLine(new Point(s.p[i], s.p[i + 1]));
    ctx.addPath(path);
    ctx.setStrokeColor(new Color(INK[s.c] || INK.tinte));
    ctx.setLineWidth(9);
    ctx.strokePath();
  }
  return ctx.getImage();
}

// ---------- Ein Zettel ----------
function note(parent, id, d, height, { link = true } = {}) {
  const maxLines = Math.max(1, Math.floor((height - 34) / 15.5)); // Platz unter der Überschrift
  const sec = SECTIONS[id];
  const paper = id === 'tuer' && d.tuer?.paper ? d.tuer.paper : sec.paper;
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color(PAPER[paper] || PAPER.gelb);
  card.cornerRadius = 10;
  card.setPadding(8, 10, 8, 10);
  card.size = new Size(0, height); // volle Höhe, Breite passt sich an
  if (link) card.url = `${APP}/${sec.url}`;

  const title = card.addText(sec.title(d));
  title.font = hand(14);
  title.textColor = TEXT;
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.7;
  card.addSpacer(3);

  const lines = sec.lines(d) || [];
  if (id === 'tuer' && d.tuer?.drawing?.length && lines.length === 0) {
    const img = card.addImage(drawingImage(d.tuer.drawing));
    const h = height - 40;
    img.imageSize = new Size(h * 4 / 3, h);
  } else if (!lines.length) {
    const t = card.addText(sec.empty);
    t.font = Font.italicSystemFont(12);
    t.textColor = MUTED;
  } else if (id === 'tuer') {
    const drawn = d.tuer.drawing?.length > 0;
    const textLines = Math.max(1, Math.min(drawn ? 3 : 99, Math.floor((height - 34) / 19)));
    const t = card.addText(lines[0]);
    t.font = hand(15);
    t.textColor = TEXT;
    t.lineLimit = textLines;
    t.minimumScaleFactor = 0.75;
    // gemaltes Bild darunter, wenn noch Platz ist
    const rest = height - 44 - Math.min(textLines, Math.ceil(lines[0].length / 22)) * 19;
    if (drawn && rest >= 40) {
      card.addSpacer(4);
      const img = card.addImage(drawingImage(d.tuer.drawing));
      img.imageSize = new Size(rest * 4 / 3, rest);
    }
  } else {
    const shown = lines.length > maxLines ? lines.slice(0, maxLines - 1) : lines;
    for (const line of shown) {
      const t = card.addText(line);
      t.font = Font.systemFont(12);
      t.textColor = TEXT;
      t.lineLimit = 1;
    }
    if (lines.length > shown.length) {
      const more = card.addText(`+ ${lines.length - shown.length} mehr`);
      more.font = Font.systemFont(11);
      more.textColor = MUTED;
    }
  }
  card.addSpacer();
  return card;
}

// ---------- Widget bauen ----------
function chooseSections(d) {
  const param = String(args.widgetParameter || '').toLowerCase().split(/[\s,;]+/).filter((s) => SECTIONS[s]);
  return param.length ? param : (d.show || ['liste']);
}

function buildWidget(d) {
  const w = new ListWidget();
  const color = FRIDGE[d.fridgeColor] ? d.fridgeColor : 'mauve';
  const g = new LinearGradient();
  g.colors = FRIDGE[color].map((c) => new Color(c));
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(10, 10, 10, 10);
  w.url = `${APP}/#/vorrat`;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const brand = head.addText('moving castle');
  brand.font = hand(12);
  brand.textColor = new Color(ON_FRIDGE[color]);
  head.addSpacer();
  if (d.offline) {
    const off = head.addText('offline');
    off.font = Font.systemFont(10);
    off.textColor = new Color(ON_FRIDGE[color]);
  }
  w.addSpacer(6);

  if (d.error) {
    const t = w.addText(d.error);
    t.font = Font.systemFont(12);
    t.textColor = new Color(ON_FRIDGE[color]);
    return w;
  }

  const family = config.widgetFamily || 'medium';
  const ids = chooseSections(d).filter((id) => d[id] !== undefined);
  if (!ids.length) {
    const t = w.addText('Nichts ausgewählt – in der App unter „Mehr → Widget“ aussuchen.');
    t.font = Font.systemFont(12);
    t.textColor = new Color(ON_FRIDGE[color]);
    return w;
  }
  // Höhe der Zettel: Widget-Höhe minus Rand und Kopfzeile (iPhone: klein/mittel ca. 170, groß ca. 380 Punkte)
  const space = family === 'large' ? 330 : 122;
  if (family === 'small') {
    note(w, ids[0], d, space, { link: false });
    w.url = `${APP}/${SECTIONS[ids[0]].url}`;
  } else if (family === 'medium') {
    const row = w.addStack();
    row.layoutHorizontally();
    ids.slice(0, 2).forEach((id, i) => {
      if (i) row.addSpacer(8);
      note(row, id, d, space);
    });
  } else {
    // groß: bis zu 4 Zettel, je zwei nebeneinander
    const shown = ids.slice(0, 4);
    const rows = Math.ceil(shown.length / 2);
    const height = rows > 1 ? (space - 8) / 2 : space;
    for (let r = 0; r < shown.length; r += 2) {
      if (r) w.addSpacer(8);
      const row = w.addStack();
      row.layoutHorizontally();
      shown.slice(r, r + 2).forEach((id, i) => {
        if (i) row.addSpacer(8);
        note(row, id, d, height);
      });
    }
  }
  w.addSpacer();
  return w;
}

const data = await loadData();
const widget = buildWidget(data);
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium(); // Vorschau, wenn man das Skript in Scriptable antippt
}
Script.complete();
