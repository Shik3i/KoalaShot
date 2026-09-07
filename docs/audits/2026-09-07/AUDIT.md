# KoalaShot: Audit vor Chrome Web Store und Firefox Add-ons

Stand: 2026-09-07. Ergebnis: **NO-GO für die öffentliche Veröffentlichung des geprüften Builds.**

Fünf P1-Befunde betreffen vertrauliche Bilddaten, falsche Exportversionen, das Scrollziel, fehlende Fortschrittsgrenzen und verschwindenden Seiteninhalt. Weitere Befunde betreffen Bedienung, Speicherung, Performance, Landingpage und Release-Nachweise. Ein erfolgreicher Build oder AMO-Linter reicht hier nicht als Freigabe.

## 1. Prüfstand und Beweisgrenzen

Geprüfter Checkout: `C:\Users\s3ish\Documents\Workspace\KoalaShot`, Branch `main`, Commit `ed8fc9be9efd537d5e2ee4c8d8eb9ea9b069f5ef`, Produktversion `0.3.3`. Zu Beginn keine Änderungen in `git status --short`. Kein Pull, Branchwechsel, Commit, Push, Deployment oder Store-Upload. Produktcode unverändert. Der Build hat `dist/` neu erzeugt; ergänzt wurden ausschließlich dieser Audit, Prüfskripte und Messergebnisse.

Prüfflächen: beide Manifeste, Popup, Capture-Controller, Content-Script, Stitcher, API-/Clipboard-Adapter, IndexedDB und Einstellungen, Editorzustand/History/Geometrie/Export, HTML/CSS, Landing-/Privacy-/Legal-Seiten, Assets, Store-Paket, Build-/Validierungs-/Release-Skripte, CI und vorhandene Tests.

Belegklassen:

- **Browser:** reproduziert mit gebauter Extension in isoliertem Headless Chrome `153.0.8010.12` auf Windows.
- **Modellprobe:** unveränderter Controller-/History-Code mit kontrollierten Abhängigkeiten oder Node-Mikrobenchmark. Kein Ersatz für eine echte Browsermessung.
- **Code:** nachvollziehbarer Zustands-/Datenfluss; konkret benannte Bedingung, aber nicht jeder Fall interaktiv reproduziert.
- **Lücke/Risiko:** fehlende Absicherung oder Veröffentlichungsvoraussetzung; keine Behauptung eines bereits beobachteten Fehlers auf allen Plattformen.

Die vorhandene Chrome-Automation und die Audit-Browserproben erweitern **nur ihre temporären Testmanifeste** um `<all_urls>`, `tabs` und im Erfolgsablauf verpflichtendes `clipboardWrite`. Das veröffentlichte Manifest bleibt unverändert. Deshalb belegen diese Tests keine erstmalige Berechtigungsabfrage aus dem echten Toolbar-Popup und kein vollständiges `activeTab`-End-to-End-Verhalten.

Die Browserprozesse liefen mit separaten Testprofilen. Die Harnesses beenden ausschließlich ihre selbst gestarteten Prozesse. Keine regulären Nutzerbrowser oder Docker-Prozesse wurden beendet.

### Ausgeführte Prüfungen

| Prüfung | Ergebnis | Aussagegrenze |
| --- | --- | --- |
| `npm test` | Unit-Tests 34/34, ESLint, Dokumentationsprüfung, Produktionsaudit, Build und ZIP-Validierung bestanden; Gesamtprozess scheiterte anschließend beim Download des AMO-Linters mit `EACCES` | Kein erfolgreicher Gesamtprozess behauptet |
| `npx --yes addons-linter@10.10.0 --warnings-as-errors dist/koalashot-firefox-0.3.3.zip` mit Netzwerkfreigabe | 0 errors, 0 notices, 0 warnings | Statische AMO-Validierung; keine Store-Freigabe |
| `npm audit --json` | 0 vulnerabilities; auch Development-Abhängigkeiten einbezogen | Aktueller npm-Datenbankbefund, keine allgemeine Sicherheitsgarantie |
| `npm run test:browser:chrome` | Full flow und permission denial bestanden | Testberechtigungen wie oben; PNG-Dateiexistenz überwiegend statt Bildinhaltsvergleich |
| `npm run test:browser:firefox` | In Sandbox: `Firefox BiDi endpoint timed out; last value: false` | Kein Capture erreicht |
| Derselbe Firefox-Test außerhalb Sandbox | BiDi startet; Popup-Navigation endet mit `unsupported operation` | Testzugang weiterhin defekt; kein Firefox-Capture nachgewiesen |
| `node docs/audits/2026-09-07/browser-probes.mjs` | Befunde zu Scrollziel, Redaction, Export-Cache, Cancel, Sticky, Kandidatenauswahl, Tastatur, verwaistem Draft und CSS reproduziert | Erweiterte Testberechtigungen, synthetische lokale Inhalte |
| `node docs/audits/2026-09-07/model-probes.mjs` | Fehlender Fortschrittsabbruch und History-Kosten reproduziert | Kontrollierte Transport-/Canvas-Abhängigkeiten; Node `v25.2.1` |
| Landing lokal | 320, 390, 768 und 1440 CSS-Pixel; jeweils Light/Dark; Screenshots bei 390/1440 geprüft | Kein realer Mobilbrowser, kein vollständiger Screenreader- oder Lighthouse-Audit |
| Öffentliche Website | Web-Abruf von `/` und `/privacy/` ohne verwertbares Ergebnis; direkte HTTPS-Requests nach Netzwerkfreigabe mit 15-s-Timeout | Kein Beleg für globalen Ausfall; HTTP-Header, Deployment-Version und Erreichbarkeit bleiben unbestätigt |

Firefox-Fehler außerhalb Sandbox, exakt:

```text
Error: browsingContext.navigate [a0ce5af9-08b6-4e07-8a5d-d2c5abe2e172] unsupported operation: Navigation to "moz-extension://00000000-0000-4000-8000-000000000001/popup/popup.html" is not allowed in this context
```

Geprüfte öffentliche Ziele: `https://shot.koalastuff.net/`, `/privacy/`, `/legal/`, `/version.json`, `/assets/og-card.svg` sowie `https://koalastuff.net/imprint`. Das zentrale Impressum war über die Web-Suche lesbar; direkte Requests von dieser Umgebung liefen ebenfalls in den Timeout. Live-Store-Accounts, Einreichungsstatus und aktuelle GitHub-Checks wurden nicht authentifiziert geprüft. Historische grüne CI-Läufe sind keine aktuelle Release-Freigabe.

### Gebaute Artefakte

| Datei unter `dist/` | Bytes | SHA256 |
| --- | ---: | --- |
| `koalashot-chrome-0.3.3.zip` | 73.074 | `204A4E59F4BC616999C0FD25AED7A64771A2798D8052D0B053A27DD3AFB289E2` |
| `koalashot-firefox-0.3.3.zip` | 72.827 | `BDA3E5DB5B990E7BE9BDBADB8FA29E4D84D3C70DE379B5027712B1EC452BF1D7` |

Ungepackte Browserartefakte: `dist/chrome/` und `dist/firefox/manifest.json`. Website: `dist/landing/`. **Die Artefakte enthalten die hier beschriebenen Fehler und sind nicht als freigegeben zu verstehen.**

