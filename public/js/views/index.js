// Liste aller Ansichten. Reihenfolge = Reihenfolge in der Navigation.
// Neue Ansicht: Datei in views/ anlegen (liste.js als Vorlage), hier eintragen.
// Sie ist dann automatisch unter /#/<id> erreichbar und erscheint in der Navigation.
import liste from './liste.js';
import vorrat from './vorrat.js';
import aufgaben from './aufgaben.js';
import einstellungen from './einstellungen.js';

export const VIEWS = [liste, vorrat, aufgaben, einstellungen];
