# Privacy model

The extension has no network upload, analytics, telemetry, remote code or account service. It does not read clipboard contents, collect browsing history or synchronize captures. Help/Privacy links open an external page only when clicked.

The active page is accessed after explicit action using activeTab and scripting. New temporary capture records contain the original PNG, page title, source origin (scheme/host, no path/query/fragment), filename, dimensions, warnings, random ID and creation time. Existing older records may contain a full URL until expiry/discard. Metadata is untrusted text displayed with textContent.

The original PNG stays in popup memory until the popup closes or another capture replaces it. Capture & edit stores a Blob in extension-local IndexedDB without first downloading or copying it. Copy original and Save original do exactly what their labels say; the optional editor handoff runs afterward.

Captures and drafts use separate IndexedDB stores. Drafts contain validated annotation objects, crop and update time; they do not duplicate the image Blob. A tab-scoped sessionStorage journal protects recent edits across reload until persistence succeeds. Records are inaccessible after 24 hours. Open editors schedule deletion; unused expired records are physically deleted on the next popup/editor startup. Discard removes capture/draft/journal and notifies other open editors to clear their in-memory originals. Draft writes require a live parent capture in the same transaction.

Opaque redaction covers the edited PNG and is composited after all other annotations. Blur/pixelation are cosmetic. Redaction does not erase the immutable temporary original. Discard it when no longer needed. Already saved files and clipboard contents are outside automatic cleanup.

Clipboard writes are explicit. Firefox uses setImageData; Chromium uses ClipboardItem/navigator.clipboard.write. Optional clipboardWrite denial preserves the local save path. Downloads use a local Blob URL, revoked after initiation.

Page cleanup restores captured page styles/scroll on completion, cancellation, port disconnection and detected navigation/tab changes. Browser-protected pages, closed Shadow DOM and cross-origin frame inspection are outside the capture guarantee.