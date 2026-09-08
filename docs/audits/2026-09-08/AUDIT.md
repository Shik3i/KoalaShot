# KoalaShot: vollständiger Workflow- und Produktoberflächen-Audit

Historischer Befund vor den Korrekturen für v0.5.0. Die folgenden Nachweise beschreiben den damaligen Stand; Änderungen sind im [Changelog](../../../CHANGELOG.md) dokumentiert.

Stand: 2026-09-08. Geprüft: `main`, Commit `05d50589967ab082d6b6fe31ba24fd2facf0494c`, Quellversion `0.4.0`. Zu Beginn sauberer Worktree. Produktcode unverändert; dieser Ordner enthält Audit, Diagnoseprogramm und Nachweise. Kein Commit, Push, Deployment oder Store-Upload.

**26 Befunde: 3 P1, 21 P2, 2 P3.** P1 betrifft unbemerkten Verlust einer Schwärzung oder unbemerkt falsch zusammengesetzte Captures. Kein P0 nachgewiesen. Browser-Reproduktionen, Quellcodebefunde und Gestaltungsurteile sind unten getrennt. Bestehende grüne Tests decken diese neuen Übergänge nicht ausreichend ab.

## Capture & Copy gegenüber Capture & edit

Ursache: `extension/popup/popup.js:65` kombiniert die Aktion mit einer gespeicherten Zusatzoption:

```js
const config = { target: captureTarget.value, openEditor: openEditor.checked || mode === "edit" };
```

| Aktion | Zusatzoption aus | Zusatzoption an |
| --- | --- | --- |
| `Capture & Copy` | Original aufnehmen → Original kopieren | Original aufnehmen → Original kopieren → Editor öffnen |
| `Save PNG` | Neu aufnehmen → Original herunterladen | Neu aufnehmen → Original herunterladen → Editor öffnen |
| `Capture & edit` | Neu aufnehmen → Editor öffnen | Identischer Ablauf |
| `Copy captured PNG` | Vorhandenes Original kopieren | Identischer Ablauf; Option wird ignoriert |
| `Save captured PNG` | Vorhandenes Original herunterladen | Identischer Ablauf; Option wird ignoriert |
| `Edit captured PNG` | Neues Editor-Dokument aus Original anlegen | Identischer Ablauf |

Der Default ist `false`, aber ein früher gespeichertes `true` bleibt wirksam. Der konkrete Wert im persönlichen Browserprofil wurde nicht ausgelesen. Die obige Matrix wurde im isolierten Browser reproduziert. Beim Copy-/Save-Handoff liegt das **ungeschwärzte Original bereits im Clipboard bzw. Download**, bevor der Editor geöffnet wird. Eine spätere Schwärzung korrigiert diese frühere Ausgabe nicht.

Empfohlenes Ziel: drei eindeutige Primäraktionen `Capture & edit`, `Capture & copy`, `Capture & save`; keine versteckte zweite Zielaktion. Bestehende Einstellungen bewusst migrieren. Wer einen kombinierten Ablauf behält, braucht eine dynamische Beschriftung einschließlich „original“ und eine sichtbare Erklärung der Reihenfolge. Result-Aktionen strikt vom Start einer neuen Aufnahme unterscheiden.

## Befunde mit Priorität, Reproduktion und Fixrichtung

Nachweisarten: **B** = im aktuellen Chromium reproduziert, **Q** = direkt aus aktuellem Code/Markup abgeleitet, **V** = Laufzeitlayout visuell und/oder geometrisch geprüft. Manipulierte Fehler-/Timingbedingungen stehen ausdrücklich dabei. Die numerischen Messwerte stehen in [results.json](results.json); der schnelle Wiederholungsfall in [burst-results.json](burst-results.json).

### P1: Daten- und Bildkorrektheit

**F05 — Scrollposition zwischen Messung und Screenshot nicht abgesichert. B**

Ort: `extension/popup/capture-controller.js:297`, `:306`, `:313`; `extension/content/capture-page.js:491`.

Die Antwort auf `scroll` liefert eine Position. Danach können Rate-Limit-Wartezeit und die asynchrone Screenshot-API verstreichen. Die anschließende Prüfung vergleicht Tab/URL; `ping` prüft keine Geometrie. Die Aufnahme wird weiterhin mit dem alten `scrolled.actualY` eingefügt. Die Probe verschiebt die Seite unmittelbar vor jedem realen `captureVisibleTab` um bis zu 90 CSS-Pixel. Ergebnis: fünf Frames, PNG `1262 × 3000`, `outcome: resolved`, `warning: ""`. Es wird keine andere Website aufgenommen; nachgewiesen ist die fehlende Erkennung einer Positionsänderung innerhalb derselben Seite.

Fix: aktive Session und Messwerte vor/nach der Screenshot-API validieren, einschließlich X/Y, Viewport und Capture-Rect. Bei Abweichung Frame verwerfen und kontrolliert neu aufnehmen oder abbrechen. Kein bloßes `pong`. Abnahme: injizierte Scroll-/Resize-/SPA-Änderung zwischen Messung und Screenshot darf kein stillschweigend erfolgreiches PNG erzeugen. Beliebige DOM-Mutationen werden dadurch allein noch nicht atomar eingefroren.

