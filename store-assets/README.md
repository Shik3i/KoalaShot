# KoalaShot — Store-Paket

Alle Texte und Bilder für die manuelle Einreichung an einem Ort, orientiert an KoalaSync/assets/StoreAssets/. Stand: Release-Paket v0.5.3 vom 8. September 2026. Passende Versionen für Extension, Website und Store-Bilder.

## Texte

- [StoreDescription.md](StoreDescription.md): englische Hauptfassung mit Name, Kurzbeschreibung und vollständigem Eintrag.
- [StoreDescription.de.md](StoreDescription.de.md): vorbereitete deutsche Übersetzung; die Produktoberfläche bleibt Englisch.
- [ChromeWebStore.md](ChromeWebStore.md): Feldtexte, Berechtigungen und Datenschutzangaben.
- [FirefoxAddons.md](FirefoxAddons.md): AMO-Angaben und Unterschiede zu Chrome.
- [ReviewerNotes.txt](ReviewerNotes.txt): englische Anleitung für die Store-Prüfung.
- [RELEASE_READINESS.md](RELEASE_READINESS.md): Hindernisse und letzte Schritte.
- [SOURCES.md](SOURCES.md): recherchierte offizielle Vorgaben.

## Bilder

[Bildübersicht öffnen](preview.html). Jedes Vorschaubild verlinkt die PNG-Datei in Originalgröße.

| Ordner / Datei | Inhalt |
| --- | --- |
| chrome/Screen_01.png bis Screen_05.png | Fünf Chrome-Motive, jeweils 1280 × 800 |
| firefox/Screen_01.png bis Screen_05.png | Dieselben Themen mit echten Firefox-Aufnahmen |
| chrome/StoreIcon.png, firefox/StoreIcon.png | 128 × 128, transparent, mit Store-Abstand |
| chrome/SmallAD.png | Pflicht-Promo, 440 × 280 |
| chrome/MarqueePromoTile.png | Optionales Marquee, 1400 × 560 |
| screenshots/ | Originalaufnahmen und Aufnahmeprotokolle |
| source/ | Editierbares HTML/CSS-Layout für Beschriftungen und Promo-Grafiken |
| asset-manifest.json | Versionsstand, Formate und Bildzuordnung |

Reihenfolge: ganze Seite → Kopieren/Speichern → Anmerkungen → Schwärzen → Zuschneiden. Die Popup-Motive sind echte Popup-Seiten, die als Tabs geöffnet und auf ihre gemessene Inhaltsfläche zugeschnitten wurden. Keine Aufnahme des Browser-Toolbar-Menüs. Keine Kundeninhalte; die Beispielseite gehört zum Repository.

Die nummerierten Bilder kombinieren echte Screenshots mit separaten Erklärtexten. Die Produktoberfläche wurde nicht nachgebaut. Promo-Grafiken sind Markenmaterial, kein Funktionsnachweis. Die bisherigen Dateinamen chrome-small-promo-440x280.png und chrome-marquee-1400x560.png enthalten Kopien der neuen Motive.

## Neu erzeugen

```sh
npm run icons
npm run build
node scripts/capture-store-assets.mjs chrome
node scripts/capture-store-assets.mjs firefox
node scripts/render-store-assets.mjs
npm run build
npm run validate
```

Das zweite Build übernimmt den aktualisierten Firefox-Editor-Screenshot in die Website. Die Aufnahmen verwenden isolierte Testprofile mit erweiterten Harness-Berechtigungen; die Produktionsmanifeste bleiben unverändert. Sie ersetzen keine Abnahme der echten Toolbar-Aktivierung.

Für diese Einreichung die geprüften v0.5.3-Archive und die beiliegenden v0.5.3-Bilder verwenden. Bei späteren Versionsänderungen die Bilder erneut erzeugen. Die tatsächlichen Store-Felder beim Upload prüfen. Keine automatische Veröffentlichung oder Website-Bereitstellung.
