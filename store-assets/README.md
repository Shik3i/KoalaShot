# KoalaShot store packet

English submission materials for v0.6.2. Use the matching verified GitHub release archives. Website deployment and store submission remain with the owner.

## Text

- [StoreDescription.md](StoreDescription.md): English listing.
- [ChromeWebStore.md](ChromeWebStore.md): dashboard fields, permissions and local-data disclosures.
- [FirefoxAddons.md](FirefoxAddons.md): AMO fields and browser differences.
- [ReviewerNotes.txt](ReviewerNotes.txt): reproducible review steps.
- [RELEASE_READINESS.md](RELEASE_READINESS.md): remaining submission requirements.
- [SOURCES.md](SOURCES.md): official guidance.

The extension ships only English. StoreDescription.de.md is an unused draft for future localization; it is not part of the English submission or extension package.

## Images

[Open image preview](preview.html). Five 1280 × 800 images per browser are ordered: full page, export, annotations, redaction, crop. The chrome/ and firefox/ folders also contain transparent 128px store icons. Chrome includes a 440 × 280 small promo and optional 1400 × 560 marquee.

Raw screenshots and capture evidence are in screenshots/. Editable composition layouts are in source/. asset-manifest.json records the release version and image dimensions. Screenshots use repository-owned fictional content. Explanatory labels are composed around real product captures; the popup is photographed as an extension tab, not as the native toolbar menu.

## Regenerate

```sh
npm run build
node scripts/capture-store-assets.mjs chrome
node scripts/capture-store-assets.mjs firefox
node scripts/render-store-assets.mjs
npm run build
npm run validate
npm run audit:docs
```

The second build copies the refreshed Firefox editor image into the website. The screenshot harness uses isolated profiles with added test permissions. The separate production-ZIP test verifies Chrome action activation and capture without modifying the shipping manifest. Neither proves a manual store upload.

Regenerate images for every release. The documentation gate rejects stale screenshot evidence and submission version references.
