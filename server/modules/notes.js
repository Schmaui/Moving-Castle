// Modul: Pinnwand – Zettel mit wichtigen Infos.
//
//   GET    /api/notes          Liste (kommt auch in /api/state mit)
//   POST   /api/notes          Neuer Zettel
//   PATCH  /api/notes/:id      Ändern
//   DELETE /api/notes/:id      Abnehmen
//
// Arten (kind):
//   zettel   – Notiz: Titel, Text, optional etwas Geheimes (PIN, Code …)
//   wlan     – WLAN für Gäste: data = { ssid, security: WPA|WEP|nopass, hidden }, secret = Passwort
//   nummern  – Telefonnummern-Gruppe: data = { entries: [{ name, number }] }
// Dokumente liegen nicht mehr an Zetteln, sondern im Ordner (folders.js + docs.js).
import { registerCrud } from '../resource.js';
import { HttpError } from '../http.js';
import { validateField } from '../validate.js';

export const KINDS = ['zettel', 'wlan', 'nummern'];
const SECURITY = ['WPA', 'WEP', 'nopass'];
const MAX_ENTRIES = 40;
// Telefonnummer: Ziffern, am Anfang ggf. +, dazwischen Leerzeichen / - ( ) .
const PHONE = /^\+?[\d\s/().-]{2,30}$/;

const text = (max) => ({ type: 'text', max });

/** Zusatzdaten prüfen und aufräumen (unbekannte Felder fallen weg). */
function checkData(value, key) {
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${key}: Objekt erwartet`);
  const out = {};
  if (value.ssid != null) out.ssid = validateField(text(64), value.ssid, `${key}.ssid`);
  if (value.security != null) {
    if (!SECURITY.includes(value.security)) throw new HttpError(400, `${key}.security: ungültiger Wert`);
    out.security = value.security;
  }
  if (value.hidden != null) out.hidden = value.hidden === true;
  if (value.entries != null) {
    if (!Array.isArray(value.entries)) throw new HttpError(400, `${key}.entries: Liste erwartet`);
    if (value.entries.length > MAX_ENTRIES) throw new HttpError(400, `${key}: höchstens ${MAX_ENTRIES} Nummern`);
    out.entries = value.entries.map((e, i) => {
      if (!e || typeof e !== 'object') throw new HttpError(400, `${key}.entries: Eintrag ${i + 1} ungültig`);
      const name = validateField(text(60), e.name ?? '', `Name ${i + 1}`);
      const number = validateField({ ...text(30), required: true }, e.number ?? '', `Nummer ${i + 1}`);
      if (!PHONE.test(number) || !/\d/.test(number)) throw new HttpError(400, `Nummer ${i + 1}: bitte nur Ziffern (und + - / Leerzeichen)`);
      return { name, number };
    });
  }
  return out;
}

export default {
  name: 'notes',
  inState: true,
  register(ctx) {
    const api = registerCrud(ctx, {
      path: '/api/notes',
      table: 'notes',
      orderBy: 'sort, id',
      fields: {
        kind:      { col: 'kind',       type: 'text', values: KINDS, default: 'zettel' },
        title:     { col: 'title',      type: 'text', required: true, max: 80 },
        body:      { col: 'body',       type: 'text', max: 4000, multiline: true },
        secret:    { col: 'secret',     type: 'text', max: 200 },
        data:      { col: 'data',       type: 'json', max: 8000, check: checkData },
        sort:      { col: 'sort',       type: 'int',  default: 0 },
        createdBy: { col: 'created_by', type: 'int',  readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if ('kind' in values && values.kind == null) throw new HttpError(400, 'kind: Pflichtfeld');
          if (!existing) values.created_by = actor;
        },
      },
    });
    return api;
  },
};
