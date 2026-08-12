# KoalaShot

KoalaShot – Full Page Screenshot is a privacy-first browser extension for capturing a complete vertical webpage as one PNG and annotating it locally. It is built from readable vanilla HTML, CSS, and JavaScript with no runtime dependencies.

## Phase 1 and Phase 2

Implemented:

- Chromium and Firefox Manifest V3 source manifests.
- Popup-owned full-page capture using an injected content script and a long-lived runtime Port.
- Measured CSS-to-bitmap scale detection, overlap-aware vertical stitching, conservative memory limits, and PNG output.
- Copy original PNG, save original PNG, cancellation, progress, page-state restoration, and bounded dynamic-height handling.
- Optional local editor handoff through temporary extension-local IndexedDB storage.
- Non-destructive editor with Select, Pan, Pen, Highlighter, Arrow, Line, Rectangle, Text, secure opaque Redact, Undo, Redo, Delete, Clear all, zoom, fit-to-width, actual size, Copy edited, Save edited PNG, and discard.
- Original-pixel annotation model, viewport-sized interaction canvas, shared geometry/render primitives, bounded history, and debounced local draft restoration.
- Static local landing page at `landing/` with `/`, `/privacy/`, and `/legal/`.
- Dependency-free Python build/validation scripts and Node built-in unit tests.

Not implemented: crop, ellipse, pixelation, blur, numbered markers, resize handles, image insertion, cloud sharing, horizontal stitching, nested scroll-container capture, store publishing, localization beyond the English catalog, and deployment.

## Privacy principles

Capture begins only after explicit user action. Screenshots and page content remain on the device. KoalaShot has no accounts, uploads, history interface, cookies, tracking, analytics, telemetry, remote configuration, or remote code. Temporary editor records are local and expire within 24 hours.

## Browser support

The source targets Chrome and Chromium-based browsers such as Vivaldi, Edge, and Brave, plus Firefox. Browser-protected pages, built-in PDF viewers, extension stores, and normal-document pages whose main content is an internal scroll area are outside the Phase 1 guarantee.

## Local development

Generate the repository-owned icon PNGs:

```sh
npm run icons
```

Run tests:

```sh
npm test
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
dist/koalashot-chrome-0.2.0.zip
dist/koalashot-firefox-0.2.0.zip
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

Keyboard shortcuts include `V` Select, `Space` temporary Pan, `P` Pen, `H` Highlighter, `A` Arrow, `L` Line, `R` Rectangle, `T` Text, `X` Redact, `Delete`, `Escape`, `Ctrl/Cmd+Z`, `Ctrl+Y`, `Cmd+Shift+Z`, `Ctrl/Cmd++`, `Ctrl/Cmd+-`, and `Ctrl/Cmd+0`.

## Known limitations

- Phase 1 captures normal document scrolling only; dominant internal scroll roots are detected and rejected.
- Fixed and sticky suppression is best-effort and cannot inspect closed Shadow DOM or cross-origin frames.
- Highly dynamic pages may exceed the 25% bounded growth allowance.
- Canvas allocation is conservatively capped; KoalaShot never silently downscales or crops an over-limit page.
- The landing legal page contains a clearly marked canonical-details placeholder because the empty repository had no verified legal identity material.

The direct future editor work is crop, ellipse, pixelation, numbered markers, resize handles, configurable arrowheads, text outlines, and image insertion. The current Phase 2 contract is documented in [docs/EDITOR_SPEC.md](docs/EDITOR_SPEC.md).

## License

MIT. Copyright (c) 2026 Shik3i.