**F06 — Watchdog räumt die Seite auf; Controller exportiert trotzdem erfolgreich. B**

Ort: `extension/content/capture-page.js:491`, `:503`; `extension/common/constants.js:7`; `extension/popup/capture-controller.js:306`.

Content-Watchdog: 15 Sekunden, kontrolliert alle 2 Sekunden. Screenshot-Timeout: 20 Sekunden. `ping` antwortet auch ohne aktive Session erfolgreich. Probe verzögert die echte Screenshot-Anfrage auf 17,5 Sekunden: `cleanedBeforeScreenshot: true`, trotzdem `outcome: resolved`, keine Warnung. Ein separater gültiger Start → Restore → Ping liefert ebenfalls `ok: true`. Auf Seiten mit Fixed-/Sticky-Elementen oder ursprünglichem Scrolloffset kann so bereits restaurierter Inhalt unter Capture-Annahmen verarbeitet werden.

Fix: Ping an dieselbe lebende Session **und denselben Port** binden; verlorene Session terminal melden. Zeitbudgets/Heartbeat so abstimmen, dass langsame Browseroperationen nicht unbemerkt Cleanup auslösen. Cleanup beim wirklichen Verbindungsverlust erhalten. Abnahme: 14–21 Sekunden Verzögerung, Watchdog, Hintergrunddrosselung und Wiederaufnahme; entweder korrekter Capture oder eindeutiger Abbruch.

**F07 — Zwei Editor-Tabs überschreiben gegenseitig komplette Drafts; Schwärzung geht verloren. B**

Ort: `extension/common/capture-store.js:109`, `:126`; `extension/editor/editor.js:221`, `:1187`.

Zwei Tabs mit derselben `?capture=`-ID öffnen. Tab A fügt Redact hinzu und speichert. Tab B, noch mit altem Stand, fügt Marker hinzu. Persistierter Stand enthält anschließend nur `rectangle`, `marker`; `redact` fehlt. Kein Konflikthinweis. Die Löschbenachrichtigung synchronisiert nur Discard, nicht Revisionen. Nach Neuladen kann der Nutzer seine Schwärzung verlieren. Die offene lokale Ansicht in Tab A ist zunächst weiterhin geschwärzt.

Fix: entweder exklusiver schreibender Editor pro Capture oder transaktionelle Revisionsprüfung mit Konfliktanzeige. Nicht automatisch durch Zusammenmischen von Annotationen lösen; auch Crop, Löschen und Undo brauchen klare Regeln. Abnahme: beide Schreibrichtungen, Reload, Journal-Wiederherstellung, Discard und Export bei Konflikt.

### P2: Funktions-, UX- und Datenschutzkonsistenz

