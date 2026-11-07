// Kalender-Dateien (iCalendar / .ics) lesen – ohne Zusatzpakete.
// Apple liefert beim "Öffentlichen Kalender" genau so eine Datei.
//
//   expandIcs(text, { from, to, zone })  -> { name, events: [...] }
//
// Unterstützt: Zeitzonen (TZID), ganztägige Termine, mehrtägige Termine, Wiederholungen
// (RRULE: täglich/wöchentlich/monatlich/jährlich mit INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY,
// BYMONTH), Ausnahmen (EXDATE), einzeln geänderte Wiederholungen (RECURRENCE-ID), Absagen.
// Ergebnis-Zeiten sind Ortszeit in `zone` (Standard Europe/Berlin) als "JJJJ-MM-TTTHH:MM",
// ganztägige Termine als "JJJJ-MM-TT" (Ende = Tag NACH dem letzten Tag, wie in iCalendar).

const DAY_MS = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_PERIODS = 5000;      // Schutz vor endlosen Wiederholungen
const MAX_EVENTS = 5000;

// ---------- Zeilen lesen ----------
function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  // NAME;PARAM=WERT;PARAM2="a:b":INHALT  – Doppelpunkt in Anführungszeichen zählt nicht
  let inQuote = false, colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) { colon = i; break; }
  }
  if (colon < 0) return null;
  const [rawName, ...rawParams] = line.slice(0, colon).split(';');
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(colon + 1) };
}

const unescapeText = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

/** Rohdaten: Kalendername, Standard-Zeitzone, Termine (noch nicht aufgefaltet). */
export function parseIcs(text) {
  const lines = unfold(text);
  if (!lines.some((l) => l.trim().toUpperCase() === 'BEGIN:VCALENDAR')) throw new Error('Das ist keine Kalender-Datei');
  const cal = { name: null, zone: null, events: [] };
  const stack = [];
  let ev = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') { stack.push(p.value.toUpperCase()); if (p.value.toUpperCase() === 'VEVENT') ev = { exdates: [] }; continue; }
    if (p.name === 'END') {
      const what = stack.pop();
      if (what === 'VEVENT' && ev) { cal.events.push(ev); ev = null; }
      continue;
    }
    const where = stack[stack.length - 1];
    if (where === 'VCALENDAR') {
      if (p.name === 'X-WR-CALNAME') cal.name = unescapeText(p.value).trim();
      if (p.name === 'X-WR-TIMEZONE') cal.zone = p.value.trim();
      continue;
    }
    if (where !== 'VEVENT' || !ev) continue;
    switch (p.name) {
      case 'UID': ev.uid = p.value.trim(); break;
      case 'SUMMARY': ev.summary = unescapeText(p.value).trim(); break;
      case 'LOCATION': ev.location = unescapeText(p.value).trim(); break;
      case 'DESCRIPTION': ev.description = unescapeText(p.value).trim(); break;
      case 'STATUS': ev.status = p.value.trim().toUpperCase(); break;
      case 'DTSTART': ev.dtstart = timeProp(p); break;
      case 'DTEND': ev.dtend = timeProp(p); break;
      case 'DURATION': ev.duration = parseDuration(p.value); break;
      case 'RRULE': ev.rrule = parseRrule(p.value); break;
      case 'EXDATE': for (const v of p.value.split(',')) ev.exdates.push(timeProp({ ...p, value: v })); break;
      case 'RECURRENCE-ID': ev.recurrenceId = timeProp(p); break;
      default: break;
    }
  }
  return cal;
}

/** Zeitangabe: { date: [J,M,T], time: [h,m,s] | null, utc: bool, tz } */
function timeProp(p) {
  const v = p.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const isDate = p.params.VALUE === 'DATE' || m[4] === undefined;
  return {
    date: [Number(m[1]), Number(m[2]), Number(m[3])],
    time: isDate ? null : [Number(m[4]), Number(m[5]), Number(m[6] || 0)],
    utc: m[7] === 'Z',
    tz: p.params.TZID || null,
  };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const ms = ((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 24 * 3600 + Number(m[4] || 0) * 3600 + Number(m[5] || 0) * 60 + Number(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRrule(v) {
  const r = {};
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    if (k && val !== undefined) r[k.toUpperCase()] = val.toUpperCase();
  }
  const out = {
    freq: r.FREQ,
    interval: Math.max(1, Number(r.INTERVAL) || 1),
    count: r.COUNT ? Number(r.COUNT) : null,
    until: r.UNTIL ? timeProp({ value: r.UNTIL, params: {} }) : null,
    byDay: r.BYDAY ? r.BYDAY.split(',').map((d) => {
      const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d);
      return m ? { n: m[1] ? Number(m[1]) : null, wd: WEEKDAYS.indexOf(m[2]) } : null;
    }).filter(Boolean) : null,
    byMonthDay: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number).filter((n) => n && Math.abs(n) <= 31) : null,
    byMonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number).filter((n) => n >= 1 && n <= 12) : null,
  };
  return ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(out.freq) ? out : null;
}

