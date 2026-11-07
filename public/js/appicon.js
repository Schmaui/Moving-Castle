// App-Icon aussuchen (Mehr → Dieses Gerät): Original oder „Nacht“ (blau mit Mond).
//
// Das iPhone nimmt das Icon in dem Moment, in dem man „Zum Home-Bildschirm“ tippt (aus dem
// <link rel="apple-touch-icon">). Deshalb: Icon in SAFARI aussuchen, dann die App neu zum
// Home-Bildschirm hinzufügen. (Die Home-Bildschirm-App hat ihren eigenen Speicher, getrennt von Safari.)
const KEY = 'haushalt_app_icon';

export const APP_ICONS = [
  { id: 'original', label: 'Original', suffix: '' },
  { id: 'nacht', label: 'Nacht', suffix: '-nacht' },
];

export function appIcon() {
  try {
    const v = localStorage.getItem(KEY);
    if (APP_ICONS.some((i) => i.id === v)) return v;
  } catch { /* egal */ }
  return 'original';
}

export const iconUrl = (id, size = 180) => {
  const { suffix } = APP_ICONS.find((i) => i.id === id) || APP_ICONS[0];
  return size === 180 ? `icons/apple-touch-icon${suffix}.png` : `icons/icon-${size}${suffix}.png`;
};

/** Icon-Verweise der Seite auf das gewählte Icon setzen (beim Start und nach dem Aussuchen). */
export function applyAppIcon(id = appIcon()) {
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', iconUrl(id));
  document.querySelector('link[rel="icon"]')?.setAttribute('href', id === 'original' ? 'icons/icon.svg' : 'icons/icon-nacht.svg');
}

export function setAppIcon(id) {
  try { localStorage.setItem(KEY, id); } catch { /* egal */ }
  applyAppIcon(id);
}
