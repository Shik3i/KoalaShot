# Status

## Implemented

- Empty-repository Phase 1 foundation under `extension/`.
- Chrome and Firefox Manifest V3 source manifests with only `activeTab`, `scripting`, `storage`, and optional `clipboardWrite`.
- Popup-owned full-page vertical capture, content-script protocol, progress/cancel UI, cleanup/watchdog, measured-scale PNG stitching, bounded growth, and safety checks.
- Chromium ClipboardItem and Firefox `setImageData` adapter paths.
- Local Blob download and temporary IndexedDB editor handoff with 24-hour TTL cleanup and discard.
- Functional v0.3.2 non-destructive editor with Crop, Ellipse, Pixelate, Blur, numbered Markers, all prior tools, viewport-sized overlay, shared full-resolution export, local draft restoration, and bounded document history.
- Persistent popup Capture area selector for normal page capture or the largest fully visible internal vertical scroll area, with explicit page-mode rejection for internal-scroll pages.
- Static landing, privacy, and legal pages with local CSP, host header configuration, responsive mobile layout, and a link to the central KoalaStuff legal notice.
- Dependency-free build, validation, icon generation, fixtures, and Node tests.

## Automated verification

On 2026-08-25, the v0.3.2 `npm test` gate passed 32/32 unit tests, ESLint, documentation audit, production dependency audit, extension build, archive validation, and AMO validation.

The Windows npm entry points `npm run icons`, `npm run build`, and `npm run validate` select an available Python 3 interpreter. `npm ci` and `npm audit --omit=dev` pass with the repository lockfile. The full `npm test` release gate runs 32 unit tests, ESLint, the documentation audit, the production audit, both extension builds, archive validation, and Firefox AMO validation with warnings treated as errors; the AMO result is 0 errors, 0 notices, and 0 warnings.

`npm audit` reports 0 vulnerabilities. `addons-linter` is intentionally invoked isolated through `npx` for the AMO pretest, so its transitive toolchain does not enter the shipped dependency graph or lockfile.

## Browser verification

- Chrome-for-Testing passed the full CDP flow against the v0.3.2 build on 2026-08-25: long-page capture, page-mode internal-scroll rejection, persistent mode toggle, real internal-scroll capture, page cleanup, editor handoff, rectangle/redaction/ellipse/pixelate/blur/marker/text/crop, IndexedDB draft persistence, reload, undo/redo, zoom, clear, discard, and PNG downloads. Clipboard failure under synthetic CDP evaluation was reported explicitly; PNG output remained successful.
- The installed Google Chrome 151.0.7922.137 ignores `--load-extension`/`--disable-extensions-except`; the automated Chrome run therefore uses the installed Chrome-for-Testing binary when available. No extension ID is required by the user or by the harness.
- The Chrome CDP smoke profile copies `dist/chrome/` to a temporary directory and adds only test-profile permissions needed to replace a trusted toolbar gesture (`<all_urls>` and `tabs`). The source/release manifest remains `activeTab`-only.
- Firefox AMO validation is green, but the current local WebDriver BiDi flow is blocked before browser startup on 2026-08-25: `Error: Firefox BiDi endpoint timed out; last value: false`. No current Firefox runtime claim is made from this machine.
- The Firefox test archive adds temporary `<all_urls>` access and `tabs`; the shipped Firefox archive remains `activeTab`-only. BiDi pointer actions are used for editor input, so synthetic untrusted pointer events are not part of the runtime proof.

## Partially tested

- Firefox runtime proof, other Chromium browsers, non-default zoom, HiDPI, color schemes, cancellation, tab-switch/navigation abort, protected pages, and the remaining fixture matrix still require manual or CI target-browser runs. Temporary-record expiry is covered by unit tests; a long-lived manual browser session is still optional confirmation.
- The automated Chrome clipboard check records the expected CDP limitation: `ClipboardItem` requires a trusted user gesture. Firefox records the expected permission-denial message while retaining the save path.

## Planned

- Phase 3 nested scroll-area capture is implemented for one fully visible vertical root with an explicit popup toggle.
- Phase 4 store publishing, localization, horizontal stitching, image insertion, and advanced editor handles remain.

## Known issues and limitations

- Closed Shadow DOM and cross-origin frame UI cannot be inspected by the page content script.
- Highly dynamic layouts may change after measurement; growth is bounded at 25% and warns instead of following indefinitely.
- Browser-protected pages remain inaccessible by design.
- A full-resolution canvas can exceed browser allocation limits; KoalaShot reports an explicit error without downscaling or silent cropping.
- Text metrics use a deterministic system-font approximation for hit bounds; final rendering uses the local system font stack and is not guaranteed pixel-identical across operating systems.
- `landing/legal/index.html` delegates publisher details to the central KoalaStuff legal notice and exposes the public project-support and privacy contacts.

Loading the built `dist/chrome/` directory in Chrome does not require an extension ID. The Chrome smoke was run against Chrome-for-Testing with an isolated temporary profile; the managed Google Chrome binary was not used because it ignored the extension-loading flags. The Firefox harness uses the WebDriver BiDi `archivePath` form and a temporary profile UUID map, but the current local BiDi endpoint did not become available.

The Codex in-app browser was used for a local static smoke check of the landing page and the editor's missing-capture loading/error state. It did not load an unpacked extension or exercise a real IndexedDB screenshot record, so it is not counted as target-browser editor validation.
