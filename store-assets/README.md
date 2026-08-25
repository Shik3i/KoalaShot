# KoalaShot store assets

Prepared for the Chrome Web Store listing of release `0.3.2`.

## Files

- `chrome-small-promo-440x280.png` — mandatory small promo image.
- `chrome-marquee-1400x560.png` — optional marquee image.
- `screenshots/chrome-popup-capture.png` — real Chrome popup capture, 1280×800.
- `screenshots/chrome-editor-clean.png` — real Chrome editor capture, 1280×800.
- `screenshots/chrome-editor-annotated.png` — real Chrome editor capture with annotations, 1280×800.

The three screenshots were captured from the local packaged-extension flow:

```powershell
$env:KOALASHOT_BROWSER='chrome'
$env:KOALASHOT_SCREENSHOT_DIR='C:\Users\s3ish\Documents\Workspace\KoalaShot\store-assets\screenshots'
npm run test:browser:chrome
```

The promo and marquee use the repository mascot at `landing/assets/koalashot-mascot.png`. No composited UI mockup is used as runtime evidence.
