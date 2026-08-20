# Architecture

## Capture ownership

The popup owns the capture session. It obtains the active tab, optionally requests `clipboardWrite` before capture, injects `content/capture-page.js` with `scripting.executeScript`, and opens a long-lived runtime Port named with a cryptographically secure session ID. There is deliberately no background service worker. The popup persists a `page` or `internal` target setting; `page` is the default.

## Content-script protocol

The content script validates the session ID, Port name, message type, and scroll fields. `start` measures the page and records original state. `scroll` sets horizontal position zero, scrolls to the requested CSS position, waits for two animation frames plus a short paint period, suppresses repeated fixed/sticky UI for that section, and returns actual scroll coordinates and current dimensions. `restore` performs idempotent cleanup. A watchdog restores the page if the popup stops communicating, and Port disconnection also restores it.

## Stitching

The popup calls `captureVisibleTab` only after verifying the same window, tab, URL, and screen viewport are still active. The first decoded PNG establishes scale from actual bitmap dimensions divided by the screen viewport. In internal mode, the content script returns a stable, fully visible capture rectangle and the stitcher crops that rectangle from every full viewport bitmap before placing it at the selected root's actual scroll position. The target height may grow by at most 25% from the initial measurement. Canvas allocation is checked against raw-memory, pixel, and dimension limits.

## Clipboard and save

`common/clipboard.js` selects `browser.clipboard.setImageData()` only after Firefox is identified through `runtime.getBrowserInfo()`. Chromium's similarly named Chrome Apps-only API is deliberately ignored; Chromium uses `navigator.clipboard.write()` with a PNG `ClipboardItem`. Optional permission requests begin synchronously inside the user gesture. When copying is denied or fails, popup and editor retain the exact rendered PNG and expose a save fallback without recapturing or rerendering. Saving uses one local Blob URL and an ordinary download link; no downloads permission is requested.

## Temporary editor handoff

The one PNG Blob and source metadata are stored once in the extension-local IndexedDB `captures` store. Validated annotations and crop state live in a separate lightweight `drafts` store, avoiding repeated large Blob rewrites in Firefox. A small synchronous `sessionStorage` journal protects the latest tab state across an immediate reload; coalesced IndexedDB writes provide durable local restoration. The popup opens `editor/editor.html?capture=<id>`, never a remote or data URL. Popup and editor startup prune records older than 24 hours. Copy and save share one `renderEditorResultBlob()` path, exports are serialized, discard removes both stores and the journal, and the original image stays immutable.

## Phase 2 editor

`editor/annotation-model.js` owns explicit schemas, secure IDs, validation, cloning, moving, crop validation, and style updates. `editor/geometry.js` owns original-pixel coordinate transforms, rectangle normalization, point reduction, hit testing, arrowheads, text bounds, effect previews, markers, and both viewport and export drawing. `editor/history.js` stores bounded before/after document states containing annotations and crop rather than screenshot snapshots. The page displays the immutable PNG as an `<img>` and uses one viewport-sized overlay canvas for interaction; it does not allocate a permanent full-resolution display canvas.

## Compatibility boundary

`common/browser-api.js` wraps only the APIs used by KoalaShot: active-tab query, tab lookup, script injection, Port connection, visible-tab capture, tab creation, storage, optional permissions, extension URLs, and localized messages. It supports callback and Promise-style browser APIs without a polyfill. The content script uses the native runtime Port directly because it runs in the page's extension-isolated world.

## Cleanup guarantee

The content script snapshots scroll coordinates, root/body inline properties, root class, temporary style elements, and fixed/sticky visibility properties. `try/finally` cleanup in the popup plus Port disconnection and watchdog cleanup restore them on success, save/copy failure, cancellation, navigation interruption where the content script survives, decode failure, clipboard failure, and canvas failure.
