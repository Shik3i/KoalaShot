# Umsetzung nach dem Audit — lokaler Kandidat 0.4.0

Stand: 2026-09-07. Ausgangspunkt: `ed8fc9be9efd537d5e2ee4c8d8eb9ea9b069f5ef` (`0.3.3`).
Der [ursprüngliche Audit](AUDIT.md) bleibt ein Bericht über diesen alten Stand. Die historischen Probe-Skripte und JSON-Dateien erwarten teilweise genau die damaligen Fehler; aktuelle Regressionen liegen in `tests/browser/audit-regressions.test.mjs`.

**Status:** Korrekturen lokal umgesetzt; lokale Pflichtprüfungen bestanden. Kein Commit, Push, Tag, Store-Upload oder Deployment für diesen Kandidaten.

## Befunde und Korrekturen

| ID | Änderung | Nachweis / verbleibende Grenze |
| --- | --- | --- |
| A01 | Gemeinsamer Compositor für Vorschau/Export; Redaction als letzte deckende Maske; Pixelgrenzen nach außen gerundet. | PNG-Pixelprüfung mit nachfolgendem Blur/Pixelate. Das lokale Original bleibt bis Discard/Expiry erhalten. |
| A02 | Dokumentrevision vor/nach asynchronem Export prüfen; Cache an Revision binden. | Während angehaltener PNG-Kodierung eine Redaction hinzufügen; erster Export wird abgewiesen, zweiter neu gerendert. |
| A03 | Kandidatensuche und tatsächliches Scrollziel getrennt. Page-Modus verändert ausschließlich das Dokument. | Gemischte Seite: Dokument scrollt 800px, interner Bereich bleibt bei 0. |
| A04 | Scrollabweichungen, Shrink, Stitch-Gaps und unvollständige Endhöhe abbrechen; fünf Minuten Gesamtlimit und Screenshot-Timeout. | Controller-Fault-Injection für Stillstand/Shrink, echte Pixelstreifen über alle Capture-Abschnitte. |
| A05 | Sticky-Inhalte während Capture in ihrem normalen Fluss belassen, Insets aufheben, Originalstyles wiederherstellen. | Spät sichtbare Sticky-Überschrift bleibt sichtbar. Beliebige komplexe Seiten bleiben best effort. |
| A06 | Interne Kandidaten müssen vollständig sichtbar und untransformiert sein; größere ungeeignete Kandidaten nicht auswählen. | Sichtbarer kleinerer Root funktioniert trotz größerem Offscreen-Root. |
| A07 | Abort an asynchronen Grenzen und nach PNG-Kodierung prüfen; Seite vor Kodierung restaurieren. | Abbruch während toBlob liefert cancelled, kein Erfolgsergebnis. |
| A08 | Capture/Draft gemeinsam konsistent lesen; Draft-Write und Live-Parent-Prüfung in derselben IndexedDB-Transaktion; Orphans prunen; Discard über BroadcastChannel verbreiten; Export revalidiert Capture. | Zweiter Editor wird ungültig, Originalreferenzen werden gelöscht, verspäteter Draft abgewiesen; beide Stores leer. |
| A09 | Native Buttons/Selects/Links von Editor-Shortcuts ausnehmen; Modifier beachten; temporäres Pan bei Blur zurücksetzen. | Space auf Save wird nicht verhindert; bestehende Tastatur-Annotationstests. Screenreader manuell offen. |
| A10 | Tatsächliche Effekte in der Vorschau über denselben Compositor; maximal acht gecachte Effekt-Canvases; irreführendes Width-Control für Effekte verborgen. | Gemeinsamer Renderpfad, Browser-Toolflow. Blur/Pixelate bleiben kosmetisch. |
| A11 | Horizontale Überbreite initial/fortlaufend erkennen und Warnung in Editor-Handoff übernehmen. | Controller-Test prüft Warnung und gespeicherte Metadaten. Kein horizontales Stitching. |
| A12 | Capture-/Settings-Controls bis zum abgeschlossenen Laden deaktivieren; Capture-Konfiguration beim Klick einfrieren. | Startup-Guard und Ready-Zustand im Browserflow. |
| A13 | Unveränderte Annotationen in eingefrorenen Snapshots teilen; Renderzugriff ohne Vollklon; History mit 100 Aktionen/konservativem 16-MiB-Retentionsbudget. | Modelltests + Benchmark unten. Draft-Journal serialisiert weiterhin pro abgeschlossener Änderung. |
| A14 | Eigene AA-konforme Buttonfarben für Light/Dark und Hover. | Tests lesen tatsächliche CSS-Variablen; Browser misst echten sichtbaren CTA. |
| A15 | Hero-PNG durch WebP ersetzt; bestehende Quelle erhalten; Social Card als PNG. | Hero 1.265.313 → 67.290 Bytes, etwa 94,7 % weniger. Desktop/Mobil-Screenshots. |
| A16 | Vertikales Padding separat setzen, horizontale Seitengutter erhalten. | 320/390/768/1440px, Light/Dark, kein horizontaler Overflow. |
| A17 | Privacy-Modell und Website benennen PNG, Titel, Origin, Metadaten, IndexedDB-Draft, Session-Journal und verzögerte physische Löschung. Neue URLs auf Origin minimiert. | Quellcode/Datensatzfluss. Ältere Records können bis zur Löschung vollständige URLs enthalten. |
| A18 | Veröffentlichung hängt von beiden Browserjobs ab; Chrome führt zusätzlich Audit-Regressionen aus. | Workflow-Diff geprüft; Remote-Ausführung dieses uncommitteten Kandidaten steht aus. |
| A19 | Exakt beide ZIP-Namen, vollständiges Inventar, Manifest und sämtliche Bytes gegen Quelle prüfen; doppelte Einträge/CRC prüfen. | Sieben Positiv-/Negativtests mit temporären Kopien. |
| A20 | Status, Testing, Release-Runbook, Checkliste, Changelog und Store-Text aktualisiert; Quellversion heißt Current build. | Markdown-Linkprüfung; lokale/remote/manuelle Nachweise getrennt. |
| A21 | Offizielle Install-CTAs vorbereitet, Host/HTTPS/Pfad geprüft, bis zur Konfiguration verborgen; ehrlicher Vorabstatus. | `landing/version.json` enthält null statt erfundener Store-URLs. Freischaltung erst nach Store-Zulassung. |
| A22 | Neue echte Chrome-/Firefox-Screenshots vom gebauten Editor mit eigener Demo-Seite; Annotated Editor als erstes Listing-Bild vorgesehen. | `store-assets/screenshots/`; visuell geprüft. Finale Dashboard-/Owner-Abnahme offen. |