## 2. Priorisierte Befunde

P1: vor öffentlicher Veröffentlichung beheben. P2: konkrete Qualitäts-/Datenhaltungs-/Nachweislücke; im Releaseplan verbindlich behandeln. P3: nachgeordnete Verbesserung. Die 22 Einträge unterscheiden Fehler von Test-, Dokumentations- und Marketinglücken; sie sind nicht 22 gleich schwere Sicherheitslücken.

| ID | Priorität | Bereich | Befund | Beleg |
| --- | --- | --- | --- | --- |
| A01 | P1 | Export/Privacy | Effekte zeichnen Originalpixel über Schwärzungen | Browser |
| A02 | P1 | Export/Race | Veralteter Export überschreibt Cache nach neuer Bearbeitung | Browser |
| A03 | P1 | Capture | Seitenmodus verwendet inneres Scrollziel | Browser |
| A04 | P1 | Capture/Liveness | Kein Abbruch bei fehlendem Scrollfortschritt | Modellprobe + Code |
| A05 | P1 | Bildinhalt | Späte Sticky-Überschriften verschwinden vollständig | Browser |
| A06 | P2 | Internal Capture | Größter ungeeigneter Kandidat verdrängt sichtbaren geeigneten Bereich | Browser |
| A07 | P2 | Cancel | Abbruch während PNG-Encoding liefert weiter Erfolg | Browser |
| A08 | P2 | Speicher/Privacy | Gelöschtes Capture erhält durch zweiten Editor neue verwaiste Drafts | Browser + Code |
| A09 | P2 | Tastatur | Space auf Buttons wird vom globalen Pan-Shortcut abgefangen | Browser + Code |
| A10 | P2 | Editor | Blur/Pixelate-Vorschau entspricht nicht dem Export | Code + visuelle Prüfung |
| A11 | P2 | Capture | Horizontale Überbreite wird ohne Capture-Warnung abgeschnitten | Code |
| A12 | P2 | Popup/Race | Späte Einstellungsinitialisierung überschreibt Nutzerauswahl | Code |
| A13 | P2 | Performance | Ganze Dokumente werden wiederholt geklont und serialisiert | Mikrobenchmark + Code |
| A14 | P2 | Landing/A11y | Dark-Mode-CTA: 1,94:1 Kontrast; Test prüft anderen Farbwert | Browser |
| A15 | P2 | Landing/Performance | 1,27 MB dekoratives Hero-PNG | Browser + Assetgröße |
| A16 | P2 | Landing/Layout | Tablet-Hero verliert seitliches Padding | Browser |
| A17 | P2 | Privacy-Text | Öffentliche Erklärung lässt Metadaten/Journal/Löschzeitpunkt unvollständig | Code/Textvergleich |
| A18 | P2 | Release-Gate | Veröffentlichung wartet nicht auf Browsermatrix | Workflow |
| A19 | P2 | Validierung | ZIP-Gate prüft weder exakt zwei Archive noch vollständige Inhaltsgleichheit | Code |
| A20 | P2 | Dokumentation | 0.3.2-/32-Test-Status und Veröffentlichungshäkchen veraltet | Dateien |
| A21 | P2 | Store/Marketing | Veröffentlichungs- und Installationsstrecke noch nicht vorbereitet | Landing/Store-Paket |
| A22 | P3 | Store-Assets | Screenshots zeigen Testzustände und viel Leerfläche | Sichtprüfung |

### A01 — Schwärzung kann durch nachfolgende Effekte überschrieben werden

Ort: `extension/editor/editor-export.js:58`, `:139`, `:142`; `extension/editor/geometry.js:214`.

`renderEditorResultBlob()` zeichnet Annotationen in ihrer Reihenfolge. Eine Redaction deckt zunächst das Bild opak ab. Ein späteres `pixelate` oder `blur` liest in `applyImageEffect()` jedoch wieder aus `original.image`, nicht aus dem bereits bearbeiteten Bild. Damit gelangen verdeckte Originaldaten erneut in den Export.

Reproduktion: 100×100 rotes Original; schwarze Schwärzung bei `(10,10,80,80)`; anschließend deckungsgleiche Pixelate-/Blur-Annotation. Pixel `(50,50)` im fertigen PNG:

```text
redactOnly:         [0, 0, 0, 255]
redactThenPixelate: [255, 0, 0, 255]
redactThenBlur:     [255, 0, 0, 255]
```

Das beweist erneut eingezeichnete Originalpixel. Es behauptet nicht, dass jeder verpixelte Text vollständig rekonstruierbar wäre. Der Vertrag „secure opaque redaction“ ist trotzdem verletzt. In der Overlay-Vorschau bleibt eine Schwärzung sichtbar, während der Export anders komponiert wird; zusammen mit A10 besonders problematisch.

Fixrichtung: verbindliche Schutzmaske/abschließender Redaction-Pass auf Ausgabeauflösung; Effekte dürfen keine geschützten Originalpixel erneut einbringen. Rendering und Vorschau müssen dieselbe Reihenfolge und Schutzregel verwenden. Abnahmetests mit beiden Annotationsreihenfolgen, Teilüberlappung, Crop, verschobenen Effekten, Undo/Redo und Pixelprüfung im dekodierten Export. Bestehende Tests prüfen nur die Opazität des einzelnen Redaction-Primitivs.

### A02 — Später Export schreibt veraltetes Ergebnis in den Cache

Ort: `extension/editor/editor.js:122`, `:231`, `:780`, `:795`, `:806`, `:820`.

`setExportBusy()` sperrt Copy, Save und Discard. Annotationen, Undo/Redo, Text und Crop bleiben veränderbar. Ein Export fotografiert den Zustand vor seinem `await`. Eine zwischenzeitliche Bearbeitung setzt `lastRenderedExport = null`; der ältere Export schreibt nach seiner Fertigstellung aber erneut seinen Blob in denselben Cache. Beim nächsten Save wird dieser alte Blob ohne Abgleich mit dem aktuellen Dokument verwendet.

Browserprobe: Encoding-Callback kontrolliert verzögert, währenddessen neue Redaction gezeichnet, Callback freigegeben und erneut gespeichert. Ergebnis: eine neue Annotation im Editor, aber nur **ein** Encoderaufruf für **zwei** Speichervorgänge. Die zweite Ausgabe berücksichtigt die sichtbare neue Schwärzung nicht.

Fixrichtung: monotone Dokumentrevision; Cache `{revision, blob, filename}`; nur bei passender Revision wiederverwenden/publizieren. Alternativ sämtliche Dokumentänderungen während Export sperren, inklusive Tastatur und laufender Pointer-/Textoperationen. Test auch für Copy-Fallback, Crop und Undo während `toBlob()`.

### A03 — Seitenmodus scrollt versehentlich einen inneren Bereich

Ort: `extension/content/capture-page.js:313`, `:329`, `:399`, `:249`.

`targetElement: internalScrollArea` wird unabhängig von `captureTarget` gesetzt. `scrollSession()` und `restorePage()` entscheiden anschließend allein anhand der Existenz dieses Elements. `measureSession()` entscheidet dagegen anhand von `captureTarget`. Bewegung und Messung beziehen sich deshalb auf unterschiedliche Scrollwurzeln.

