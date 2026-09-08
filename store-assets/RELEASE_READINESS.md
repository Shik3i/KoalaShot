# Übergabe für Deployment — v0.5.3

## Vorbereitet

Dieses Paket enthält das neue Kamera-Icon, die überarbeiteten Datenschutz- und Store-Texte, fünf echte Produktmotive je Browser, Store-Icons, Promo-Grafiken sowie reproduzierbare Bildquellen. Alle Versionsangaben und Screenshots gehören zu v0.5.3.

Die Extension verarbeitet Screenshots lokal. Kein Screenshot-Upload, Konto, Tracking, Analytics, Telemetrie oder Remote-Code-Service. Bildinhalte, temporäre Herkunftsangaben und Editor-Entwürfe werden auf dem Gerät für die angeforderte Aufnahme verwendet. Die Datenschutztexte erklären Originale, 24-Stunden-Ablauf, tatsächliche Löschung, Clipboard/Downloads, Redact und Chrome Limited Use.

Commit, Push, PR, CI, Tag, GitHub-Release und lokaler Neubau sind Aufgaben des Coding-Agenten. Den verbindlichen Publikationsstatus und die Prüfungen zeigt [GitHub v0.5.3](https://github.com/Shik3i/KoalaShot/releases/tag/v0.5.3). Bestehende Tags werden nicht ersetzt.

## Deployment durch den Eigentümer

Die Website ist laut Eigentümer noch nicht eingerichtet. Die frühere TLS-Antwort ist kein nachgewiesener Defekt einer bestehenden Website und kein Blocker für den GitHub-Release. Website bereitstellen und Extension in die Stores hochladen macht ausschließlich der Eigentümer.

1. Die statische Website aus dem geprüften v0.5.3-Landing-Archiv bereitstellen und Domain/HTTPS erstmals einrichten. Danach `npm run verify:deployment -- https://shot.koalastuff.net 0.5.3` ausführen. `/privacy/` muss bei der Store-Einreichung öffentlich erreichbar sein.
2. Hostingbezogene Angaben an die tatsächlich eingerichtete Infrastruktur anpassen: Betreiber, Hosting-Dienst, Zugriffslogs und Fristen. Es wurde kein Anbieter und keine Speicherfrist erfunden. Die sieben Tage der zentralen KoalaStuff-Seite wurden nicht ungeprüft übernommen. Die vorhandene zentrale Legal-Verlinkung bleibt erhalten.
3. Das passende Chrome-/Firefox-Archiv v0.5.3 zusammen mit den Unterlagen aus diesem Ordner hochladen. Konto-/Kontaktverifikation und die zutreffende Trader-Einstufung im bestehenden Publisher-Konto prüfen. Diese Account-Zustände wurden nicht eingesehen oder geändert.
4. Nach Store-Freigabe die offiziellen URLs in `landing/version.json` eintragen lassen. Bis dahin ist `null` korrekt; Installations- und Bewertungslinks bleiben ausgeblendet. Ein weiterer Build übernimmt die URLs in Extension und Website.

## Prüfumfang und verbleibende Grenzen

- `npm test`: 50/50 Unit-Tests, ESLint, Dokumentationsprüfung, Abhängigkeitsaudit, Build und vollständige ZIP-Inventarprüfung; acht negative Archivtests und AMO-Linter.
- Chrome-/Firefox-Browser-Matrix: Capture-/Editor-Flows, Clipboard-Erfolg und Berechtigungsablehnung.
- Workflow-Regressionsprüfungen: Ausgabewege, Editor-Konflikte, beschädigte Entwürfe, Recovery und Layouts.
- Website: fünf Routen bei 360/1280 Pixeln, verschachtelte 404-Seite, Store-Zustände und fehlgeschlagene Metadaten.
- Store-Bilder: zehn RGB-PNGs in 1280 × 800, 440 × 280 und 1400 × 560 Promo, transparente 128px-Icons. Die Kurzbeschreibung hat 119 Zeichen und stimmt mit den Manifesten überein.
- Im geprüften Extension-Code ist der einzige Fetch die lokale product.json. Die Resource-Timing-Einträge der aufgenommenen Extension-Seiten enthalten keine externen HTTP(S)-Ressourcen. Das ist kein vollständiger Browser-/OS-Netzwerkmitschnitt.

Die Browser-Harnesses verwenden isolierte Kopien mit erweiterten Testberechtigungen. Echte Toolbar-Aktivierung mit dem Produktionsmanifest, native Clipboard-Dialoge, physische HiDPI-Geräte und Screenreader sind dadurch nicht als manuell bestanden belegt. Siehe [TESTING.md](../docs/TESTING.md). GitHub-CI, Store-Freigabe und Deployment sind getrennte Zustände.
