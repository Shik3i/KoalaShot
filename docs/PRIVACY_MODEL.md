# Privacy model

KoalaShot has no network code in the extension runtime. The extension does not call remote `fetch()`, upload screenshots, inspect clipboard contents, create accounts, use cookies, collect browsing history, or emit analytics/telemetry.

The active page is accessed only after explicit action through `activeTab` and `scripting`. Page-derived title and URL values are treated as untrusted metadata and are inserted into the editor with `textContent`. They are never executed or written through `innerHTML`.

The original PNG stays in popup memory until the requested action is complete. If editor handoff is enabled, one Blob is stored in the extension origin's IndexedDB under a cryptographically random ID. Validated annotations and crop state use a separate lightweight IndexedDB store; a tab-scoped `sessionStorage` journal protects the latest edit during an immediate reload and is cleared after persistence or discard. Records become inaccessible after 24 hours. An open editor schedules deletion at that deadline; popup/editor startup prunes anything older. Because Manifest V3 pages do not stay alive after they close, an unused expired record is physically deleted on the next popup/editor start. There is no history view, synchronization, web-accessible storage, query-string image data, data URL editor, or remote editor.

Annotations are not uploaded or synchronized. Redact is an opaque export operation: it permanently covers pixels in the edited PNG, while the immutable temporary original remains unchanged until the user discards the record. Users should discard the local record when the original must no longer remain available.

Clipboard writes are explicit and use image APIs only. Firefox uses `setImageData`; Chromium uses `ClipboardItem` and `navigator.clipboard.write` and never calls the Chrome Apps-only clipboard API. If permission is denied or copying fails, KoalaShot offers the already-rendered PNG as a local download. Saving uses a local Blob URL and revokes it after initiating the download.

Browser-protected pages are rejected by browser permissions or shown as inaccessible. Normal document page cleanup is defensive and idempotent, including popup close, Port disconnection, cancellation, tab changes, navigation, decode failure, clipboard failure, and canvas failure.
