# Privacy model

The extension has no network upload, analytics, telemetry, remote code or account service. It does not read clipboard contents, collect browsing history or synchronize captures. Help/Privacy links open an external page only when clicked.

This is local data processing, not an absence of data processing. The current tab URL is transiently checked for navigation; captured pixels and titles may themselves include sensitive data. Source-page scrolling may trigger that site's own lazy loads or tracking. The extension does not add those services. Clipboard history, OS cloud clipboard and synced download folders remain under the user's settings after export.

The public policy includes the Chrome Web Store Limited Use statement. Chrome dashboard disclosures must describe locally handled website content and current-page metadata, not claim that no user data is handled. Firefox's `data_collection_permissions.required: ["none"]` describes the absence of data transmission under Mozilla's definition; it is not a claim that no local processing occurs.

Website requests and voluntarily sent support messages are separate. The static website includes no analytics or third-party scripts; its host still receives ordinary HTTP connection data. Confirm the actual host, access-log configuration and retention before treating the website policy as complete. Do not copy another Koala project's retention period without verifying this host. Support email contains the sender's address and chosen message; GitHub issues are public.

The active page is accessed after explicit action using activeTab and scripting. New temporary capture records contain the original PNG, page title, source origin (scheme/host, no path/query/fragment), filename, dimensions, warnings, random ID and creation time. Existing older records may contain a full URL until expiry/discard. Metadata is untrusted text displayed with textContent.

The original PNG stays in popup memory until the popup closes or another capture replaces it. Capture & edit stores a Blob in extension-local IndexedDB without first downloading or copying it. Capture & copy and Capture & save only export the original. They never open an editor. The result card retains that PNG while the popup stays open; Edit stores it locally and opens the editor on explicit request.

Captures and drafts use separate IndexedDB stores. Drafts contain validated annotation objects, crop, revision and update time; they do not duplicate the image Blob. A tab-scoped sessionStorage journal protects recent edits across reload until persistence succeeds. Records are inaccessible after 24 hours. Open editors schedule deletion; unused expired records are physically deleted on the next popup/editor startup. Discard removes capture/draft/journal and notifies other open editors to clear their in-memory originals. Draft writes require a live parent capture and the expected draft revision in the same transaction. Concurrent tabs cannot silently overwrite one another. Conflicts pause exports and offer reload or a separate copy with the original expiry time. Invalid drafts block export; recovering an unedited original requires an explicit action.

The selected capture area is stored in extension-local settings. Legacy editor-after-capture settings are migrated to false. A screenshot timestamp in browser session storage coordinates capture rate limits. Neither settings nor the timestamp contain page content. Footer store metadata is packaged at build time; reading it makes no external request. Privacy, Legal, Help and review links open external websites only on request.

Opaque redaction covers the edited PNG and is composited after all other annotations. Blur/pixelation are cosmetic. Redaction does not erase the immutable temporary original. Discard it when no longer needed. Already saved files and clipboard contents are outside automatic cleanup.

Clipboard writes are explicit. Firefox uses setImageData; Chromium uses ClipboardItem/navigator.clipboard.write. Optional clipboardWrite denial preserves the local save path. Downloads use a local Blob URL, revoked after initiation.

Page cleanup restores captured page styles/scroll on completion, cancellation, port disconnection and detected navigation/tab changes. Browser-protected pages, closed Shadow DOM and cross-origin frame inspection are outside the capture guarantee.
