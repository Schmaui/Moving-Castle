// Erzeugt die PNG-App-Icons aus public/icons/icon.svg (nur nötig, wenn du das Icon änderst).
// Aufruf: node scripts/make-icons.cjs   (braucht Playwright: npm i -g playwright)
// Das Icon selbst entsteht mit: python3 scripts/make-art.py public/img  (-> app-icon.svg)
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'public', 'icons');
const SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
// Icons zum Aussuchen (Mehr → Dieses Gerät): Original + „Nacht“ (blau mit Mond)
const VARIANTS = { '': 'icon.svg', '-nacht': 'icon-nacht.svg' };

(async () => {
  const browser = await chromium.launch();
  for (const [suffix, file] of Object.entries(VARIANTS)) {
    const svg = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const [name, size] of Object.entries(SIZES)) {
      const out = name.replace('.png', `${suffix}.png`);
      const page = await browser.newPage({ viewport: { width: size, height: size }, colorScheme: 'light', reducedMotion: 'reduce' });
      await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(dir, out) });
      await page.close();
      console.log('erstellt:', out);
    }
  }
  await browser.close();
})();
