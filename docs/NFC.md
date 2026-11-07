# NFC-Sticker beschreiben

Du brauchst NFC-Sticker vom Typ **NTAG213** oder **NTAG215** (beide reichen) und die kostenlose App **„NFC Tools“** (wakdev) für Android oder iPhone.

Die URLs – **online** (siehe `ONLINE.md`, deine Domain statt `unserhaushalt.duckdns.org`):

| Sticker | URL |
|---|---|
| Einkaufsliste | `https://unserhaushalt.duckdns.org/#/liste` |
| Vorrat | `https://unserhaushalt.duckdns.org/#/vorrat` |

… oder **zu Hause mit Raspberry Pi** (ggf. mit deiner IP statt `haushalt.fritz.box`):

| Sticker | URL |
|---|---|
| Einkaufsliste (z. B. an der Haustür oder am Einkaufsbeutel) | `http://haushalt.fritz.box:8080/#/liste` |
| Vorrat (z. B. an Kühlschrank oder Vorratsschrank) | `http://haushalt.fritz.box:8080/#/vorrat` |

> Teste die URL **vorher im Handy-Browser**. Erst wenn sie dort funktioniert, den Sticker beschreiben.

## So geht's

1. NFC Tools öffnen → Reiter **„Schreiben“**.
2. **„Datensatz hinzufügen“** → **„URL / URI“** wählen.
3. Links im Auswahlfeld das passende Präfix wählen – online **`https://`**, zu Hause **`http://`**. Rechts den Rest eintragen, z. B.
   `unserhaushalt.duckdns.org/#/liste` bzw. `haushalt.fritz.box:8080/#/liste`
4. Mit **OK** bestätigen, dann **„Schreiben / 1 Datensatz“** tippen.
5. Das Handy mit der Rückseite (beim iPhone mit der Oberkante) an den Sticker halten, bis „Schreiben abgeschlossen“ erscheint.
6. Für den zweiten Sticker dasselbe mit `/#/vorrat` wiederholen.

Testen: Bildschirm entsperren und das Handy an den Sticker halten.
- **Android:** öffnet die Seite direkt im Browser.
- **iPhone (ab XS):** zeigt oben eine Mitteilung an, die du antippst.

### Optional: Sticker sperren

Unter **„Weitere“ → „Tag sperren“** wird der Sticker schreibgeschützt.
**Achtung: Das ist endgültig.** Sperre ihn erst, wenn Adresse und IP sicher feststehen. Ändert sich später die IP oder der Port, kann ein gesperrter Sticker nicht mehr umgeschrieben werden.

### Tipps

- Sticker nicht direkt auf Metall kleben (Kühlschranktür außen ist oft Metall). Dort lieber **Anti-Metall-NFC-Sticker** verwenden oder etwas Abstand schaffen (z. B. mit einem Magneten oder Karton).
- Ein Sticker kann jederzeit neu beschrieben werden, solange er nicht gesperrt ist.

## App-Icon auf dem Home-Bildschirm

- **iPhone (Safari):** Teilen-Symbol → **„Zum Home-Bildschirm“**. Die App startet dann im Vollbild ohne Browserleiste.
- **Android (Chrome):** Menü ⋮ → **„Zum Startbildschirm hinzufügen“**. Weil die App im Heimnetz über `http` läuft, legt Chrome eine **Verknüpfung** an. Die öffnet sich im Browser, funktioniert aber genauso.

Die Icons liegen in `public/icons/`. Hast du `icon.svg` geändert, erzeugst du die PNG-Versionen mit:

```bash
node scripts/make-icons.cjs
```