| ID | Befund und aktueller Nachweis | Ort und konkrete Korrektur |
| --- | --- | --- |
| F01 | **Aktionsnamen bilden gespeicherte Seiteneffekte nicht ab. B/Q.** Copy kann Editor öffnen, `Save PNG` startet eine neue Aufnahme, Result-Copy ignoriert dieselbe „after Copy or Save“-Option. Hauptmatrix oben. | `extension/popup/popup.js:65`, `:183`; `extension/popup/popup.html:25`. Eindeutige Capture-Zielaktionen und separate Result-Aktionen; Optionen dürfen ihre Semantik nicht verdeckt ändern. |
| F02 | **Clipboardfehler wird zur Erfolgsmeldung. B.** Fehler durch einen gezielt abgelehnten Clipboard-Write simuliert. Reihenfolge `copy`, `editor`; letzter Status exakt `Editor opened with the original PNG.`. `Copy failed: ...` ist verschwunden. Auch verweigerte Permission landet bei aktiviertem Handoff im Editorstatus. | `extension/popup/popup.js:109`, `:125`. Capture-, Copy-/Save- und Handoff-Ergebnis getrennt halten. Copyfehler sichtbar im Result und ggf. Editor weitergeben; Retry ohne neue Aufnahme. |
| F03 | **Sofortige Folgeaufnahme verletzt die Screenshot-Quote. B.** Ungebremste Aktionsmatrix produzierte `This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.` bei zweiter Copy- und weiterer Save-Aufnahme. | `extension/popup/capture-controller.js:245`, `:298`. `lastCaptureAt` beginnt für jeden Capture erneut bei 0. Startübergreifende Begrenzung und begrenzter Retry für genau diesen Fehler; mehrere Extension-Kontexte berücksichtigen. Nicht pauschal jeden Fehler wiederholen. |
| F04 | **Fehlgeschlagener neuer Capture vernichtet vorheriges verfügbares Result. B/Q.** Gute Aufnahme → interner Capture ohne passenden Root: vorher sichtbare Preview und Result-Aktionen verschwinden trotz Fehler. `lastCapturedResult = null`, Preview-Revoke und Ausblenden erfolgen vor Permission/Injection/Capture; dieselbe Ursache gilt für Cancel/Quota. | `extension/popup/popup.js:66`. Vorheriges Result bis zum erfolgreichen Ersatz behalten; klar als vorherige Aufnahme markieren. Abnahme: gute Aufnahme → fehlgeschlagene Folgeaufnahme → altes Result weiterhin exportierbar. |
| F08 | **Export ignoriert sichtbare, noch nicht angewandte Text-/Crop-Entwürfe. B.** Crop ziehen → Save: weiterhin `800 × 2400`; `Apply crop` bleibt aktiv. Text eingeben → Save: Textdialog bleibt offen, 0 Annotationen, Ausgabe weiß, Status `Edited PNG save started.`. Explizites Apply ist vorhanden, wird vor Export aber nicht eingefordert. | `extension/editor/editor.js:784`, `:814`. Export bei offener Textbearbeitung oder abweichendem Crop blockieren und „Apply/Discard draft“ anbieten; nicht heimlich anwenden. Crop-Rahmen als ausstehend markieren. Relevanz: ausgeblendete Erwartung beim Teilen sensitiver Randbereiche. |
| F09 | **Crop hat einen zweiten Zustand außerhalb von Undo/Redo. B/Q.** Crop A anwenden → Crop B ziehen → Undo: Metadaten wieder `800 × 2400`, Apply/Reset für B weiter aktiv. Zeichnung verwendet `transientCrop || cropSelection || currentCrop()`. Escape räumt `transientCrop` im Pointer-Zweig nicht auf. | `extension/editor/editor.js:409`, `:642`, `:1004`. Pending-Crop beim Undo/Redo, Escape, Toolwechsel und Export explizit auflösen. Abnahme: dieselbe sichtbare Auswahl, Metadaten und Exportdimension nach jedem Übergang. |
| F10 | **Neues Werkzeug bearbeitet optisch das alte Objekt weiter. B.** Rechteck zeichnen → Pen wählen → Rot wählen: bestehendes Rechteck wird rot. Der Kontext heißt Pen, aber `styleTarget` ist die alte Auswahl. Auch Stroke-/Font-Controls können zum falschen Werkzeug passen. | `extension/editor/editor.js:302`, `:331`, `:688`, `:1079`. Neuzeichnen und ausgewähltes Objekt getrennt behandeln; Auswahl beim Wechsel bewusst lösen oder „Selected rectangle“ ausdrücklich zeigen. Neue Tooldefaults nicht gleichzeitig auf alte Annotation anwenden. |
| F11 | **Pan-Pfeiltasten verändern Annotationen. B/Q.** Nach Auswahl → Pan → ArrowRight wird X von `54.159292035398224` auf `55.159292035398224` geändert. Status `Selected annotation moved 1 pixel.`. Ohne Auswahl wechseln Pfeiltasten Annotationen, obwohl Pan-Hilfe Panning verspricht. | `extension/editor/editor.js:979`, `:1026`, `:1040`. Keyboard-Verhalten zuerst nach aktivem Tool unterscheiden. Pan scrollt; Select verschiebt. Abnahme mit/ohne Auswahl und temporärem Space-Pan. |
| F12 | **Shortcuts fallen bei Toolbarfokus aus. B/Q.** `button, select, a` werden wie Texteingabe behandelt. Nach Fokus auf Pen wird `Ctrl+Z` ignoriert, obwohl Undo verfügbar ist. Die vorherige 1px-Verschiebung bleibt unverändert gespeichert; die neue Assertion vergleicht den vollständigen Annotationseintrag. | `extension/editor/editor.js:1002`, `:1018`. Native Space/Enter-Bedienung der Controls schützen, globale Modifiershortcuts aber auf Buttons zulassen. Abnahme mit realem Klick → Ctrl/Cmd+Z, nicht nur Canvasfokus. |
| F13 | **Logo führt in Fehlerzustand. B.** Klick auf `KoalaShot Editor home` entfernt `?capture=...`; Ergebnis exakt `No temporary capture was specified.`. Keine sinnvolle Homeansicht oder Wiederherstellungsaktion. | `extension/editor/editor.html:12`; `extension/editor/editor.js:1216`. Logo ohne Navigation oder echtes Menü mit dokumenterhaltendem Verhalten; Fehleransicht mit konkretem Recoverypfad. |
| F14 | **Ungültiger Draft fällt still auf ungeschwärztes Original zurück. B unter injizierter Storage-Korruption.** Ein gültiger Redact-Eintrag plus ungültiger Text im IndexedDB-Draft → `getCapture()` liefert 0 Annotationen, kein Warning, verfügbares Original. Kein natürlicher Korruptionsauslöser behauptet. | `extension/common/capture-store.js:158`; `extension/editor/editor.js:1226`. Fehlerzustand statt stiller leeren Annotationen; Rohdraft für Recovery behalten, Export erst nach bewusster Entscheidung. Nicht als bereits geschütztes Dokument laden. |
| F15 | **Popup ist schon vor Capture zu hoch; Result vergrößert es weiter. B/V.** Bei 360×600 gemessen: Body 717px, Footerbeginn ca. 636px. Nach Capture 986px, unterer Rand von `Copy captured PNG` ca. 889px. Startaktionen bleiben vollständig stehen, zusätzlich drei vertikal gestapelte Result-Aktionen und Preview. | `extension/popup/popup.css`, `extension/popup/popup.html`. Kompakte Start-/Progress-/Result-Zustände; Sekundärinformationen einklappbar, Result-Aktionen in einer kompakten Gruppe, Footer stabil erreichbar. Im echten Toolbar-Popup abnehmen. |
| F16 | **Desktop-Editor schneidet bei mittleren Breiten Hinweise ab. B/V.** 960×600 und 901×600: Header 97px, Help-Unterkante 631px, Body `overflow: hidden`. Layout reserviert weiterhin `100vh - 66px`. Bei 1000×600 passt es. | `extension/editor/editor.css:39`, `:53`, `:66`. Gesamtes App-Layout als Grid/Flex mit echter Headerhöhe; keine fixe Subtraktion. Regression an beiden Seiten des Umbruchpunkts und bei 200% Browserzoom. |
| F17 | **Schmale Editoransicht versteckt Hauptaktionen in horizontalem Scrollen. B/V.** 390px: Aktionsbereich 353px breit, Inhalt 657px; Save beginnt bei x≈420. Privacyhinweis 591px Inhalt auf 375px. Mehrere separate horizontale Scrollleisten. Vorhandener Test auf `document.scrollWidth` erkennt dies nicht. | `extension/editor/editor.css:133`, `:149`. Copy/Save jederzeit sichtbar, Zoom/sekundäre Aktionen in Menü, gruppierte Werkzeuge, umbrochene Hinweise statt horizontalem Textscrollen. |
| F18 | **Cancel wird auch angezeigt, wenn er nichts abbrechen kann. Q.** `setBusy(true)` blendet Cancel auch bei `Edit captured PNG` und `Copy captured PNG` ein. Dort existiert kein `activeController`; Listener macht nichts. Bei ursprünglichem Capture bleibt er auch nach Fertigstellung während Ausgabe/Handoff sichtbar. | `extension/popup/popup.js:40`, `:151`, `:186`, `:193`. `capturing`, `exporting`, `opening-editor` getrennt modellieren. Cancel nur für tatsächlich abbrechbare Phase; eindeutiger Text bei bereits erfolgter Ausgabe. |
| F19 | **Settings-Speicherfehler verschwinden. Q.** `createSerializedWriter()` fängt Schreibfehler vollständig ab. UI zeigt geänderte Option, obwohl sie nach Wiederöffnung zurückspringen kann. `storage.onChanged` synchronisiert andere Kontexte nicht. | `extension/common/async-queue.js:7`; `extension/popup/popup.js:152`. Queue nach Fehlern fortsetzen, Fehler aber an UI melden; Option korrigieren oder Retry anbieten. Verweigerten `storage.local.set` als Negativtest hinzufügen. |
| F20 | **Öffentliche Privacy-Erklärung beschreibt den Speichertrigger unvollständig. Q.** „If you enable Open editor after capture“: Tatsächlich speichern auch `Capture & edit` und `Edit captured PNG` ohne aktivierte Option das Original in IndexedDB. Dauerhafte lokale Capture-Settings werden dort nicht ausdrücklich erklärt. | `landing/privacy/index.html:22`; `extension/common/settings.js`. Alle Editor-Einstiege, Settings und Löschverhalten klar benennen; Privacy-Kontakt direkt auf der Seite statt nur über Legal. Extension und Website-Hosting getrennt beschreiben; keine erfundenen Hosting-/Log-Zusagen. |
| F21 | **Legal fehlt in Popup und Editor. Q/B.** Beide bieten Privacy/Help. Landing bietet lokale `/legal/`-Seite mit zentralem `https://koalastuff.net/imprint`. Der direkte Extensionpfad fehlt. | `extension/popup/popup.html:54`; `extension/editor/editor.html:88`; `landing/legal/index.html:19`. Einheitliche sichtbare Links für Privacy, Legal und Support; kanonisches Ziel `/imprint` verwenden, nicht ungeprüft `/legal` auf der Zentraldomain. |
| F22 | **Kein Bewertungsflow in der Extension; Store-Konfiguration nur auf Landing. Q/B.** Keine Chrome-/Firefox-Reviewlinks in Popup/Editor. `landing/version.json` enthält zweimal `null`; Landingbuttons sind verborgen. | `landing/version.json:3`; `landing/main.js:17`. Gemeinsame buildzeitige Store-/Reviewkonfiguration, browserspezifischer Footerlink. Erst echte KoalaShot-Listings verifizieren. Keine IDs von KoalaSync übernehmen. Unaufdringlicher permanenter Link, keine blockierende Bewertungsaufforderung. |
| F23 | **Landing lehrt weiter Copy/Save vor Edit. Q/V.** Nummerierte Karten: 1 Capture, 2 Copy or save, 3 Edit locally. Dritte Karte erklärt zwar Capture & edit vor Ausgabe, aber die visuelle Reihenfolge bleibt widersprüchlich. „The original capture stays available for your next step“ verschweigt den flüchtigen Popupzustand. | `landing/index.html:42`. Reihenfolge Capture → optional bearbeiten/schwärzen → Copy/Save; alternativen direkten Export als klaren Kurzweg darstellen. Verfügbarkeit zeitlich korrekt erklären. |
| F26 | **Werkzeugregler ohne Wirkung auf das fertige Bild. Q.** Marker zeigt `Width`, der Renderer zeichnet aber nur gefüllten Kreis mit festem Radius und Zahl; `strokeWidth` wird dort nicht verwendet. Blur/Pixelate bieten Farbe, der echte Effekt-Compositor ignoriert diese Farbe. Änderungen können trotzdem History/Draft verändern. | `extension/editor/editor.js:300`; `extension/editor/geometry.js:233`; `extension/editor/editor-export.js:66`. Nur wirksame Controls anzeigen: Markergröße/Radius, optionale Kontur tatsächlich rendern; Blur-/Pixelate-Stärke statt wirkungsloser Farbe. Je Control eine sichtbare Preview-/Exportänderung abnehmen. |

