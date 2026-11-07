// Benachrichtigungen aufs iPhone (Web-Push) – die Seite im Browser.
//
// Damit das iPhone Benachrichtigungen bekommt:
//   1. App über „Teilen → Zum Home-Bildschirm“ als Symbol ablegen (ab iOS 16.4)
//   2. die App von dort öffnen und unter „Mehr → Benachrichtigungen“ einschalten
// Auf dem Mac (und anderen Computern) gibt es absichtlich keine – Wunsch: nur aufs iPhone.
// Was wann kommt, stellt jede Person selbst ein – gespeichert pro Person (server/modules/prefs.js),
// also nach „Wer bist du?“ auch auf einem neuen Handy gleich wieder da.
import { api } from './api.js';
import { myPrefs, updateMyPrefs } from './store.js';

const PREFS_KEY = 'haushalt_push_prefs';
export const DEFAULT_PREFS = {
  kinds: { tuer: true, liste: true, aufgaben: true, termine: true },
  quiet: { on: true, from: '22:00', to: '07:00' },
  morning: '07:30',
};

export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true ||
  Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * Was ist auf diesem Gerät möglich?
 *   'not-ios'     – Computer o. ä.: Benachrichtigungen kommen nur aufs iPhone
 *   'needs-home'  – iPhone im Safari: erst zum Home-Bildschirm hinzufügen
 *   'too-old'     – iPhone kann es nicht (älter als iOS 16.4)
 *   'denied'      – abgelehnt (in den iPhone-Einstellungen wieder erlauben)
 *   'ready'       – kann eingeschaltet werden / ist eingeschaltet
 */
export function pushSupport() {
  if (!isIos()) return 'not-ios';
  if (!isStandalone()) return 'needs-home';
  if (!supported()) return 'too-old';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

/** Meine Benachrichtigungs-Einstellungen (pro Person; früher pro Handy im localStorage). */
export function loadPrefs() {
  const own = myPrefs().push;
  let p = own;
  if (!p) { try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch { p = null; } }
  if (p) return { ...DEFAULT_PREFS, ...p, kinds: { ...DEFAULT_PREFS.kinds, ...p.kinds }, quiet: { ...DEFAULT_PREFS.quiet, ...p.quiet } };
  return structuredClone(DEFAULT_PREFS);
}
function storePrefs(prefs) {
  updateMyPrefs({ push: prefs });
}

/** Service Worker anmelden (beim Start der App). Antippen einer Benachrichtigung -> richtige Seite. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* z. B. privates Fenster */ });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'open') return;
    const url = new URL(e.data.url, location.origin);
    if (url.origin === location.origin && url.hash) location.hash = url.hash;
  });
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
}

/** Ist dieses Handy gerade angemeldet? */
export async function currentSubscription() {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return null;
  try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
}

const send = (sub, prefs) => {
  const { endpoint, keys } = sub.toJSON();
  return api.pushAbo({ endpoint, keys, prefs });
};

/** Einschalten. Muss direkt aus einem Antippen heraus aufgerufen werden (sonst fragt iOS nicht). */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };
  const reg = await registration();
  const { publicKey } = await api.pushKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
  const prefs = loadPrefs();
  await send(sub, prefs);
  storePrefs(prefs);
  return { ok: true };
}

/** Einstellungen ändern (gehen gleich an den Server). */
export async function savePrefs(prefs) {
  storePrefs(prefs);
  const sub = await currentSubscription();
  if (sub) await send(sub, prefs);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.pushAboAus(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function testPush() {
  const sub = await currentSubscription();
  if (sub) await api.pushTest(sub.endpoint);
}

/** Beim Start: Anmeldung beim Server auffrischen (z. B. nach „Hier bin ich“-Wechsel oder neuem Schlüssel). */
export async function refreshPush() {
  const sub = await currentSubscription();
  if (sub) await send(sub, loadPrefs()).catch(() => {});
}
