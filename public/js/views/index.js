// Liste aller Ansichten. Reihenfolge = Reihenfolge in der Navigation.
// Neue Ansicht: Datei in views/ anlegen (liste.js als Vorlage), hier eintragen.
// Sie ist dann automatisch unter /#/<id> erreichbar und erscheint in der Navigation.
import liste from './liste.js';
import vorrat, { haushalt } from './vorrat.js';
import aufgaben from './aufgaben.js';
import kochen from './kochen.js';
import pinnwand from './pinnwand.js';
import einstellungen from './einstellungen.js';

// inNav: false = kein eigener Knopf (Haushalt und Kochen liegen unter "Küche" = vorrat).
export const VIEWS = [liste, vorrat, haushalt, kochen, aufgaben, pinnwand, einstellungen];
