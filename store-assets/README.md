# KoalaShot store assets

Screenshots regenerated from the local v0.4.0 packaged editor using [the owned demo page](../tests/fixtures/store-demo.html). No customer data, external assets or composited UI mockups.

```sh
npm run build
node scripts/capture-store-assets.mjs chrome
node scripts/capture-store-assets.mjs firefox
```

- screenshots/chrome-editor-clean.png and chrome-editor-annotated.png: real editor, 1280×800.
- screenshots/chrome-popup-capture.png: completed-capture popup opened as a tab; supporting image, not the first listing image.
- Equivalent firefox-* screenshots are produced using Firefox tab capture because BiDi cannot screenshot extension scope.
- chrome-small-promo-440x280.png and chrome-marquee-1400x560.png: existing mascot-based marketing assets; no runtime claim.

The harness uses expanded test-only permissions; see [testing boundaries](../docs/TESTING.md). Editor screenshots show packaged product HTML/CSS/JS and actual captured page content. Prefer the annotated editor as the first listing image, the clean editor second, and the popup image only as supporting material.

Review final listing appearance and browser-specific asset requirements in each store dashboard before submission. The old promo artwork remains unchanged.