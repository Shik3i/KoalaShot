# KoalaShot project canon

- Product name: KoalaShot.
- Store-facing name: KoalaShot – Full Page Screenshot.
- Initial browsers: Chrome, Chromium-based browsers, and Firefox.
- Core behavior: explicit user action captures the current viewport width and the complete vertical document as one PNG.
- Capture is popup-owned in Phase 1; no background service worker is required.
- Capture is local-only. No uploads, accounts, tracking, analytics, telemetry, cookies, remote configuration, remote code, or screenshot history.
- `Capture & Copy` copies the untouched original before optional editor handoff.
- `Save PNG` saves the untouched original without the downloads permission.
- The editor has its own Copy edited and Save edited PNG controls and uses one shared full-resolution export path.
- Phase 2 tools are Select, Pan, Pen, Highlighter, Arrow, Line, Rectangle, Text, secure opaque Redact, Undo, Redo, Delete, Clear all, zoom, fit width, and actual size.
- The editor stores temporary captures and validated annotation drafts only in extension-local IndexedDB, with bounded expiry and explicit discard.
- Runtime code is vanilla HTML, CSS, JavaScript, WebExtension APIs, and Web Platform APIs.
- Distributed files remain readable: no runtime dependencies, bundling, minification, obfuscation, or source maps.
- The landing page is a static local site at `shot.koalastuff.net` with `/`, `/privacy/`, and `/legal/`.
- The editor is non-destructive: immutable original PNG plus vector annotation objects produces the final PNG.
