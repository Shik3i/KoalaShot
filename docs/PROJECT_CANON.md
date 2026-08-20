# KoalaShot project canon

- Product name: KoalaShot.
- Store-facing name: KoalaShot – Full Page Screenshot.
- Initial browsers: Chrome, Chromium-based browsers, and Firefox.
- Core behavior: explicit user action captures either the current viewport width and complete vertical document or the selected fully visible internal vertical scroll root as one PNG.
- Capture is popup-owned; no background service worker is required. The popup's Capture area selector defaults to page mode and can be switched to internal mode.
- Capture is local-only. No uploads, accounts, tracking, analytics, telemetry, cookies, remote configuration, remote code, or screenshot history.
- `Capture & Copy` copies the untouched original before optional editor handoff.
- `Save PNG` saves the untouched original without the downloads permission.
- The editor has its own Copy edited and Save edited PNG controls and uses one shared full-resolution export path.
- v0.3.2 editor tools are Select, Pan, Pen, Highlighter, Arrow, Line, Rectangle, Ellipse, Text, secure opaque Redact, cosmetic Pixelate, cosmetic Blur, numbered Marker, Crop, Undo, Redo, Delete, Clear all, zoom, fit width, and actual size.
- The editor stores temporary captures and validated annotation/crop drafts in separate extension-local IndexedDB stores. A tab-scoped `sessionStorage` journal protects the latest validated draft until IndexedDB persistence completes. All local records have bounded expiry and explicit discard.
- Runtime code is vanilla HTML, CSS, JavaScript, WebExtension APIs, and Web Platform APIs.
- Distributed files remain readable: no runtime dependencies, bundling, minification, obfuscation, or source maps.
- The landing page is a static local site at `shot.koalastuff.net` with `/` and project-specific `/privacy/`; Legal always links to `https://koalastuff.net/legal` and is not duplicated locally.
- The editor is non-destructive: immutable original PNG plus vector annotation objects produces the final PNG.