Zusätzlich umgesetzt: primäres **Capture & edit** ohne vorherigen Originalexport, Capture-Vorschau und wiederverwendbare Copy/Save/Edit-Aktionen, Privacy-/Help-Links, expliziter Bilddekodierfehler, Storage-Timeouts und begrenzte History-/Effekt-Ressourcen.

Zusätzlich beim visuellen Nachtest gefunden und behoben: Die hohe Werkzeugleiste drückte bei 800px Fensterhöhe Status/Privacy-/Tastaturhinweise aus dem Viewport. Die Desktop-Leiste scrollt jetzt eigenständig; beide Browser prüfen, dass die Hinweise sichtbar bleiben.

## Messungen und Prüfungen

Der neue History-Mikrobenchmark benutzt den produktiven unveränderlichen Lese-/Änderungspfad: 300 Pen-Annotationen mit jeweils 500 Punkten, zehn Änderungen. Lokal 0,227–0,559 ms pro Modelländerung; 10.000 Lesezugriffe 0,359 ms; 20,58 MiB Heap nach explizitem GC. Node `v25.2.1`. Keine Browser-FPS-Messung, keine DOM-/Journal-/Exportzeit. Der alte Benchmark verwendete Vollklone und maß Heap ohne denselben GC-Schritt; die Heapwerte sind deshalb kein kontrollierter Vorher/Nachher-Prozentvergleich.

Reproduzierbar mit:

```sh
node --expose-gc scripts/benchmark-editor-history.mjs
npm test
npm run test:browser:chrome
npm run test:browser:firefox
npm run test:regressions
```

Abschlusslauf auf Windows, 2026-09-07:

