# KoalaShot

[![Release](https://img.shields.io/badge/Release-v0.3.1-blue)](https://github.com/Shik3i/KoalaShot/releases)

KoalaShot – Full Page Screenshot is a privacy-first browser extension for capturing a complete vertical webpage as one PNG and annotating it locally. It is built from readable vanilla HTML, CSS, and JavaScript with no runtime dependencies.

Current release: v0.3.1

## v0.3.1 scope

Implemented:

- Chromium and Firefox Manifest V3 source manifests.
- Popup-owned full-page capture using an injected content script and a long-lived runtime Port.
- Measured CSS-to-bitmap scale detection, overlap-aware vertical stitching, conservative memory limits, and PNG output.
- Copy original PNG, save original PNG, exact-PNG save fallback after clipboard denial/failure, cancellation, progress, page-state restoration, and bounded dynamic-height handling.
- Optional local editor handoff through temporary extension-local IndexedDB storage.
- Optional capture target: the normal page or the largest fully visible scrollable area inside the page. The selected mode is persistent and can be switched off in the popup.
- Non-destructive editor with Select, Pan, Pen, Highlighter, Arrow, Line, Rectangle, Ellipse, Text, secure opaque Redact, Pixelate, Blur, numbered Markers, Crop, Undo, Redo, Delete, Clear all, zoom, fit-to-width, actual size, Copy edited, Save edited PNG, and discard.
- Original-pixel annotation model, viewport-sized interaction canvas, shared geometry/render primitives, bounded history, responsive editor layout, synchronous tab-local draft journaling, and coalesced IndexedDB draft restoration.
- Static landing page at `landing/` with `/`, project-specific `/privacy/`, shared KoalaStuff legal notice, canonical/social metadata, sitemap, robots policy, and `llms.txt`.
- Dependency-free Python build/validation scripts and Node built-in unit tests.

Not implemented: resize handles, image insertion, cloud sharing, horizontal stitching, store publishing, localization beyond the English catalog, and deployment.

## Privacy principles

Capture begins only after explicit user action. Screenshots and page content remain on the device. KoalaShot has no accounts, uploads, history interface, cookies, tracking, analytics, telemetry, remote configuration, or remote code. Temporary editor records are local and expire within 24 hours.

## Browser support

The source targets Chrome and Chromium-based browsers such as Vivaldi, Edge, and Brave, plus Firefox. Browser-protected pages, built-in PDF viewers, extension stores, and internal areas that are not fully visible or cannot be identified are outside the guarantee.

## Local development

Generate the repository-owned icon PNGs:

```sh
npm run icons
```

Run tests:

```sh
npm test
```

Run real Chrome and Firefox success plus clipboard-denial flows:

```sh
npm run test:browser:matrix
```

Build unpacked directories, ZIP archives, and the landing output:

```sh
npm run build
```

Validate manifests, source policy, required files, and generated archives:

```sh
npm run validate
```

Build output:

```text
dist/chrome/
dist/firefox/
dist/koalashot-chrome-0.3.1.zip
dist/koalashot-firefox-0.3.1.zip
dist/landing/
```

## Load the extension locally

Chrome and Chromium browsers:

1. Open the browser's extensions page.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `dist/chrome/` after `npm run build`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose Load Temporary Add-on.
3. Select `dist/firefox/manifest.json` after `npm run build`.

## Fixtures and tests

The manual fixtures are in `tests/fixtures/` and are intended to be served by a local static server. See [docs/TESTING.md](docs/TESTING.md) for the matrix and expected results. The automated suite uses only Node's built-in test runner.

## Editor behavior

Annotations are plain validated objects in original screenshot pixels. Zoom and device-pixel ratio change only the display transform. The original PNG remains immutable; Copy edited and Save edited PNG call the same full-resolution export function. Redact paints an opaque rectangle into the exported PNG and does not retroactively alter the temporary original capture.

Keyboard shortcuts include `V` Select, `Space` temporary Pan, `P` Pen, `H` Highlighter, `A` Arrow, `L` Line, `R` Rectangle, `E` Ellipse, `T` Text, `X` Redact, `I` Pixelate, `B` Blur, `M` Marker, `C` Crop, `Delete`, `Escape`, `Ctrl/Cmd+Z`, `Ctrl+Y`, `Cmd+Shift+Z`, `Ctrl/Cmd++`, `Ctrl/Cmd+-`, and `Ctrl/Cmd+0`.

## Known limitations

- Page mode captures normal document scrolling. Internal mode captures the largest fully visible scrollable area and is available through the popup's Capture area selector.
- Internal mode intentionally captures one vertical scroll root at a time; horizontal stitching, nested scroll roots inside the selected root, and partially off-screen roots remain unsupported.
- Fixed and sticky suppression is best-effort and cannot inspect closed Shadow DOM or cross-origin frames.
- Highly dynamic pages may exceed the 25% bounded growth allowance.
- Canvas allocation is conservatively capped; KoalaShot never silently downscales or crops an over-limit page.
- Legal links point directly to the shared canonical notice at `https://koalastuff.net/legal`; KoalaShot does not duplicate legal identity content.

The direct future editor work is resize handles, configurable arrowheads, text outlines, image insertion, horizontal stitching, store publishing, and localization. The current editor contract is documented in [docs/EDITOR_SPEC.md](docs/EDITOR_SPEC.md).

## License

MIT. Copyright (c) 2026 Shik3i.