// ---------- Zeitzonen ----------
const formatters = new Map();
function zoneFormatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return formatters.get(zone);
}
function validZone(zone, fallback) {
  if (!zone) return fallback;
  try { zoneFormatter(zone); return zone; } catch { return fallback; }
}
/** Wanduhr-Zeit in `zone` zum Zeitpunkt utcMs (als "UTC-Zahl" kodiert). */
function wallMsAt(utcMs, zone) {
  const parts = Object.fromEntries(zoneFormatter(zone).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}
/** Wanduhr-Zeit (kodiert wie Date.UTC) in Zone -> echter Zeitpunkt. */
function wallToUtc(wallMs, zone) {
  const first = wallMs - (wallMsAt(wallMs, zone) - wallMs);
  return wallMs - (wallMsAt(first, zone) - first);
}

// ---------- Datum rechnen (Kalendertage als Date.UTC-Zahlen) ----------
const dayMs = ([y, m, d]) => Date.UTC(y, m - 1, d);
const ymd = (ms) => { const d = new Date(ms); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const pad = (n) => String(n).padStart(2, '0');
const dayStr = (ms) => { const [y, m, d] = ymd(ms); return `${y}-${pad(m)}-${pad(d)}`; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (ms) => new Date(ms).getUTCDay();

/** Tage eines Monats, die zu BYDAY (mit/ohne Ordnungszahl) passen. */
function monthDaysByDay(y, m, byDay) {
  const out = [];
  const n = daysInMonth(y, m);
  for (const { n: ord, wd } of byDay) {
    const matches = [];
    for (let d = 1; d <= n; d++) if (weekday(Date.UTC(y, m - 1, d)) === wd) matches.push(d);
    if (ord == null) out.push(...matches);
    else {
      const pick = ord > 0 ? matches[ord - 1] : matches[matches.length + ord];
      if (pick) out.push(pick);
    }
  }
  return out;
}
function monthDaysByMonthDay(y, m, list) {
  const n = daysInMonth(y, m);
  return list.map((d) => (d > 0 ? d : n + d + 1)).filter((d) => d >= 1 && d <= n);
}

/** Alle Anfangstage einer Wiederholung (als Tages-Zahl), aufsteigend, ab dem ersten Termin. */
function* recurrenceDays(startDay, rule) {
  const [sy, sm, sd] = ymd(startDay);
  for (let k = 0; k < MAX_PERIODS; k++) {
    let days = [];
    if (rule.freq === 'DAILY') {
      days = [startDay + k * rule.interval * DAY_MS];
    } else if (rule.freq === 'WEEKLY') {
      const monday = startDay - ((weekday(startDay) + 6) % 7) * DAY_MS + k * rule.interval * 7 * DAY_MS;
      const wds = rule.byDay ? rule.byDay.map((b) => b.wd) : [weekday(startDay)];
      days = wds.map((wd) => monday + ((wd + 6) % 7) * DAY_MS);
    } else if (rule.freq === 'MONTHLY') {
      const total = sm - 1 + k * rule.interval;
      const y = sy + Math.floor(total / 12), m = (total % 12) + 1;
      const list = rule.byDay ? monthDaysByDay(y, m, rule.byDay)
        : rule.byMonthDay ? monthDaysByMonthDay(y, m, rule.byMonthDay)
          : sd <= daysInMonth(y, m) ? [sd] : [];
      days = list.map((d) => Date.UTC(y, m - 1, d));
    } else if (rule.freq === 'YEARLY') {
      const y = sy + k * rule.interval;
      for (const m of rule.byMonth || [sm]) {
        const list = rule.byDay ? monthDaysByDay(y, m, rule.byDay)
          : rule.byMonthDay ? monthDaysByMonthDay(y, m, rule.byMonthDay)
            : sd <= daysInMonth(y, m) ? [sd] : [];
        days.push(...list.map((d) => Date.UTC(y, m - 1, d)));
      }
    }
    if (rule.byMonth && rule.freq !== 'YEARLY') days = days.filter((d) => rule.byMonth.includes(ymd(d)[1]));
    if (rule.byDay && rule.freq === 'DAILY') days = days.filter((d) => rule.byDay.some((b) => b.wd === weekday(d)));
    for (const d of [...new Set(days)].sort((a, b) => a - b)) if (d >= startDay) yield d;
  }
}

// ---------- Alles zusammen ----------
/**
 * @param {string} text  Inhalt der .ics-Datei
 * @param {object} opts  from/to: "JJJJ-MM-TT" (Zeitraum), zone: Anzeige-Zeitzone
 */
export function expandIcs(text, { from, to, zone = 'Europe/Berlin' } = {}) {
  const cal = parseIcs(text);
  const displayZone = validZone(zone, 'Europe/Berlin');
  const defaultZone = validZone(cal.zone, displayZone);
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);

  // echter Zeitpunkt einer Zeitangabe
  const instant = (t, zone) => {
    const wall = dayMs(t.date) + ((t.time?.[0] || 0) * 3600 + (t.time?.[1] || 0) * 60 + (t.time?.[2] || 0)) * 1000;
    return t.utc ? wall : wallToUtc(wall, validZone(t.tz, zone));
  };
  const show = (utcMs) => {
    const w = wallMsAt(utcMs, displayZone);
    const d = new Date(w);
    return `${dayStr(w)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };

  // Einzeln geänderte Wiederholungen: UID -> Zeitpunkte, die ersetzt wurden
  const overridden = new Map();
  for (const ev of cal.events) {
    if (ev.uid && ev.recurrenceId) {
      const key = ev.recurrenceId.time ? instant(ev.recurrenceId, defaultZone) : dayMs(ev.recurrenceId.date);
      if (!overridden.has(ev.uid)) overridden.set(ev.uid, new Set());
      overridden.get(ev.uid).add(key);
    }
  }

  const out = [];
  for (const ev of cal.events) {
    if (!ev.dtstart || out.length >= MAX_EVENTS) continue;
    if (ev.status === 'CANCELLED') continue;
    const allDay = !ev.dtstart.time;
    const zoneOfEv = validZone(ev.dtstart.tz, defaultZone);
    const base = {
      title: ev.summary || '(ohne Titel)',
      location: ev.location || null,
      notes: ev.description ? ev.description.slice(0, 2000) : null,
      allDay,
    };
    const skip = new Set(overridden.get(ev.uid) || []);
    for (const x of ev.exdates) if (x) skip.add(x.time ? instant(x, zoneOfEv) : dayMs(x.date));
    const recurring = ev.rrule && !ev.recurrenceId;

    if (allDay) {
      const start = dayMs(ev.dtstart.date);
      const len = ev.dtend && !ev.dtend.time ? Math.max(DAY_MS, dayMs(ev.dtend.date) - start)
        : ev.duration ? Math.max(DAY_MS, Math.round(ev.duration / DAY_MS) * DAY_MS) : DAY_MS;
      const untilMs = ev.rrule?.until ? dayMs(ev.rrule.until.date) : Infinity;
      const starts = recurring ? recurrenceDays(start, ev.rrule) : [start];
      let n = 0;
      for (const d of starts) {
        if (d > untilMs || d >= toMs) break;
        n++;
        if (recurring && ev.rrule.count && n > ev.rrule.count) break;
        if (skip.has(d) && recurring) continue;
        if (d + len <= fromMs) continue;
        out.push({ ...base, id: `${ev.uid || out.length}@${dayStr(d)}`, start: dayStr(d), end: dayStr(d + len) });
        if (out.length >= MAX_EVENTS) break;
      }
      continue;
    }

    const startUtc = instant(ev.dtstart, zoneOfEv);
    const endUtc = ev.dtend?.time ? instant(ev.dtend, validZone(ev.dtend.tz, zoneOfEv))
      : ev.duration != null ? startUtc + ev.duration : startUtc;
    const length = Math.max(0, endUtc - startUtc);
    const timeOfDay = (ev.dtstart.time[0] * 3600 + ev.dtstart.time[1] * 60 + ev.dtstart.time[2]) * 1000;
    const untilUtc = ev.rrule?.until ? (ev.rrule.until.time ? instant(ev.rrule.until, zoneOfEv) : dayMs(ev.rrule.until.date) + DAY_MS - 1) : Infinity;
    // Wiederholungen werden in der Ortszeit des Termins gerechnet (Sommerzeit bleibt richtig)
    const starts = recurring ? recurrenceDays(dayMs(ev.dtstart.date), ev.rrule) : [dayMs(ev.dtstart.date)];
    let n = 0;
    for (const d of starts) {
      const s = ev.dtstart.utc ? d + timeOfDay : wallToUtc(d + timeOfDay, zoneOfEv);
      if (s > untilUtc || s >= toMs + DAY_MS) break;
      n++;
      if (recurring && ev.rrule.count && n > ev.rrule.count) break;
      if (recurring && skip.has(s)) continue;
      if (s + length < fromMs) continue;
      out.push({ ...base, id: `${ev.uid || out.length}@${s}`, start: show(s), end: show(s + length) });
      if (out.length >= MAX_EVENTS) break;
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
  return { name: cal.name, events: out };
}