Browserprobe: Dokumenthöhe 3000, Viewport 1200×800, sichtbarer innerer Bereich 900×400 mit 2000px Inhalt. Seitenmodus fordert Y=800 an. Tatsächlich: `innerY=800`, `pageY=0`, zurückgemeldetes `actualY=0`. Im normalen Seitenmodus werden außerdem Styles/Attribute des inneren Bereichs verändert. Bei nicht null liegenden Ausgangspositionen kann die Wiederherstellung Seitenscrollkoordinaten auf den inneren Bereich anwenden.

Fixrichtung: `targetElement` ausschließlich für `captureTarget === "internal"` setzen; Messung, Scrollen und Restore an ein gemeinsames Target-Objekt binden. Gemischte Layouts mit mehreren Bereichen, Startscroll ungleich null und Seitenmodus trotz großem Sidebar-Scroller testen.

### A04 — Fehlender Fortschritt führt zu wiederholten Requests ohne Grenze

Ort: `extension/popup/capture-controller.js:269–280`; `extension/popup/stitcher.js:52`, `:243`.

Im letzten Abschnitt gilt bei `boundedFinalY > scrolled.actualY + 1`: Positionen neu berechnen und `continue`, ohne Fortschritt zu verlangen, Retry-Zähler oder Gesamtdeadline. Bei gleichbleibender Dokumenthöhe und unerreichbarem Ziel bleibt derselbe Zustand bestehen. Jeder neue Scrollrequest aktualisiert den Content-Watchdog; dieser begrenzt einen antwortenden, aber nicht vorankommenden Capture nicht.

Modellprobe mit echtem Controller, konstantem `actualY=0`, Dokumenthöhe 1600 und Viewporthöhe 800: Abschnitte `[1,1,2,2,2,2,2]`; erst der explizite Test-Abbruch nach dem fünften Versuch von Abschnitt 2 beendet den Ablauf. Kein unendlich langer Browserlauf durchgeführt. Die ergänzende Browserprobe für A03 belegt das falsche Scrollziel; ihr Zeitlimit allein beweist keine Endlosschleife.

Auslöser: A03, schrumpfende Dokumente, Scroll-Locks oder Snap-Ziele. Der Stitcher prüft außerdem nicht, ob die Ausgabe lückenlos bis zur Zielhöhe gefüllt wurde; Sprünge können unbemalte Bereiche hinterlassen.

Fixrichtung: gemessenen Fortschritt und lückenlose Abdeckung erzwingen, wenige begrenzte Wiederholungen, Gesamtlaufzeitlimit, Umgang mit Schrumpfung, `scroll-snap-type` kontrolliert deaktivieren/wiederherstellen oder explizit abbrechen. MDN beschreibt obligatorische Snap-Positionen; ein `scrollTo()`-Aufruf garantiert damit nicht das gewünschte Raster. [MDN: scroll-snap-type](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-snap-type)

### A05 — Noch nicht erfasste Sticky-Inhalte werden verborgen

Ort: `extension/content/capture-page.js:180–229`.

Alle `position: sticky`-Elemente mit `top` werden als `sticky-top` eingeordnet. Ab Abschnitt 2 werden sie verborgen, auch wenn sie im ersten Abschnitt noch weit unterhalb des Viewports lagen. Das entfernt echte Artikel-/Tabellen-/Abschnittsüberschriften vollständig aus dem Screenshot.

Browserprobe: Überschrift bei Dokument-Y=1000 mit `position:sticky;top:0`. Im Abschnitt bei Y=800 liegt sie erstmals sichtbar bei Viewport-Y=200. Gemessen: `visibility: hidden`.

Fixrichtung: Sticky-Verhalten von globalen Fixed-Overlays trennen. Sichtbarkeit/erste tatsächlich erfasste Position pro Element verfolgen oder Sticky vorübergehend in eine layouttreue normale Position überführen. Tests: Sticky nach dem Fold, mehrere Abschnitte, Bottom-Sticky und interne Scrollwurzeln. Die bestehende Fixed-/Sticky-Fixture gehört in den automatisierten Bildvergleich.

### A06 — Auswahl eines ungeeigneten internen Scrollbereichs

Ort: `extension/content/capture-page.js:98–122`, `:126–141`.

Die Suche bewertet Größe und Overflow, aber nicht vollständige Sichtbarkeit. Erst der bereits gewählte Kandidat wird auf Sichtbarkeit geprüft. Dadurch gewinnt ein größerer off-screen Scroller gegen einen geeigneten sichtbaren Bereich. Gemessene Antwort trotz sichtbarem 800×400-Bereich: `The internal scroll area must be fully visible in the browser viewport.`

Fixrichtung: Kandidaten zuerst nach Sichtbarkeit, realer Größe, Verbindung zum Dokument und unterstützter Transformation filtern; erst danach bewerten. Nicht sichtbare/überdeckte Container, kleiner als 50% breites Chatfenster, zwei gleich große Bereiche und CSS-Transforms zusätzlich testen. Mittelfristig explizite Bereichsauswahl statt ausschließlich „largest“.

### A07 — Cancel während Encoding beendet die Ausgabe nicht

Ort: `extension/popup/capture-controller.js:287–306`; `extension/popup/popup.js:69–119`.

Die letzte Cancel-Prüfung liegt vor `captureVisibleTab()`. Nach Screenshot-API, Decode, `stitcher.add()` und `toBlob()` wird nicht erneut geprüft. Die Browserprobe löst Abort direkt im PNG-Encoding-Callback aus. Ergebnis: `aborted: true`, trotzdem `outcome: "resolved"` mit 18.872-Byte-Blob. Der normale Popupablauf kann danach speichern, kopieren oder den Editor öffnen.

Fixrichtung: Abort nach jedem langen asynchronen Schritt und unmittelbar vor Ausgabe/Handoff prüfen; frühes bereits gesetztes Signal vor Injection behandeln. Aufräumen muss unabhängig davon erfolgen. Abnahme: Cancel während Injection, Scroll, Screenshot-API, Encoding, Clipboard-Vorbereitung und Editor-Handoff; kein Download nach bestätigtem Abbruch.

### A08 — Mehrere Editor-Tabs erzeugen nach Löschung verwaiste Drafts

Ort: `extension/common/capture-store.js:95–120`, `:155–179`; `extension/editor/editor.js:181–228`, `:831`.

`saveCaptureDraft()` prüft nicht innerhalb derselben Transaktion, ob der zugehörige Capture noch existiert und nicht abgelaufen ist. Bereits offene Editor-Tabs erhalten keine Lösch-/Revisionsbenachrichtigung. Nach Löschung kann ein anderer Tab neue Annotationsdaten schreiben. Pruning iteriert nur über `captures`, daher findet es Drafts ohne Capture nicht.

Browserprobe: identische Capture-ID in zwei Editoren öffnen, Capture über dieselbe Store-Funktion löschen, im zweiten Editor weiterzeichnen. Danach: `captures: 0`, `drafts: 1`, Save weiterhin aktiv. Der Test ruft die Löschfunktion direkt auf; damit wird die Wirkung einer anderweitigen Löschung nachgebildet, nicht eine manuelle Doppel-Tab-Sequenz behauptet.

