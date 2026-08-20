# Status

## Implemented

- Empty-repository Phase 1 foundation under `extension/`.
- Chrome and Firefox Manifest V3 source manifests with only `activeTab`, `scripting`, `storage`, and optional `clipboardWrite`.
- Popup-owned full-page vertical capture, content-script protocol, progress/cancel UI, cleanup/watchdog, measured-scale PNG stitching, bounded growth, and safety checks.
- Chromium ClipboardItem and Firefox `setImageData` adapter paths.
- Local Blob download and temporary IndexedDB editor handoff with separate immutable capture and lightweight draft stores, 24-hour TTL cleanup, and discard.
- Functional v0.3.1 non-destructive editor with Crop, Ellipse, Pixelate, Blur, numbered Markers, all prior tools, viewport-sized overlay, shared full-resolution export, local draft restoration, and bounded document history.
- Persistent popup Capture area selector for normal page capture or the largest fully visible internal vertical scroll area, with explicit page-mode rejection for internal-scroll pages.
- Static landing and project-specific privacy pages; every Legal link points to the shared canonical notice at `https://koalastuff.net/legal`.
- Clipboard denial/failure fallback that saves the exact already-rendered PNG without recapture or rerender.
- Responsive editor layout down to 390 CSS pixels, capture/injection request timeouts, dependency-free build, validation, icon generation, fixtures, and Node tests.

## Automated verification

On 2026-08-20, the v0.3.1 `npm test` release gate passed 30/30 unit tests, ESLint, production dependency audit with 0 vulnerabilities, both extension builds, source/archive/immutable-workflow validation, and AMO validation with 0 errors, 0 notices, and 0 warnings. The real Chrome/Firefox success and permission-denial browser matrix also passed.

The Windows npm entry points `npm run icons`, `npm run build`, and `npm run validate` select an available Python 3 interpreter. The full `npm test` release gate runs 30 unit tests, ESLint, the production audit, both extension builds, archive and immutable-workflow validation, and Firefox AMO validation with warnings treated as errors.

`npm audit` reports 0 vulnerabilities. `addons-linter` is intentionally invoked isolated through `npx` for the AMO pretest, so its transitive toolchain does not enter the shipped dependency graph or lockfile.

## Browser verification

- Chrome-for-Testing passed success and permission-denial flows against the v0.3.1 build on 2026-08-20: long-page capture, page-mode internal-scroll rejection, persistent mode toggle, internal-scroll capture, page cleanup, editor handoff, every v0.3 tool, separate draft/crop persistence, reload, undo/redo, zoom, 390×844 responsive geometry, clear, discard, PNG downloads, real edited-image clipboard success, and exact-PNG fallback after clipboard denial.
- The installed Google Chrome 151.0.7922.137 ignores `--load-extension`/`--disable-extensions-except`; the automated Chrome run therefore uses the installed Chrome-for-Testing binary when available. No extension ID is required by the user or by the harness.
- The Chrome CDP smoke profile copies `dist/chrome/` to a temporary directory and adds only test-profile permissions needed to replace a trusted toolbar gesture (`<all_urls>` and `tabs`). The source/release manifest remains `activeTab`-only.
- Firefox passed success and permission-denial WebDriver BiDi flows against the v0.3.1 temporary test archive on 2026-08-20, including real popup/editor clipboard success, exact-PNG denial fallback, all Chrome flow coverage above, the split capture/draft IndexedDB schema, and 390×844 responsive geometry.
- The Firefox test archive adds temporary `<all_urls>` access and `tabs`; the shipped Firefox archive remains `activeTab`-only. BiDi pointer actions are used for editor input, so synthetic untrusted pointer events are not part of the runtime proof.

## Partially tested

- Other Chromium browsers, non-default browser zoom, HiDPI, color schemes, cancellation timing, tab-switch/navigation abort, protected pages, expiry timing, and the remaining fixture matrix still require manual target-browser runs.

## Planned

- Phase 3 nested scroll-area capture is implemented for one fully visible vertical root with an explicit popup toggle.
- Phase 4 store publishing, localization, horizontal stitching, image insertion, and advanced editor handles remain.

## Known issues and limitations

- Closed Shadow DOM and cross-origin frame UI cannot be inspected by the page content script.
- Highly dynamic layouts may change after measurement; growth is bounded at 25% and warns instead of following indefinitely.
- Browser-protected pages remain inaccessible by design.
- A full-resolution canvas can exceed browser allocation limits; KoalaShot reports an explicit error without downscaling or silent cropping.
- Text metrics use a deterministic system-font approximation for hit bounds; final rendering uses the local system font stack and is not guaranteed pixel-identical across operating systems.

Loading the built `dist/chrome/` directory in Chrome does not require an extension ID. The Chrome smoke was run against Chrome-for-Testing with an isolated temporary profile; the managed Google Chrome binary was not used because it ignored the extension-loading flags. Firefox installation uses the WebDriver BiDi `archivePath` form and a temporary profile UUID map to address the installed extension page.

The Codex in-app browser was used for a local static smoke check of the landing page and the editor's missing-capture loading/error state. It did not load an unpacked extension or exercise a real IndexedDB screenshot record, so it is not counted as target-browser editor validation.

On 2026-08-20 the built landing page additionally passed visual desktop and 390×844 checks in the Codex in-app browser with `scrollWidth === 390` and no horizontal overflow.