### P3: Präsentation und Veröffentlichungszustände

| ID | Befund | Konkrete Verbesserung |
| --- | --- | --- |
| F24 | **Footer ist zusammengesetzt, nicht als gemeinsame Produktnavigation gestaltet. V/Q.** Popup: eigener Privacyfooter plus separates Help-Paragraph. Editor: Datenschutz, externe Links und sehr langer Tastaturtext unter Status. Landing: kleiner Copyright-/Versionsblock und drei Links, kein Support-/Bewertungsangebot. Desktopabstände vor FAQ/Footer sind groß; mobil wirkt die Navigation isoliert. | Ein ruhiger Produktfooter mit Brand/Version, einer kurzen Privacyaussage und stabiler Linkgruppe. Privacy · Legal · Help · Rate KoalaShot. Tastaturhilfe in aufklappbare Hilfe; Einschränkungen und Capturewarnungen nahe der Handlung behalten. Landing mit Produkt/Support/Legal-Gruppen und echten Storelinks im Veröffentlichungszustand. |
| F25 | **Storestatus wird beim späteren Launch inkonsistent. Q.** Sobald ein Store-Link sichtbar wird, verschwindet der gemeinsame Pendingblock für beide Browser. Die FAQ bleibt fest „Store publishing is planned for a later phase.“ | Verfügbarkeit pro Browser rendern; FAQ aus demselben Zustand ableiten. Version-Metadatenfehler darf nicht alle Installationslinks unbemerkt entfernen. Lokaler Fallback mit bekannten, geprüften Buildwerten. |

