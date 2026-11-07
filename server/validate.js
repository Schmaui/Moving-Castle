// Eingabeprüfung. Jeder Feldtyp hat hier eine Funktion,
// die den Wert prüft und für die Datenbank aufbereitet.
import { HttpError } from './http.js';

// Steuerzeichen (unsichtbare Zeichen) entfernen, Zeilenumbrüche nur wo erlaubt
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LINE_BREAKS = /[\r\n\t]+/g;

const TYPES = {
  text(value, field, key) {
    if (value === null) return null;
    if (typeof value !== 'string') throw new HttpError(400, `${key}: Text erwartet`);
    let v = value.normalize('NFC').replace(CONTROL_CHARS, '');
    if (!field.multiline) v = v.replace(LINE_BREAKS, ' ');
    v = v.trim();
    if (field.max && [...v].length > field.max) {
      throw new HttpError(400, `${key}: höchstens ${field.max} Zeichen`);
    }
    return v === '' ? null : v;
  },
  int(value, field, key) {
    if (value === null) return null;
    if (!Number.isSafeInteger(value)) throw new HttpError(400, `${key}: ganze Zahl erwartet`);
    if (field.min != null && value < field.min) throw new HttpError(400, `${key}: mindestens ${field.min}`);
    if (field.maxValue != null && value > field.maxValue) throw new HttpError(400, `${key}: höchstens ${field.maxValue}`);
    return value;
  },
  number(value, field, key) {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, `${key}: Zahl erwartet`);
    if (field.min != null && value < field.min) throw new HttpError(400, `${key}: mindestens ${field.min}`);
    return value;
  },
  bool(value, field, key) {
    if (value === true || value === 1) return 1;
    if (value === false || value === 0) return 0;
    throw new HttpError(400, `${key}: true/false erwartet`);
  },
  // Für Freiform-Daten (z. B. später Rezept-Zutaten als Liste)
  json(value, field, key) {
    if (value === null) return null;
    const s = JSON.stringify(value);
    if (field.max && s.length > field.max) throw new HttpError(400, `${key}: zu groß`);
    return s;
  },
};

/** Prüft einen Wert anhand der Felddefinition und gibt den DB-Wert zurück. */
export function validateField(field, value, key) {
  const fn = TYPES[field.type];
  if (!fn) throw new Error(`Unbekannter Feldtyp "${field.type}" bei ${key}`);
  const v = fn(value, field, key);
  if (v === null && field.required) throw new HttpError(400, `${key}: Pflichtfeld`);
  return v;
}

/** Wandelt einen DB-Wert zurück in den API-Wert. */
export function fromDb(field, value) {
  if (value === null || value === undefined) return null;
  if (field.type === 'bool') return value === 1;
  if (field.type === 'json') {
    try { return JSON.parse(value); } catch { return null; }
  }
  if (typeof value === 'bigint') return Number(value);
  return value;
}
