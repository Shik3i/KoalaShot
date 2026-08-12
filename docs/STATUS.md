# Status

## Implemented

- Empty-repository Phase 1 foundation under `extension/`.
- Chrome and Firefox Manifest V3 source manifests with only `activeTab`, `scripting`, `storage`, and optional `clipboardWrite`.
- Popup-owned full-page vertical capture, content-script protocol, progress/cancel UI, cleanup/watchdog, measured-scale PNG stitching, bounded growth, and safety checks.
- Chromium ClipboardItem and Firefox `setImageData` adapter paths.
- Local Blob download and temporary IndexedDB editor handoff with 24-hour TTL cleanup and discard.
- Functional Phase 2 non-destructive editor with all defined tools, viewport-sized overlay, shared full-resolution export, local draft restoration, and bounded history.
- Static landing, privacy, and legal pages. Legal identity details remain an explicit pre-deployment placeholder.
- Dependency-free build, validation, icon generation, fixtures, and Node tests.

## Automated verification

On 2026-08-12, the Phase 2 baseline `npm test` passed 13/13 tests. After implementation, `npm test` passed 23/23 tests, `npm run build` produced both 0.2.0 unpacked browser directories, both versioned ZIP archives, and `dist/landing/`, `npm run validate` passed, and `node --check` passed for every extension JavaScript file.

## Partially tested

- Browser API compatibility is source-implemented but requires actual Chrome/Chromium and Firefox loading for manual confirmation.
- Fixed/sticky suppression, scrollbar compensation, lazy loading, dynamic growth, HiDPI scale, popup closure, and clipboard permission UX have local fixtures and unit-level helpers but require manual browser runs.

## Planned

- Phase 3 nested scroll-area capture and additional capture modes.
- Phase 4 store publishing and localization.

## Known issues and limitations

- Closed Shadow DOM and cross-origin frame UI cannot be inspected by the page content script.
- Highly dynamic layouts may change after measurement; growth is bounded at 25% and warns instead of following indefinitely.
- Browser-protected pages remain inaccessible by design.
- A full-resolution canvas can exceed browser allocation limits; KoalaShot reports an explicit error without downscaling or silent cropping.
- Text metrics use a deterministic system-font approximation for hit bounds; final rendering uses the local system font stack and is not guaranteed pixel-identical across operating systems.
- The empty repository contained no verified legal identity details, so `landing/legal/index.html` requires configuration before deployment.

No manual Chrome, Vivaldi/Edge/Brave, or Firefox browser run was performed in this implementation turn; those matrix rows remain pending rather than being claimed as tested.

The Codex in-app browser was used for a local static smoke check of the landing page and the editor's missing-capture loading/error state. It did not load an unpacked extension or exercise a real IndexedDB screenshot record, so it is not counted as target-browser editor validation.