| Prüfung | Ergebnis | Beleg |
| --- | --- | --- |
| npm test | 40/40 Unit-Tests; ESLint; 21 Markdown-Dateien; npm audit 0 Vulnerabilities; Build; exakte ZIP-Prüfung; 7/7 Pakettests; AMO 0 Fehler / 0 Notices / 0 Warnungen | [verification.txt](verification.txt) |
| Chrome-Matrix | Erfolg und Clipboard-Verweigerung bestanden; Chrome/153.0.8010.12; Editor 390px und DPR 2 | [chrome-flow.txt](chrome-flow.txt) |
| Firefox-Matrix | Erfolg und Clipboard-Verweigerung bestanden; Firefox 155.0.1; Editor 500px | [firefox-flow.txt](firefox-flow.txt) |
| Audit-Regressionen | Alle Assertions bestanden, einschließlich 24 PNG-Farbstreifen, Crop/Redaction-Randpixel und Auswahl bei 5000 Annotationen | [fixed-browser-results.json](fixed-browser-results.json) |
| History-Modell | Messergebnisse, Grenzen siehe oben | [history-after.json](history-after.json) |
| Paket-Identität | SHA-256 beider finaler ZIPs | [SHA256SUMS](SHA256SUMS) |

Neue Screenshots: [Landing mobil/dunkel](landing-390-dark.png), [Landing Desktop/hell](landing-1440-light.png), [Chrome Editor](../../../store-assets/screenshots/chrome-editor-annotated.png), [Firefox Editor](../../../store-assets/screenshots/firefox-editor-annotated.png).

Die automatisierte Freigabeprüfung lehnte den AMO-Schritt zunächst wegen eines vermuteten Uploads ab. Nach Prüfung der installierten Version 10.10.0 und der [offiziellen lokalen CLI-Dokumentation](https://github.com/mozilla/addons-linter#command-line) wurde derselbe Gate-Aufruf freigegeben. Kein Extension-Upload fand statt.

Build-Ausgaben: `dist/chrome/`, `dist/firefox/`, `dist/landing/`, `dist/koalashot-chrome-0.4.0.zip`, `dist/koalashot-firefox-0.4.0.zip`. Die letzte Quellkorrektur erlaubt Select/Pan/Crop weiterhin bei 5000 Annotationen; sie wurde zusätzlich im abschließenden Chromium-Grenzwerttest geprüft.

## Browser-Testgrenzen

Die Browser laufen headless in isolierten Profilen. Testmanifeste ergänzen vorübergehend `tabs`/`<all_urls>`; die Releasepakete behalten `activeTab`, `scripting`, `storage` und optionales `clipboardWrite`. Damit wird der Capture-/Editorablauf geprüft, jedoch kein echtes Toolbar-Grant mit unverändertem Manifest bewiesen.

Firefox verwendet einen Test-Bootstrap und `--remote-allow-system-access` ausschließlich im isolierten Loopback-Testprofil. Siehe [Mozilla Remote Security](https://firefox-source-docs.mozilla.org/remote/Security.html). Privilegierte Extension-Seiten erlauben dort keine BiDi-Pointer-/Viewport-/Screenshot-Befehle. Editor-Input ist synthetisch; Fensterbreite mindestens 500px; Editor-DPR-2 und 390px werden in Chromium geprüft. Firefox-Store-Screenshots verwenden die echte `tabs.captureVisibleTab`-API. Keine Benutzerprofile oder fremden Browserprozesse werden beendet.

Chrome-Store-Bilder verwenden beim ursprünglichen Seitencapture den physischen Viewport. CDP-Emulation kann von dem durch `captureVisibleTab` aufgenommenen Compositor abweichen; künstliche Emulationsartefakte dürfen nicht als Store-Beispiel verwendet werden. Der zusätzliche Pixelstreifentest arbeitet ebenfalls mit dem physischen Viewport.

## Vor öffentlicher Freigabe offen

1. Manuelle Toolbar-/activeTab-/Clipboard-Abnahme der unveränderten Pakete; reale Skalierung/Zoom, Firefox-Mindestversion/ESR und Zielbetriebssysteme.
2. Remote-CI/CodeQL des finalen Commits und tagbezogene Checksums/Attestation.
3. Store-Dashboard: tatsächliche Datenschutzantworten, Publisher-/Support-/Legal-Angaben, Screenshotauswahl und jeweilige Zulassung.
4. Deployment der Landingpage; öffentliche HTTPS-Routen, CSP, Cache-/MIME-Header und Privacy-/Legal-Ziele prüfen.
5. Nach Zulassung reale URLs in `landing/version.json` eintragen, neu bauen/deployen und Installation testen.

Resize-Handles, Lokalisierung, horizontales Stitching, mehrere/nutzergewählte Scrollroots und weitere Ausgabeformate bleiben ein separates Feature-Backlog. Sie werden derzeit nicht als vorhandene Funktionen beworben. Diese Umsetzung ist keine Garantie fehlerfreier Captures auf beliebigen dynamischen Drittseiten.