## Abdeckung sämtlicher vorhandener Workflowfamilien

„Geprüft“ bedeutet keine Behauptung, jede mögliche Drittwebsite und jede Browser-/OS-Kombination erschöpft zu haben. Hier sind alle Produktpfade berücksichtigt, mit tatsächlicher Laufzeitabdeckung und verbleibenden Grenzen.

| Workflowfamilie | Aktueller Nachweis / Befund |
| --- | --- |
| Start, Defaults, persistierte Optionen, Wiederöffnung | Defaults und Normalisierung im Unitgate; Startup-Deaktivierung geprüft; Aktionsmatrix B; Schreibfehler Q, F19. Persönliches Browserprofil nicht inspiziert. |
| Capture & edit / Copy / Save, beide Zusatzoptionen | Sechs Browserfälle einschließlich Copyfehler. F01/F02/F03. Reale Capture-API; Clipboard/Tab/Download bei der neuen Matrix gezielt instrumentiert. Echte Exporte zusätzlich im bestehenden Browserflow. |
| Wiederverwendung Copy/Save/Edit, neue Aufnahme | Implementierung komplett verfolgt; F04/F18. Flüchtiger Popupzustand und neuer Editor-Datensatz pro Handoff klar identifiziert. |
| Normales Page-Capture, internes Capture | Erfolgs-/Fehlerfälle in Chrome/Firefox-Matrix. Page+interner Root im Regressionstest. Transformierte interne Fläche in neuer Probe korrekt abgelehnt. Automatische Auswahl hat keinen manuellen Picker. |
| Fixed/Sticky, horizontales Overflow, Scrollbarlayout | Alle drei vorhandenen Fixtures aktuell aufgenommen und restauriert. Horizontaler Schnitt korrekt gewarnt. Diese zusätzlichen Fixtures prüfen Abschluss/Dimension/Restore, nicht jedes semantische Bildelement. Pixelstreifen separat im Regressionstest. |
| Dynamische Höhe, Lazy Content, zu große Seite | Beide dynamischen Fixtures aktuell erfolgreich ohne Warning; Too-large in bestehender Matrix; Stall/Shrink/Growth im Unit-/Regressiongate. Lazy-Fixture lädt synchron bei Intersection, kein Nachweis für langsam geladene Bilder/Fonts oder virtuelle Feeds. |
| Cancel, Popup-/Portverlust, Navigation, Tabwechsel | Bestehende Lifecycle- und Browserfälle; Cleanup nach Cancel/Navigation. Neue Postmeasurement-/Watchdog-Proben F05/F06. Echter Toolbar-Fokusverlust mit unverändertem Manifest bleibt separat offen. |
| Clipboard initial erlaubt/verweigert, Edit-Copy, Fallback | Chrome/Firefox-Erfolgs- und Denialflow aktuell grün. Copyfehler-Handoff F02. Revoke über echte Browsereinstellungen, OS-Clipboardmanager und Save-Dialog-Abbruch nicht als getestet ausgegeben. |
| Editor-Start, ungültige/fehlende ID, defektes Bild | Fehlende ID tatsächlich via Logo reproduziert. ID-/Blob-/Decode-/Expiry-Code gelesen. Korrupten Draft injiziert F14. Kein natürlicher Blob-Korruptionsfall behauptet. |
| Alle 11 Annotationstypen | Pen, Highlighter, Arrow, Line, Rectangle, Ellipse, Text, Redact, Pixelate, Blur, Marker: Modell, Geometrie, Style, Render und Export gelesen; Unitgate deckt Modelle/Primitiven. Bestehender Browserflow zeichnet Rectangle/Redact/Ellipse/Pixelate/Blur/Marker/Text sowie Tastaturannotation. Keine Behauptung einer separaten manuellen Pointer-Abnahme jedes Werkzeugs auf jedem OS. |
| Auswahl, Bewegen, Styles, Delete, Clear | Bestehende Modell-/Browsertests plus neue Werkzeugwechsel-/Panproben. F10/F11. Auswahl bei 5000 Annotationen im bestehenden Regressionstest. |
| Text erstellen/ändern/abbrechen | Bestehender Browserflow bestätigt angewandten Text; neue Probe für sichtbaren, nicht angewandten Text F08. Dialog ist kein modaler Exportguard. |
| Crop anwenden/resetten, Undo/Redo, Escape | Bestehendes Crop-/Exportgate plus F08/F09. Integer-/Randpixel-Redaction im Regressionstest. Unangewandter Crop gehört bislang nicht zum gespeicherten Draft. |
| Zoom, Fit, Actual size, Pan, Wheel, Keyboard | Geometrie-Unitgate, Chrome-DPR-2, schmale Browseransichten. F11/F12/F16/F17. Fit ist ein Einmalbefehl; Resize hält keinen deklarativen Fitmodus. Physische Multi-Monitor-/OS-Skalierung offen. |
| Copy edited / Save edited, Redaction, Cache | Bestehende Export-Race-/Pixeltests aktuell grün. Sicherer Redact-Endpass über Effekten erhalten. Aktiver Text/Crop fehlt im Exportsnapshot F08. |
| Draftautosave, Reload, mehrere Tabs, Löschung/TTL | Bestehendes Reload-/Discard-/Expiry-/Orphan-Gate; neue Mehrtab- und Korruptionsproben F07/F14. Quota, Schlaf/Wiederaufnahme, Journallimit und schneller Tababschluss während zweier Writes bleiben gezielte Zusatzfälle. |
| Privacy, Legal, externe Hilfe, Website | Alle drei Landingseiten, Manifeste, Netzwerkpfade und Storetexte gelesen; lokale Footer hell/dunkel in 1440/390px gerendert. F20–F25. Livehosting nicht bestätigt, Details unten. |
| Build, Paketinhalt, Abhängigkeiten, CI-/Releasevertrag | `npm test` aktuell grün einschließlich npm audit und lokalem AMO-Linter; Quellen-/ZIP-Abgleich und 8 negative Pakettests. Workflowdefinitionen gelesen. Kein aktueller Remote-CI-/Release-/Storestatus behauptet. |

