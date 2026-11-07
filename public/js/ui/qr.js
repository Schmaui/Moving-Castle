// QR-Code-Erzeuger (ohne Zusatzpakete), z. B. für den WLAN-Zettel.
// Kurzfassung des bekannten Verfahrens nach Project Nayuki (MIT-Lizenz):
// Byte-Modus, Fehlerkorrektur "M" (~15 %), Versionen 1–40.
//
//   qrMatrix('WIFI:T:WPA;S:Schloss;P:geheim;;')  -> Array von Zeilen mit true/false
//   qrSvg(text)                                   -> fertiges <svg> (schwarz auf weiß)

// Pro Version (Index 1–40): Fehlerkorrektur-Bytes pro Block und Anzahl Blöcke (Stufe M)
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const FORMAT_BITS_M = 0;

const getBit = (x, i) => ((x >>> i) & 1) !== 0;

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}
const numDataCodewords = (ver) => Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

// ---------- Reed-Solomon (Fehlerkorrektur) ----------
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function rsDivisor(degree) {
  const result = new Array(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

function addEccAndInterleave(data, ver) {
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(numRawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]);
    });
  }
  return result;
}

/** QR-Code als Matrix (true = dunkel). */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  for (; ver <= 40; ver++) {
    if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= numDataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw new Error('Text zu lang für einen QR-Code');

  // Datenbits: Modus "Byte" (0100), Länge, Inhalt, Abschluss, Füllbytes
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = numDataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = new Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => { data[i >>> 3] |= b << (7 - (i & 7)); });
  const codewords = addEccAndInterleave(data, ver);

  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => { modules[y][x] = dark; isFn[y][x] = true; };

  // ---- feste Muster: Taktlinien, Suchmuster, Ausrichtungsmuster, Version ----
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = [];
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6);
    for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
  }
  align.forEach((ax, i) => align.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }));
  const drawFormat = (mask) => {
    const d = (FORMAT_BITS_M << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(f, i));
    setFn(8, 7, getBit(f, 6));
    setFn(8, 8, getBit(f, 7));
    setFn(7, 8, getBit(f, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(f, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(f, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(f, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // Platz reservieren
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(v, i);
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, bit); setFn(b, a, bit);
    }
  }

  // ---- Daten im Zickzack eintragen ----
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  // ---- Maske wählen (die mit den wenigsten "Strafpunkten") ----
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!isFn[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x];
    }
  };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const score = penalty(modules, size);
    if (score < bestScore) { best = m; bestScore = score; }
    applyMask(m); // wieder rückgängig (XOR)
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

/** Vereinfachte Bewertung: lange Reihen, 2×2-Blöcke, Hell/Dunkel-Verhältnis. */
function penalty(m, size) {
  let score = 0;
  for (let y = 0; y < size; y++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let x = 1; x <= size; x++) {
        const same = x < size && (horizontal ? m[y][x] === m[y][x - 1] : m[x][y] === m[x - 1][y]);
        if (same) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  const total = size * size;
  score += Math.ceil(Math.abs(dark * 20 - total * 10) / total - 1) * 10;
  return score;
}

/** QR-Code als <svg> mit Ruhezone (immer schwarz auf weiß – sonst lesen Kameras ihn schlecht). */
export function qrSvg(text, { label } = {}) {
  const m = qrMatrix(text);
  const quiet = 4;
  const n = m.length + quiet * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('shape-rendering', 'crispEdges');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

/** Text für einen WLAN-QR-Code (Handykamera drauf -> verbindet sich). */
export function wifiText({ ssid, password, security = 'WPA', hidden = false }) {
  const esc = (s) => String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
  const type = security === 'nopass' ? 'nopass' : security;
  return `WIFI:T:${type};S:${esc(ssid)};${type === 'nopass' ? '' : `P:${esc(password)};`}${hidden ? 'H:true;' : ''};`;
}
