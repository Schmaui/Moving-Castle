// Wer benutzt dieses Gerät? (Kait oder Schmaui)
// Wird nur auf diesem Gerät gespeichert und bei jeder Änderung als "X-Person"
// an den Server geschickt – so weiß die App, wer etwas eingetragen oder erledigt hat.
const KEY = 'haushalt_person';
let memory = null; // falls der Browser keinen Speicher erlaubt (z. B. privates Fenster)

export function myId() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (Number.isSafeInteger(v) && v > 0) return v;
  } catch { /* kein Speicher – dann nur für diese Sitzung */ }
  return memory;
}

export function setMyId(id) {
  memory = id;
  try { localStorage.setItem(KEY, String(id)); } catch { /* egal */ }
}
