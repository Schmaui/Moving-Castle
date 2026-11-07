// Liest ein hochgeladenes JPEG-Bild (Fotos an der Tür, Profilbilder).
// Der Browser verkleinert die Bilder vorher (public/js/ui/photos.js -> shrink).
import { HttpError } from './http.js';

export const MAX_JPEG_BYTES = 4 * 1024 * 1024;  // 4 MB (verkleinert sind es meist ~300 KB)

/** Body lesen und prüfen, ob es wirklich ein JPEG ist. Gibt die Bytes zurück. */
export async function readJpeg(req, maxBytes = MAX_JPEG_BYTES) {
  if (!String(req.headers['content-type'] || '').startsWith('image/jpeg')) {
    throw new HttpError(415, 'Bitte ein JPEG-Bild schicken');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Foto ist zu groß');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  // Echte JPEG-Datei? (beginnt immer mit FF D8 FF)
  if (data.length < 100 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    // Für die Fehlersuche (docker compose logs): Größe und Anfang der Daten
    console.warn(`[fotos] kein JPEG: ${data.length} Bytes, Anfang ${data.subarray(0, 8).toString('hex') || 'leer'}, ` +
      `Browser: ${String(req.headers['user-agent'] || '?').slice(0, 120)}`);
    throw new HttpError(400, 'Das ist kein JPEG-Bild');
  }
  return data;
}

/** Bild ausliefern (darf lange im Browser bleiben – neue Datei = neue Adresse). */
export function sendJpeg(res, data) {
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': data.length,
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.end(data);
}