## Privacy und Legal: tatsächlicher Stand

Positive technische Befunde: keine gefundenen Upload-, Telemetrie-, Account-, Remote-Code- oder Clipboard-Lesepfade im Produkt. Enge produktive Berechtigungen `activeTab`, `scripting`, `storage`; optional `clipboardWrite`. Kein `<all_urls>` im Release. Metadaten werden als Text ausgegeben, neue Captures speichern Source-Origin statt URL-Pfad/Query/Fragment. Screenshot-Blobs und Drafts sind getrennt. Draftwrites prüfen einen lebenden Parent im selben IndexedDB-Write. Redact bleibt der letzte opaque Compositing-Pass; aktuelle Pixelregressionen bestehen.

Die Privacy-Seite erklärt 24h-Unverfügbarkeit und spätere physische Löschung beim nächsten Start bereits differenziert. Auch Clipboard-/Download-Ausnahmen und das unveränderte Original werden genannt. Keine neue Behauptung, dass nach 24 Stunden bei geschlossenem Browser physisch alles gelöscht sei. Problematisch sind der unvollständige Speichertrigger F20 und die Workflow-/Draftfehler F01/F07/F08/F14.

Die Landing verlinkt lokal `legal/`; diese Seite nennt `https://koalastuff.net/imprint`. Die [zentrale Imprint-Seite](https://koalastuff.net/imprint) war über die Webabfrage mit Betreiber-/Kontaktinhalt lesbar. Das ist Inhaltsnachweis, kein frischer Responseheaderbeleg. `https://koalastuff.net/legal` war dort nicht erfolgreich abrufbar. Keine Grundlage, es als kanonisches Ziel einzubauen oder als sicher 404 zu deklarieren.

Direkte GET-Prüfungen auf Zentraldomain `/legal`, `/imprint` und KoalaShot `/`, `/privacy/`, `/legal/`, `/version.json` scheiterten nach Freigabe des Netzwerkzugriffs jeweils mit `The request was canceled due to the configured HttpClient.Timeout of 15 seconds elapsing.`. Innerhalb der Sandbox zuvor Socket-Zugriffsfehler. Deshalb **keine bestätigte Liveerreichbarkeit, keine verifizierten Hostingheader, keine behauptete öffentliche Störung**. `landing/_headers` ist nur die lokale Hostingkonfiguration. Die öffentliche Privacy-Erreichbarkeit bleibt ein konkreter Abnahmepunkt. Dieser Audit bewertet Verlinkung und technische Datenflüsse, nicht abschließend die rechtliche Einordnung des Betreibers.

KoalaSync-Vergleich aktuell aus lokalem Code: `extension/popup.html:1879` enthält `settingsReviewLink` mit `★ Rate us`; `extension/shared/constants.js:23` wählt browserspezifische `/reviews`-URLs. Dieses Muster passt auch hier. KoalaShot braucht dafür seine eigenen verifizierten Listing-URLs. Websuche fand keine bestätigten KoalaShot-Listings; das beweist nicht deren Nichtexistenz. Die `null`-Konfiguration beweist nur fehlende Integration im Checkout.

## Konkretes UI-/UX-Zielbild

1. **Popup:** ein kompakter Startbereich mit drei klaren Zielen. Capture area mit verständlicher Beschreibung; sekundäre Optionen unter Settings. Während Aufnahme Fortschritt + echter Cancel. Nach Aufnahme Resultkarte mit Thumbnail, Pixelmaßen und dauerhaft sichtbarer Vollständigkeitswarnung; `Copy original`, `Save original`, `Edit`. `Capture again` als eigenständige sekundäre Aktion. Vorheriges Result bei Fehlversuch erhalten.
2. **Editor:** Bild nimmt den verfügbaren Platz ein. `Copy edited` und `Save edited PNG` bleiben sichtbar. Zoom-/View-Aktionen in kompakter Gruppe; sekundäre Aktionen in Menü. Werkzeuge sinnvoll gruppieren: Select/Pan, Zeichnen, Text/Marker, Privacy, Crop. Konsistente eigene Icons statt teils identischer Unicodezeichen/OS-Emoji. Aktives Tool und bearbeitetes Objekt getrennt benennen.
3. **Dokumentstatus:** „Draft saved locally“, „Unsaved draft“, „Changed in another tab“ und „Expired/deleted“ unterscheiden. Ausstehendes Apply vor Export auflösen. Countdown/Retentionhinweis unaufdringlich; Recovery bei Draftfehlern. Close and discard klar von normalem Tab-Schließen unterscheiden.
4. **Footer:** stabile Zeile oder klarer zweizeiliger Bereich mit KoalaShot/Version, kurzer Local-only-Aussage und Privacy/Legal/Help/Rate. Lange Tastaturhilfe hinter `Keyboard shortcuts`. Links mit sichtbarem Fokus und angemessenen Klickflächen. Keine neue Telemetrie für Bewertungsaufforderungen.
5. **Landing:** Capture → Edit → Export korrekt zeigen, echte Produktscreenshots in den Hauptpfad, kürzere wiederholte Privacytexte. Browserweise Installations-/Reviewzustände aus derselben Konfiguration. Footer als Produktnavigation gestalten; gleichbleibende Struktur auf Home/Privacy/Legal.

## Feature- und QoL-Backlog

| Reihenfolge | Verbesserung | Nutzen / Abgrenzung |
| --- | --- | --- |
| Zuerst | F05/F06/F07, anschließend F01/F02/F08–F19 | Zuverlässige Bilder, Drafts und vorhersehbare Bedienung vor weiteren Werkzeugen. |
| Hoher QoL-Nutzen | Annotations-Resize-Handles; Text direkt nachbearbeiten; Duplizieren; konsistente Shortcuts | Verkürzt häufige Korrekturen. Formresizing ist heute nicht vorhanden. |
| Hoher QoL-Nutzen | Visible viewport / frei gewählte Region | Kleine Aufgaben ohne unnötiges Full-page-Stitching; enger lokaler Produktzweck bleibt erhalten. |
| Hoher QoL-Nutzen | Interner Scrollbereich mit Auswahl/Highlight und Vorschau | Mehrere Kandidaten werden bewusst auswählbar; keine stille automatische Wahl auf Dashboards/Chats. |
| Hoher QoL-Nutzen | Dateiname vor Export, Dimensionen/Dateigröße, Warnungsbadge | Verhindert Verwechslung von Original/Edited und unbemerktem Teilcapture. |
| Mittelfristig | Optional robuster Capture-Controller außerhalb des flüchtigen Popups | Lange Captures überstehen versehentliches Wegklicken. Architekturentscheidung mit engem Tab-/Fensterbezug; nicht einfach breite Hostrechte ergänzen. |
| Mittelfristig | Deutsch/Englisch vollständig, persistente Tooldefaults und echte Fit-Ansicht | Konsistenz mit deutschem Publikum; `_locales/en` allein lokalisiert die hart codierte UI nicht. |
| Mittelfristig | Mehrfachauswahl, Ausrichten, Ebenen, Marker-Neunummerierung | Produktiver Editor bei mehreren Annotationen; Redact-Endmaske unabhängig von Ebenen erhalten. |
| Später | Mehrteilige PNGs, bewusstes Downscale, JPEG/WebP/PDF, horizontales Stitching | Für sehr große Seiten; Auswirkungen vor Export zeigen und Speicher-/Geometriegates erweitern. |

Nicht als notwendige Verbesserung abgeleitet: Accounts, Cloudsharing, Telemetrie oder automatisch gespeicherte Screenshot-History. Dafür liegt aus diesem Audit kein Bedarf vor.

## Tests, Grenzen und Nachweise

| Prüfung | Aktuelles Ergebnis |
| --- | --- |
| `npm test` | Bestanden: 40/40 Unit-Tests, ESLint, Dokumentationsaudit, 0 npm-Vulnerabilities, Build, Source-/ZIP-Abgleich, 8/8 Paket-Negativtests, AMO 0 errors / 0 notices / 0 warnings. Erster Sandboxversuch am npm-Endpunkt gescheitert; freigegebener Lauf erfolgreich. |
| `npm run test:browser:matrix` | Chrome Erfolg und Denial bestanden, Chrome/153.0.8010.12. Firefox innerhalb Sandbox: `Firefox BiDi endpoint timed out; last value: false`. |
| `npm run test:browser:firefox` außerhalb Sandbox | Erfolg und Denial bestanden, Firefox 155.0.1. Ausschließlich separates temporäres Testprofil. |
| `npm run test:regressions` | Bestanden: bestehende Capture-/Export-/Redaction-/Storage-/Layout-Assertions einschließlich 24 dekodierter PNG-Farbstreifen. |
| Neue Workflowproben | Alle Diagnosefälle durchgelaufen. Assertions dokumentieren ausgewählte **vorhandene Defekte**, keine Produktabnahme. Zum Fix in erwartete korrekte Regressionen überführen. |
| Visuelle Kontrolle | Popup 360×600 vor/nach Capture; Editor Desktop/390px; Landingfooter hell/dunkel bei 1440/390px; zusätzliche Editor-Geometrie 1120/1000/960/901px. |

Alle Browsertests laufen headless in isolierten Profilen; der bestehende Harness ergänzt Testrechte `tabs`/`<all_urls>` und je nach Flow Clipboardrechte. Firefox verwendet den bestehenden Testbootstrap und synthetische Editorpointer; kein echtes Toolbar-/activeTab-Grant und keine unveränderte Installationsabnahme bewiesen. Chromium-DPR-2 ist Emulation. Neue Timing-, Clipboard- und Korruptionsproben injizieren Bedingungen ausdrücklich; sie greifen nicht auf persönliche Captures zu. Nur die vom Harness gestarteten Testprozesse wurden über dessen regulären Teardown beendet.

Weitere begrenzte, offene Fälle: reale Toolbar-Permissionprompts und Klick außerhalb; OS-Speicherdialog/Clipboard-Revoke; langsame Bilder/Fonts, Video/Canvas/JS-Animation, virtuelle Listen, dynamisch neu eingefügte Sticky-/Fixed-Elemente; DOM-Ersetzung und Styleänderungen während Restore; überdeckte, RTL-/Shadow-DOM-/iframe-Scrollroots; Low-memory und viele Editor-Tabs; Storage-Quota, Systemuhrsprünge und eingefrorene Tabs; Touch/Pen/Multi-Pointer, Screenreader, Firefox-Minimalversion/ESR und andere Betriebssysteme. Quellcodeprüfung dieser Flächen ersetzt keinen passenden Laufzeittest. Beispielsweise ist der Transform-Fall inzwischen korrekt abgelehnt und wird hier **nicht** als neuer Defekt aufgelistet.

Reproduktion aus Repositorywurzel:

```powershell
npm run build
node docs/audits/2026-09-08/workflow-probes.mjs
```

Ausgabe standardmäßig `.cache/audit-2026-09-08/`. Für den schnellen Folgecapture-Fall:

```powershell
$env:KOALASHOT_AUDIT_BURST = '1'
node docs/audits/2026-09-08/workflow-probes.mjs
Remove-Item Env:KOALASHOT_AUDIT_BURST
```

Der Burstlauf darf wegen der bewusst ungepufferten Browserquote schon an einer Aktionsassertion scheitern. Zwischenfälle stehen im sukzessiv geschriebenen JSON. Alle Browser-/Timingwerte sind Laufwerte, keine plattformunabhängigen Benchmarks.

- [Diagnoseprogramm](workflow-probes.mjs)
- [Neue Browserergebnisse](results.json)
- [Schnelle Folgecaptures](burst-results.json)
- [Vollständiges lokales Gate](verification.txt)
- [Chrome-Matrix und erster Firefox-Startversuch](browser-matrix.txt)
- [Erfolgreicher Firefoxlauf](firefox.txt)
- [Bestehende Regressionen](regressions.txt)
- [Popup vor Capture](popup-ready.png)
- [Popup nach Capture](popup-result.png)
- [Editor schmal](editor-390.png)
- [Landingfooter Desktop hell](landing-footer-1440-light.png)
- [Landingfooter mobil dunkel](landing-footer-390-dark.png)

Abnahme für eine spätere Umsetzung: Fixes der bestätigten P1-Fälle und zielgerichtete neue Regressionen; eindeutige Aktions-/Exportzustände; komplette Layoutabnahme einschließlich Toolbar-Popup; korrekte Privacy-/Legal-/Reviewintegration; anschließend vollständiges Gate und unveränderte Browserpakete testen. Öffentliche URLs und echte Storeziele separat live bestätigen. Die aktuelle Quellenprüfung und lokale Builds belegen keine Veröffentlichung.