Fixrichtung: atomarer Existenz-/TTL-Check beim Draft-Schreiben, Orphan-Pruning und tabübergreifende Invalidierung. Auch zwei konkurrierende Draft-Schreiber benötigen eine bewusste Konfliktregel. Sensible Annotationstexte dürfen nicht unbegrenzt als verwaister Draft liegen bleiben.

### A09 — Tastaturbedienung von Buttons und Select wird gestört

Ort: `extension/editor/editor.js:1001–1060`.

Globale Keydown-Behandlung schließt Inputs und Textareas aus, jedoch Buttons und Selects nicht. `Space` ruft unabhängig vom Fokus `preventDefault()` auf und aktiviert Pan. Browserprobe mit fokussiertem Save-Button: `defaultPrevented: true`. Die reguläre Space-Aktivierung eines Buttons wird damit blockiert. Annotations-Selects werden ebenfalls nicht als Form-Control ausgenommen. Buchstaben-Shortcuts werden sogar vor Prüfung von Ctrl/Cmd behandelt und können bei Browser-/Clipboard-Shortcuts nebenbei das Tool wechseln.

Fixrichtung: Canvas-Shortcuts an Canvas-/Stage-Fokus binden; native Controls respektieren; Modifier zuerst behandeln; temporäres Pan bei Blur zuverlässig zurücksetzen. Keyboard-Abnahme über Tab, Space, Enter, Select-Typahead, Ctrl/Cmd+C/A und Fokusverlust. Vorhandene Accessibility-Tests prüfen Markup und Konstanten, nicht diese Interaktion.

### A10 — Effektvorschau zeigt keine tatsächlichen Effekte

Ort: `extension/editor/editor.js:390–408`; `extension/editor/geometry.js:222–232`; `extension/editor/editor-export.js:58–104`.

Die Vorschau malt bei Pixelate/Blur lediglich ein transparent eingefärbtes Rechteck mit gestrichelter Kontur. Erst beim Export wird der Bildfilter angewendet. Nutzer sehen weder tatsächliche Unkenntlichkeit noch Randverhalten oder Schichtreihenfolge. Der angebotene Width-Regler steuert diese Filterstärke nicht; die Effektparameter sind im Export festgelegt.

Fixrichtung: gemeinsam genutzter Effekt-Compositor mit begrenzter Vorschauauflösung und eindeutigem Hinweis „cosmetic“. A01 zuerst beheben. Effektstärke entweder als wirkliche Eigenschaft anbieten oder unwirksame Controls ausblenden. Sichtprüfung von Vorschau gegen dekodierten Export, auch nach Zoom/Crop.

### A11 — Horizontale Inhalte fehlen ohne unmittelbare Warnung

Ort: `extension/content/capture-page.js:90`, `:147`, `:376`; `extension/popup/capture-controller.js:204–234`.

`documentWidth` wird gemessen und im Ready-Paket gesendet, aber vom Controller nicht ausgewertet. Exportbreite bleibt Viewport-/Containerbreite. Eine breite Tabelle kann rechts abgeschnitten werden, während das Popup eine erfolgreiche Full-page-Aufnahme meldet. Die FAQ dokumentiert fehlendes horizontales Stitching; das ersetzt keine Warnung beim konkreten Capture.

Fixrichtung vor Release: horizontale Überbreite erkennen und klar warnen/ablehnen oder explizit „vertical only“ bestätigen lassen. Die vorhandene `horizontal-overflow.html` mit Pixelmarkierungen an beiden Rändern prüfen. Zweidimensionales Stitching ist eine spätere Featureentscheidung.

### A12 — Initialisierung kann neuere Popup-Eingaben überschreiben

Ort: `extension/popup/popup.js:150–161`, `:69`, `:117`.

Das Popup ist sofort bedienbar und markiert sich als ready, bevor `pruneTemporaryCaptures()` und `loadSettings()` abgeschlossen sind. Eine bereits getroffene Nutzerauswahl kann durch das später gelieferte Einstellungsobjekt überschrieben werden. Auch `openEditor.checked` wird erst nach Capture erneut gelesen und ist damit nicht als unveränderlicher Startzustand gespeichert. Serialisierte Schreibzugriffe lösen diese Read-/Initialisierungsrace nicht.

Fixrichtung: Initialisierung gesondert absichern oder Benutzereingaben seit Start versionieren; Capture-Konfiguration beim Klick vollständig kopieren. Langsame Storage-Antworten, langsames Pruning, direkte Änderung und sofortiger Capture-Klick gezielt mit verzögerten Promises testen. Beleg hier: Codefluss, keine nachgestellte reale Storage-Verzögerung im Browser.

### A13 — History und Rendering skalieren mit dem gesamten Dokument

Ort: `extension/editor/history.js:82–120`; `extension/editor/annotation-model.js:183–188`; `extension/editor/editor.js:147`, `:164–189`, `:256`, `:402`.

History kopiert ganze Dokumente als Before-/After-Zustände. `getState()` kopiert erneut über JSON. Beim Rendern werden sämtliche Annotationen kopiert, bevor die sichtbaren ausgefiltert werden. Zusätzlich werden Select-Optionen neu aufgebaut und der gesamte Draft synchron in `sessionStorage` serialisiert. Ein auf 100 Schritte begrenzter Verlauf ist noch kein begrenztes Bytebudget.

Gemessen mit 300 Pen-Annotationen zu je 500 Punkten, zehn History-Änderungen: **143–170 ms pro Änderung**, anschließend etwa **179 MiB Node-Heap**. Dies ist ein Mikrobenchmark des echten History-Codes auf Node `v25.2.1`; nicht als Browser-FPS oder alleiniger Speicherbedarf der Extension zu lesen. DOM-/Canvas-/Journal-Aufwand fehlt darin noch. Die erlaubten 5000 Annotationen und je 2000 Punkte liegen weit darüber.

Fixrichtung: immutable strukturell geteilte Zustände oder Änderungsbefehle; Bytebudget zusätzlich zum Schrittlimit; Renderingzugriff ohne vollständigen Deep-Clone; Indizes/Culling vor Kopieren; Pointermoves per Animation Frame bündeln; Journal/Listenaufbau begrenzen. Benchmarkkorpus mit Text, Pen, Effekten und Undo auf 100/500/1000 Annotationen; Eingabe-Latenz und Peak-Speicher im Browser messen.

### A14 — Dark-Mode-Button verfehlt Kontrastanforderungen

Ort: `landing/styles.css:17–29`, `:52–53`; `tests/unit/accessibility.test.js:21–28`.

Tatsächliches CSS: weiße Schrift auf `rgb(102,207,135)` / `#66cf87`; gemessen **1,937:1** in allen geprüften Dark-Mode-Breiten. Light Mode: **5,286:1**. Der Unit-Test verwendet für Landing stattdessen `#1f633c` und kann die fehlerhafte reale Darstellung nicht erkennen.

