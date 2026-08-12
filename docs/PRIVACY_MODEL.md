# Privacy model

KoalaShot has no network code in the extension runtime. The extension does not call remote `fetch()`, upload screenshots, inspect clipboard contents, create accounts, use cookies, collect browsing history, or emit analytics/telemetry.

The active page is accessed only after explicit action through `activeTab` and `scripting`. Page-derived title and URL values are treated as untrusted metadata and are inserted into the editor with `textContent`. They are never executed or written through `innerHTML`.

The original PNG stays in popup memory until the requested action is complete. If editor handoff is enabled, one Blob is stored in the extension origin's IndexedDB under a cryptographically random ID. Records are pruned on popup/editor start and expire after 24 hours. There is no history view, synchronization, web-accessible storage, query-string image data, data URL editor, or remote editor.

Clipboard writes are explicit and use image APIs only. Firefox uses `setImageData` where available; Chromium uses `ClipboardItem` and `navigator.clipboard.write`. Saving uses a local Blob URL and revokes it after initiating the download.

Browser-protected pages are rejected by browser permissions or shown as inaccessible. Normal document page cleanup is defensive and idempotent, including popup close, Port disconnection, cancellation, tab changes, navigation, decode failure, clipboard failure, and canvas failure.
