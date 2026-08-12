# Architecture

## Capture ownership

The popup owns the Phase 1 capture session. It obtains the active tab, optionally requests `clipboardWrite` before capture, injects `content/capture-page.js` with `scripting.executeScript`, and opens a long-lived runtime Port named with a cryptographically secure session ID. There is deliberately no background service worker.

## Content-script protocol

The content script validates the session ID, Port name, message type, and scroll fields. `start` measures the page and records original state. `scroll` sets horizontal position zero, scrolls to the requested CSS position, waits for two animation frames plus a short paint period, suppresses repeated fixed/sticky UI for that section, and returns actual scroll coordinates and current dimensions. `restore` performs idempotent cleanup. A watchdog restores the page if the popup stops communicating, and Port disconnection also restores it.

## Stitching

The popup calls `captureVisibleTab` only after verifying the same window, tab, URL, and viewport are still active. The first decoded PNG establishes `scaleX` and `scaleY` from actual bitmap dimensions divided by CSS viewport dimensions. Capture positions end at the measured maximum scroll position. Each section is drawn at the actual returned scroll position; overlap is cropped using centralized CSS-pixel-to-bitmap rounding. The target height may grow by at most 25% from the initial measurement. Canvas allocation is checked against raw-memory, pixel, and dimension limits.

## Clipboard and save

`common/clipboard.js` selects Firefox `browser.clipboard.setImageData()` when available. Otherwise it uses `navigator.clipboard.write()` with a PNG `ClipboardItem`. Clipboard permission is requested before a popup capture. Saving uses one local Blob URL and an ordinary download link; no downloads permission is requested.

## Temporary editor handoff

The one PNG Blob is stored in extension-local IndexedDB with source metadata, dimensions, filename, and creation time. The popup opens `editor/editor.html?capture=<id>`, never a remote or data URL. Popup and editor startup prune records older than 24 hours. The editor can copy or save through `editor-export.js`, discard immediately, and keeps the original image immutable.

## Compatibility boundary

`common/browser-api.js` wraps only the APIs used by KoalaShot: active-tab query, tab lookup, script injection, Port connection, visible-tab capture, tab creation, storage, optional permissions, extension URLs, and localized messages. It supports callback and Promise-style browser APIs without a polyfill. The content script uses the native runtime Port directly because it runs in the page's extension-isolated world.

## Cleanup guarantee

The content script snapshots scroll coordinates, root/body inline properties, root class, temporary style elements, and fixed/sticky visibility properties. `try/finally` cleanup in the popup plus Port disconnection and watchdog cleanup restore them on success, save/copy failure, cancellation, navigation interruption where the content script survives, decode failure, clipboard failure, and canvas failure.