Fixrichtung: eigene kontrastfeste Buttonfarben wie bereits in Popup/Editor oder dunkle Schrift; Hover/Focus ebenfalls messen. Test aus berechnetem CSS im Browser statt einer unabhängigen Liste gewünschter Farben. Für normale Schrift fordert WCAG 1.4.3 mindestens 4,5:1. [W3C: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### A15 — Das Hero-Bild dominiert die Website-Nutzlast

Ort: `landing/index.html:35`; `landing/assets/koalashot-mascot.png`.

Das dekorative PNG lädt auf Desktop und Mobil vollständig: **1.265.313 Bytes**, gegenüber 7629 Bytes CSS und 758 Bytes JavaScript. Das Bild besitzt feste intrinsische Abmessungen, was Layoutsprünge reduziert; responsive Quellen/modernes komprimiertes Format fehlen. Eine `koalashot-mascot-2d.webp` mit 78.050 Bytes ist vorhanden, ihre visuelle Austauschbarkeit wurde nicht vorausgesetzt.

Fixrichtung: dasselbe Motiv in passenden Auflösungen/transparentem WebP oder AVIF exportieren, `picture`/`srcset` und korrektes `sizes`; visuellen Vergleich durchführen. Anschließend kalten Mobilaufruf mit gedrosseltem Netz messen. Kein erfundener Lighthouse-/Core-Web-Vitals-Score: Live-Hosting und Transport waren nicht messbar.

### A16 — Zwischen Mobile und Desktop fehlt seitliches Hero-Padding

Ort: `landing/styles.css:35`, `:42`, `:97`, `:103`.

`.site-shell` definiert horizontales Padding, `.hero` überschreibt es mit `padding: 85px 0 100px` bzw. `55px 0 70px`. Die Wiederherstellung per Mobile-Regel greift nur bis 520px. Bei 768px gemessen: Überschrift links bei **0px**. Bei 390px korrekt 14px. Header und Footer besitzen ähnliche Padding-Shorthands und sollten gemeinsam überprüft werden.

Fixrichtung: vertikales `padding-block` statt Überschreiben aller Richtungen. 521/768/1024px sowie Privacy-/Legal-Seiten und 200% Browserzoom prüfen. Kein horizontaler Seitenoverflow bei den vier gemessenen Breiten; das ist nicht gleichbedeutend mit vollständiger Lesbarkeits-/Reflow-Freigabe.

### A17 — Öffentliche Datenschutzerklärung ist unvollständiger als das Modell

Ort: `landing/privacy/index.html:19–23`; `extension/popup/capture-controller.js:352–364`; `extension/editor/editor.js:164–169`; `docs/PRIVACY_MODEL.md`.

Gespeichert werden neben Screenshot und Annotationen auch vollständige `sourceUrl` und `sourceTitle`; die URL kann Query-/Fragmentdaten enthalten. Zusätzlich gibt es ein `sessionStorage`-Journal. Beides fehlt in der öffentlichen Beschreibung. Die Formulierung zur 24-Stunden-Frist erklärt nicht so präzise wie das interne Privacy-Modell, dass ohne offene Extension-Seite physische Löschung erst beim nächsten Start erfolgt. Die Clipboard-Erklärung nennt nur Capture & Copy; auch Copy edited fordert die optionale Berechtigung an.

Fixrichtung: gleiche, präzise Erklärung in Listing, Landing, Privacy und Extension-Hilfe. Nicht benötigte URL-Bestandteile gar nicht speichern; Hostname reicht möglicherweise bereits. Original bleibt trotz Redaction lokal erhalten, bis Löschung erfolgt: diesen Punkt sichtbar erklären. A08 muss technisch behoben werden; Text allein reicht nicht.

Chrome verlangt auch bei ausschließlich lokaler Verarbeitung eine zutreffende Offenlegung der Datenverarbeitung und nennt Screenshots ausdrücklich als Beispiel. Dashboard-Angaben müssen nach ihren tatsächlichen Felddefinitionen ausgefüllt werden; „keine Uploads“ bedeutet nicht „keine Datenverarbeitung“. [Chrome: User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

### A18 — Release-Workflow kann vor Browserergebnissen veröffentlichen

Ort: `.github/workflows/release.yml:64–96`; `.github/workflows/ci.yml:33–67`; `scripts/verify.mjs:16–24`.

Der Tag-Workflow führt `npm test` aus und publiziert danach direkt mit `draft: false`. `npm test` enthält keine Browsermatrix. Die Browsermatrix läuft in einem anderen Workflow ohne Abhängigkeit des Release-Jobs. Ein Tag kann damit einen GitHub-Release erzeugen, obwohl Browserprüfungen noch laufen oder später fehlschlagen. Ob beim historischen Release alle Checks bestanden, wurde hier nicht neu geprüft.

Fixrichtung: gemeinsame wiederverwendbare Verifikation mit Browserjobs vor Publish oder überprüfte Checks exakt auf dem Tag-SHA; alternativ Draft bis Freigabe. Tests und Build müssen dasselbe Commit und dieselben produktiven Manifeste adressieren. Deployment/Stores bleiben getrennte Veröffentlichungsziele.

### A19 — ZIP-Validierung hat eine unvollständige Erfolgskondition

Ort: `scripts/validate.py:133–147`.

`glob("*.zip")` kann leer sein; trotzdem wird Erfolg gemeldet. Pro gefundenem Archiv wird im Wesentlichen nach verbotenen Pfadteilen und `manifest.json` gesucht. Es fehlt ein Sollinventar für genau beide erwarteten Versionsarchive, deren Manifestwerte und ihre Übereinstimmung mit Quellen. `icon-master.png` ist im Build ausgeschlossen, aber nicht gesondert im Validator verboten. Der kombinierte Buildlauf erzeugte aktuell korrekt beide Archive; der Befund betrifft die fehlende Absicherung gegen zukünftige Packagingfehler oder beschädigte Artefakte.

Fixrichtung: erwartete Namen/Anzahl, Manifest-/Versionsvergleich, notwendige Dateien, Source-/Archive-Hashes und explizite Asset-Denylist. Negativtests mit fehlendem Firefox-ZIP, leerem ZIP, falscher Version, Testmanifest und Master-Icon.

### A20 — Readiness-Dokumentation widerspricht dem aktuellen Stand

Ort: `docs/STATUS.md`, `docs/TESTING.md`, `docs/RELEASE_CHECKLIST.md`, `store-assets/README.md`.

Mehrere Stellen beschreiben `0.3.2`, 32 Tests und ältere Browsernachweise. Die tatsächliche Produktversion lautet `0.3.3`, aktuell laufen 34 Unit-Tests. Release-Checkliste enthält historische Häkchen und offene Veröffentlichungs-/Repository-Setup-Punkte. Neuere Chrome-Tests decken mehr ab als die dortige Matrix; zugleich fehlen weiterhin wesentliche neue Fehlerfälle.

Fixrichtung: neutrale Vorlage von konkretem Release-Protokoll trennen. Jeder Nachweis mit Datum, Commit, Browserbuild, unveränderten bzw. erweiterten Berechtigungen und genauer Aussage. Historische Erfolge nicht als aktuelles Testergebnis kopieren. Der vorliegende Audit ersetzt keine Pflege der Release-Dokumente für den nächsten Build.

### A21 — Installations- und Store-Strecke ist noch im Teststadium

Ort: `landing/index.html:30`, `:59–73`; `docs/STORE_LISTING.md`.

Hero führt zu Workflow/GitHub. Browserkarten erklären lokale Testinstallation, die Store-Sektion enthält offene Links. Das ist vor Zulassung korrekt, aber noch keine fertige Werbe-/Installationsseite für den Launch. Es fehlen finale Store-IDs/URLs, bestätigte Live-Privacy-URL, reproduzierbarer First-install-Nachweis und eine kurze Anleitung für nichttechnische Nutzer. Aktuelle öffentliche Erreichbarkeit und Hostingheader sind hier unbestätigt.

Fixrichtung: konkrete Zustände „noch nicht veröffentlicht“ und „installierbar“ vorbereiten; nach Zulassung echte Store-CTAs, Browser-/Mindestversionshinweise und Supportpfad aktivieren. Keine Erfolgsmeldungen oder aktiven Badges vor existierenden Zielen. Der Store fordert zutreffende und aktuelle Angaben auch in Marketingmaterialien. [Chrome: Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies?hl=en)

### A22 — Storebilder transportieren den Produktnutzen schwach

Ort: `store-assets/screenshots/chrome-popup-capture.png`, `chrome-editor-annotated.png`, `store-assets/README.md`.

Sichtprüfung: Popup-Screenshot füllt nur einen kleinen linken Teil der 1280×800-Fläche; der Rest ist leer. Editor zeigt `127.0.0.1`, Fixture-Anweisungen, „Browser regression note“, viele überlappende Demoformen und Crop-Hilfslinien. Es sind reale UI-Bilder, aber keine überzeugende Präsentation eines fertigen Arbeitsablaufs. Der kleine Promo-Tile zeigt das Maskottchen sauber. Firefox-spezifische Bilder fehlen.

Fixrichtung: fertigen Build mit einer neutralen, eigenen Beispielseite aufnehmen; Capture → Annotation → sauberes Exportergebnis zeigen. Keine Mockups als Laufzeitbeweis. Vorhandene Abmessungen 1280×800, 440×280 und 1400×560 passen zu den Chrome-Vorgaben; mindestens ein Screenshot, Icon und kleiner Promo-Tile sind vorgesehen. [Chrome: Supplying Images](https://developer.chrome.com/docs/webstore/images)

## 3. Zusätzliche Risiken und noch offene Kompatibilitätsfälle

Diese Punkte sind bewusst keine als sicher reproduziert ausgegebenen neuen Bugs.

| Bereich | Beobachtung / offene Frage | Erforderliche Prüfung |
| --- | --- | --- |
| Echter Toolbar-Lifecycle | Capture lebt vollständig im Popup; Fokusverlust schließt normale Popups. Der Harness öffnet die Popup-URL als Tab. | Unverändertes Manifest über Toolbar starten; Permissionprompt, Fokuswechsel, Klick außerhalb, Browserwechsel, Save-Dialog und Popup-Wiederöffnung prüfen. Produkt muss Abbruchverhalten erklären. |
| Lazy Loading, Fonts, Video | Zwei Paint-Wartezyklen plus feste 120ms, kein gezieltes Warten auf sichtbare Bilder, Fonts oder Videos. CSS-Animationen werden pausiert; Video/Canvas/JS nicht. | Verzögerte Bilder und Fonts, Skeletons, virtuelle Listen, IntersectionObserver, Animation/Video; begrenzte Settling-Strategie ohne Netzstillstands-Endlosschleife. |
| Capture-Atomizität | URL/Tab werden vor Screenshot geprüft, aber nicht nach der asynchronen Aufnahme und vor dem Stitching. | Navigation/SPA-Replacement und Tabwechsel exakt während Screenshot-API; keine alte/neue Seite kombinieren. Keine bestätigte Fremdtab-Datenaufnahme behauptet. |
| Langsame Geräte / Watchdog | 15s Content-Watchdog, 20s Requesttimeout; lange API-/Encode-Phasen senden keinen Ping. | CPU-Drosselung, sehr große PNGs, Tab-Hintergrund, Schlaf-/Wiederaufnahme; keine vorzeitig restaurierten Frames verwenden. |
| Speicher | 512-MiB-Rohbudget prüft Canvasgröße, aber Base64-String, Decoding, Bitmap, Blob, temporäre Exportflächen und mehrere Tabs kommen hinzu. 25% Growth-Reserve wird vorab angelegt. | Low-memory-Systeme und mehrere Editoren, wiederholte Captures; reale Peak-Messung. Keine OOM-Reproduktion durchgeführt. |
| IndexedDB | `onblocked`, `onversionchange` und dedizierter `transaction.onabort` fehlen; keine globalen Storage-Deadlines. | Upgrade mit offenen Tabs, Quota, abort ohne Requestfehler, privates Profil und Storage-Deaktivierung. Noch kein konkret ausgelöster Quota-/Abortfehler. |
| TTL / eingefrorene Tabs | Save/Copy prüfen TTL nicht selbst; Löschung beruht auf Timer und Starts. Löschen während Export wird verzögert. | Suspend/Resume, Hintergrunddrosselung, Systemuhrsprünge, Export über TTL hinweg, Cleanupfehler und Wiederholung. |
| Browser-/OS-Matrix | Firefox mindestens 142; Chrome ohne erklärte Mindestversion. Landing/llms nennen weitere Chromium-Browser und mehrere Betriebssysteme. | Current Stable Chrome/Firefox, erklärte Mindestversion bzw. ESR-Entscheidung, Edge/Brave/Vivaldi, macOS/Linux/ChromeOS nach tatsächlichem Supportumfang. Emuliertes DPR ist kein physisches Multi-Monitor-Testresultat. |
| Interne Wurzeln | Kein Shadow-DOM-Traversal, kein beliebiger Root-Picker; Transform-/Zoom-Geometrie wird nicht normalisiert. | Open/Closed Shadow DOM, iframe, skaliertes oder teilweise überdecktes Element, RTL, CSS zoom, nested scroller. |
| Seitenwiederherstellung | Sichtbarkeit und Styles werden als Snapshot zurückgeschrieben; Änderungen der Seite während Capture können überschrieben werden. | Sticky/Floating-Elemente dynamisch hinzufügen/entfernen, Body-Ersetzung, Scroll-Restore ungleich null, vorhandene Klassen/Attribute. |
| Editor-Grenzwerte | 5000 Annotationen/2000 Punkte; maximale Collectiongröße wird nicht bei jeder History-Operation begrenzt. | 5001. Annotation, 10.000-Zeichen-Text, lange Pen-Geste, Koordinaten außerhalb des Bildes, fehlerhaftes PNG und `image.onerror`. |
| Social Preview / Hosting | OG verweist nur auf SVG; keine hier nachgewiesene Vorschau in den Zielplattformen. `_headers` wirkt nur bei passendem Host; `frame-ancestors` im Meta-Tag genügt nicht als Headerbeleg. | Raster-Social-Card und echte Share-Preview prüfen; CSP, MIME, nosniff, HSTS, Cache und 404 auf dem tatsächlich eingesetzten Hosting testen. |

Chrome dokumentiert das automatische Schließen von Action-Popups bei Fokus außerhalb des Popups. Eine dauerhafte Capture-Ansicht wäre eine Produkt-/Architekturentscheidung, keine Notwendigkeit für einen Relayserver oder breite Hostrechte. [Chrome: Add a popup](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)

## 4. Features: was fehlt und was vor Release wirklich nötig ist

Die vorhandene Basis ist für ein fokussiertes Screenshotprodukt bereits umfangreich: vertikaler Page-/Internal-Capture, Copy/Download, Crop, Pen, Highlight, Formen, Pfeile, Text, Marker, Schwärzung, Effekte, Auswahl/Bewegen, Undo/Redo, Zoom/Pan und lokale Drafts. Zusätzliche Werkzeuge lösen die aktuellen Zuverlässigkeitsprobleme nicht.

| Feature / Verbesserung | Empfehlung | Begründung |
| --- | --- | --- |
| **Capture → Editor ohne vorherige Ausgabe** | Vor Release sehr sinnvoll | Derzeit Copy/Download des Originals **vor** `openEditorForCapture()`. Wer zuerst schwärzen will, erzeugt trotzdem eine ungeschwärzte Datei oder Clipboardkopie. Eigenständiger „Capture & edit“-Pfad. |
| **Capture-Vorschau und Wiederholen der Ausgabe** | Vor Release sinnvoll | Nach erfolgreichem Copy/Save geht der Popupzustand verloren; komfortabler Wechsel zu Save/Edit ohne erneuten Capture fehlt. Flüchtige Vorschau ist mit Local-only vereinbar. |
| **Ergebniswarnungen im Editor erhalten** | Vor Release | Growth-Warnung liegt nur in `result.warning`; Handoff speichert sie nicht, Popupstatus wird überschrieben. Nutzer muss unvollständige Aufnahme vor Teilen erkennen. |
| **Sichtbarer Schutzstatus bei Redaction** | Vor Release | Sicherer Export, Hinweis zum unveränderten lokalen Original, tatsächliche Filtervorschau und klare Unterscheidung zu kosmetischen Effekten. |
| **Interner Bereich auswählbar** | Nächste Ausbaustufe; Kandidatenbug vorher | Verhindert falsche Wahl auf Dashboards/Chat-/Mailoberflächen. Automatische Auswahl allein ist begrenzt. |
| **Sichtbaren Bereich / rechteckige Region aufnehmen** | Nächste Ausbaustufe | Vermeidet langes Full-page-Stitching für kleine Aufgaben; passt zum Einzelzweck. |
| **Bessere Fehlerhilfe** | Vor Release | Geschützte Seite, Datei-URL, zu großes Canvas, falscher Scrollbereich, Clipboard verweigert, Popup geschlossen: kurze konkrete Handlungsanweisung. Support-/Privacy-Link im Popup/Editor. |
| **Resize-Handles, Duplizieren, Ebenenreihenfolge** | Nach Stabilisierung | Vorhandene Annotationen lassen sich bewegen, aber Formen nicht komfortabel nachträglich skalieren; echte Effektreihenfolge hängt daran. |
| **Mehrfachauswahl / Tastaturnachbearbeitung** | Nach Stabilisierung | Nützlich für produktive Annotationen, aber keine Voraussetzung für den ersten Store-Release. |
| **Deutsch + Englisch** | Optional vor Release | UI ist hart codiert englisch; `_locales/en` ist keine vollständige UI-Lokalisierung. Deutsche Storekopie darf keine deutsche UI suggerieren. |
| **JPEG/WebP/PDF, horizontales Stitching** | Später | PNG deckt den Kernzweck ab. Zusätzliche Encoder/Mehrseitenlogik erhöhen Test-/Memoryfläche. Horizontales Abschneiden muss schon jetzt kommuniziert werden. |
| **Große Seiten als mehrere PNGs / optionales Downscale** | Später, bewusstes UX-Design | Aktuell ehrliche Größenablehnung besser als stilles Verkleinern. Vorschau der Auswirkungen nötig. |
| **Capture läuft unabhängig vom Popup** | Bewusste nächste Architekturentscheidung | Verbessert lange Captures; Rechte, Fensterkontext, Lifecycle und Abbruch müssen weiterhin eng kontrolliert bleiben. |
| **Cloudsharing, Accounts, Telemetrie, Screenshot-History** | Für diesen Release nicht empfohlen | Kein belegter Bedarf aus diesem Audit; würde die einfache lokale Privacy-Aussage und den Store-Prüfumfang verändern. |

## 5. Store-Readiness

### Chrome Web Store

- Bestehende Permissions `activeTab`, `scripting`, `storage` und optionales `clipboardWrite` passen zum engen Funktionsumfang. Kein Anlass für `<all_urls>` oder `tabs` im Release aufgrund des Testharness.
- Name, Beschreibung, Icon, drei Screenshots und Promo-Dateien liegen vor. Optische Qualität und aktuelle UI-Version neu abnehmen, nachdem Fehler behoben sind.
- Single-purpose-Text konkret: benutzerinitiierte Webseiten-Screenshots lokal aufnehmen, bearbeiten und exportieren. Editor ist zugehörige Funktion.
- Dashboard-Privacy, Permission-Begründungen und öffentliche Privacy-Seite konsistent ausfüllen. Website-Inhalt, URL/Title und lokale Speicherung korrekt erklären.
- First-install über echtes Toolbar-Popup mit unverändertem Paket nachweisen: Clipboard zunächst ungewährt, anschließend gewährt, verweigert und später widerrufen; Capture & Copy **und** Copy edited.
- Store-URL/ID, Kontoverifikation, Publisherdaten und tatsächlicher Einreichungsstatus bleiben Owner-/Dashboard-Schritte; hier nicht geprüft oder verändert.

### Firefox Add-ons

- Das Manifest enthält eine feste Gecko-ID und `data_collection_permissions.required: ["none"]`. Mozilla sieht die `none`-Deklaration für Add-ons ohne entsprechende Datenübertragung vor; der aktuelle Local-only-Ansatz passt dazu. Neue Erweiterungen müssen das eingebaute System deklarieren. `strict_min_version: "142.0"` liegt oberhalb der Desktop-Einführung ab 140. Die Mindestversion deshalb nicht versehentlich als Android-/ESR-Supportversprechen lesen. [Mozilla: Built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- AMO-Linter bestanden, aber echte Firefox-Capture-/Clipboard-/Editor-Prüfung fehlt. Aktuell scheitert der Harness an der Navigation zur Extension-URL. Das ist weder Beweis einer kaputten Extension noch ausreichender Laufzeitnachweis.
- Firefox-Screenshots mit echtem finalen Build aufnehmen. Desktop-Plattformen nur entsprechend tatsächlich geprüftem Support auswählen.
- Lesbarer HTML/CSS/JS-Build ist für Review günstig. Reviewer-Notizen mit Buildbefehl, unterstützten Capture-Arten, lokalem Testinhalt und Permissionpfad beilegen. Ob ein zusätzliches Source-Paket erforderlich ist, anhand des finalen Pakets und AMO-Formulars beantworten. AMO akzeptiert ZIP/XPI-Pakete und unterscheidet Validierung und Veröffentlichung/Review. [Mozilla: Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

### Landing/Werbung

- Vor Store-Einreichung funktionierende HTTPS-Privacy-/Supportziele und zutreffende Texte verifizieren.
- Für Launch: reale Installationsbuttons, echte Produktscreenshots, klare Desktop-/Browsergrenzen, nachvollziehbare Anleitung, keine Testinstallationssprache im Hauptpfad.
- Privacy-Nutzen ist schon klar sichtbar. Im Hero sollte zusätzlich das konkrete Capture-/Editor-Ergebnis erkennbar sein; die aktuelle Illustration zeigt primär die Marke.
- Dark-Mode-Kontrast und Tablet-Padding korrigieren; Hero-Asset verkleinern. Keine Analytics-/Cookieinfrastruktur allein für Marketingmessung ergänzen.
- `version.json`-Fehler führt aktuell zu `development build`. Für eine Produktionsseite besser robuste letzte veröffentlichte Version bzw. neutrale Ausblendung vorsehen, ohne technische Fehlermeldungen im Hauptpfad.
- Live-Checks getrennt von lokalem Build protokollieren. Gegenwärtig keine verifizierten Responseheader und keine bestätigte Deployment-Version.

## 6. Verbindliche Abnahme vor Veröffentlichung

| Testblock | Konkrete Fälle | Erfolgskriterium |
| --- | --- | --- |
| Redaction | Effekt davor/danach, Teilüberlappung, Text/Marker, Crop, Move, Undo/Redo | Kein Originalpixel in geschützter Fläche des dekodierten PNG; Vorschau konsistent |
| Export-Race | Edit/Crop/Undo während Encoding, Clipboardfallback, wiederholtes Save | Ausgaberevision eindeutig; kein veralteter Cache |
| Scrollziele | normale Seite, interne Wurzel, beides zugleich, mehrere Kandidaten, nonzero Startscroll | Richtiges Ziel; Bildinhalt vollständig; exaktes Restore |
| Capture-Liveness | kein Fortschritt, Sprünge, Shrink/Growth, Snap/Lock, Timeout | Begrenzter Abbruch statt Loop; niemals unmarkiertes Teilbild |
| Positionierte Elemente | Fixed oben/unten/floating, späte Sticky-Überschrift, mehrere Sektionen | Jedes echte Inhaltselement an erwarteter Stelle, keine Wiederholungen/Lücken |
| Lifecycle | Cancel in jedem Await, Popup schließen, Tab/Window wechseln, Navigation/SPA, Resize | Keine Ausgabe nach Abort; keine gemischten Frames; Seite restauriert |
| Speicher | zwei Editoren, Delete/TTL/Reload, Orphan-Draft, Quota, DB-Upgrade | Atomare Regeln, klare Fehler, keine verwaisten sensitiven Daten |
| Clipboard/Download | erstes Grant, Denial, Revoke, Save-Abbruch, wiederholte Ausgabe | Echtes Release-Manifest; vorhersehbarer Fallback ohne unerwartete Datenkopie |
| Browser | Current Stable Chrome und Firefox; Mindestversionen entsprechend Storeangabe | Unveränderte Pakete, realer Toolbar-Einstieg, dokumentierte Browserbuilds |
| Bildgeometrie | DPR 1/1.25/1.5/2, Zoom 80/100/125/150/200%, Scrollbalken, RTL | Pixel-/Seam-Assertions; keine alleinigen Dateiexistenztests |
| Performance | kleine/lange Seiten, dichtes DOM, 100/500/1000 Annotationen, mehrere Editoren | Gemessene Zeit-/Speichergrenzen; keine langen UI-Stalls |
| A11y/Responsive | Keyboard-only, Space/Enter, Select, Fokus, Screenreader, 320–1440px, 200% Zoom | Alle Aktionen erreichbar; sichtbarer Fokus; Kontrast aus echtem CSS |
| Landing live | `/`, Privacy, Legal, Version, Assets, 404, beide Themes, kalter Mobilaufruf | HTTPS/MIME/Header/Links/Version verifiziert; keine Platzhalter im Launchzustand |
| Paket/Release | beide ZIPs, Quellenvergleich, Permissions, Checks am Tag-SHA | Vollständiger Gate-Erfolg vor Publish; dokumentierte Hashes |

Die existierenden Fixtures `fixed-and-sticky.html`, `horizontal-overflow.html`, `scrollbar-layout.html`, `dynamic-height.html` und `lazy-loaded-content.html` sollten automatisiert geprüft werden. Der derzeitige Hauptflow verwendet vor allem `basic-long-page.html`, `internal-scroll-container.html` und `very-tall-page.html`; vorhandene Fixture-Dateien allein sind kein Testnachweis.

## 7. Empfohlene Arbeitsreihenfolge

1. **Daten- und Bildkorrektheit:** A01/A02 mit Pixelregressionen; A03/A04/A05 mit reproduzierbaren Capture-Fixtures. Keine neue Veröffentlichung dieser fehlerhaften Pfade.
2. **Lifecycle und lokale Speicherung:** A06–A12, tabübergreifende Löschregeln, Cancel-Grenzen, Startup-Race, Bildwarnungen im Handoff.
3. **Performance und Bedienbarkeit:** A13, tatsächliche Effektvorschau, Edit-only-Pfad, Eingabe-/Historygrenzen.
4. **Release-Nachweis:** echten Toolbar-/Permissions-Flow und Firefox-Testzugang herstellen; Browser-/Pixelmatrix am finalen Commit; Gate-Verknüpfung und ZIP-Validator härten.
5. **Landing und Store-Paket:** Kontrast/Assets/Layout, konsistente Privacy, aktuelle Dokumentation und echte finale Screenshots; öffentliche URLs prüfen.
6. **Veröffentlichung:** erst vollständig geprüfte neue Versionsartefakte, dann Store-Einreichung und separat Website-Launch mit zugelassenen Storelinks. Keine pauschale Freigabe aus historischen CI-Ergebnissen.

## 8. Reproduzierbarkeit und Nachweise

Aus Repositorywurzel:

```powershell
node docs/audits/2026-09-07/browser-probes.mjs
node docs/audits/2026-09-07/model-probes.mjs
```

Die Browserprobe benötigt vorhandenes `dist/chrome/` und einen durch den bestehenden Harness auffindbaren Chrome-for-Testing-Browser. Sie erzeugt ausschließlich synthetische Captureinhalte in einem separaten Profil. Die Checks bestätigen das **Vorhandensein der beschriebenen Defekte im geprüften Stand**; nach Fixes sind die Erwartungen in echte Regressionstests umzukehren.

- [Browser-Prüfskript](browser-probes.mjs)
- [Browser-Messdaten](browser-results.json)
- [Modell-/Performance-Prüfskript](model-probes.mjs)
- [Modell-/Performance-Messdaten](model-results.json)

Screenshots und erneut erzeugte Messergebnisse liegen standardmäßig unter `.cache/audit-2026-09-07/`. Die JSON-Dateien neben diesem Bericht sind die festgehaltenen Ergebnisse des Auditlaufs; nachträgliches Wiederholen überschreibt diese Kopien nicht. Einzelne Timingwerte hängen vom Gerät und Lauf ab.

Positive Befunde: kleine lesbare Archive; keine Produkt-Runtime-Abhängigkeiten; keine gefundenen Upload-/Telemetry-/Remote-Codepfade; untrusted Titel/URLs über Textausgabe statt HTML-Injection; enge produktive Berechtigungen; getrennte Browsermanifeste; Zufalls-IDs; vorliegende Restore-/Expiry-/Cancel-Grundstruktur; Versionskonsistenz und statische AMO-Prüfung bestanden. Diese Eigenschaften sollen bei den Korrekturen erhalten bleiben.
