# Chrome Web Store submission

Submission packet for KoalaShot v0.5.4. Use the matching verified GitHub release archives and these version-matched screenshots. No dashboard submission has been made; website and store uploads are performed only by the owner.

## Listing fields

| Field | Value |
| --- | --- |
| Name and descriptions | [StoreDescription.md](StoreDescription.md) |
| Language | English; the product UI is English |
| Category | Productivity / Tools, using the current dashboard category choices |
| Homepage | https://shot.koalastuff.net/ |
| Support | https://github.com/Shik3i/KoalaShot/issues |
| Privacy | https://shot.koalastuff.net/privacy/ |
| Legal | https://koalastuff.net/legal |
| Price | Free |
| Mature content | No; the product and supplied demo content are general-purpose |

The short description is also set in both manifests and the English locale file. Keep these strings aligned. Do not paste headings or submission notes into the public description.

## Single purpose — paste into dashboard

Capture a user-selected webpage as a PNG, optionally annotate, redact or crop it locally, and copy or save the result. All tools work on that screenshot; the extension has no unrelated functionality.

## Permission justifications — paste each separately

### activeTab

KoalaShot needs temporary access to the tab the user selects through the extension toolbar. After the user starts a capture, it captures visible sections of that page and reads its title, URL and layout to assemble the requested screenshot and stop if navigation occurs. It does not request permanent access to all websites or read browser history.

### scripting

KoalaShot injects its packaged capture script into the selected page only when the user starts a capture. The script measures and scrolls the page or selected internal scroll area, handles fixed and sticky elements, and restores page styling and scroll position when capture ends. No remote scripts are loaded.

### storage

KoalaShot stores the selected capture-area preference locally and a session timestamp used to pace screenshot requests. Editor originals and drafts are separately stored in extension-local IndexedDB, with a tab-local journal for pending edits. Nothing is stored with chrome.storage.sync or sent to a server.

### clipboardWrite — optional

KoalaShot requests this permission when the user chooses Copy in the popup or editor. It writes the requested PNG to the clipboard and never reads clipboard contents. If permission is denied, the user can still save the image as a PNG.

### Host permissions

None requested. No host-permission justification is needed for the production package. Do not upload a test-profile package: the browser harness adds broader permissions only to isolated copies.

## Remote code

Select No. All executable code is included in the extension ZIP. The footer fetches product.json from the installed extension itself, not from a remote host. External support, privacy and store links are ordinary links opened by the user.

## Privacy practices

Do not equate no uploads with no local data handling. The following is the prepared mapping for the dashboard's collection/use categories, based on the current code:

| Category | Local handling to disclose |
| --- | --- |
| Website content | Yes. Pixels of the selected page, annotation text and crop data are processed locally to produce the screenshot. No upload. |
| Web history | Current-page information only: the URL is checked transiently for navigation; origin and title are retained with a temporary editor capture. No browser-history API, background history log or server transfer. Disclose this narrow use rather than claiming no page information is handled. |
| Other categories | No dedicated collection of identity, financial, health, authentication, communications, location or interaction analytics. Screenshot pixels may contain such information if it is visible on the selected page. This is not an assurance that a screenshot cannot contain sensitive data. |

Review the actual dashboard labels and help text at submission. Do not select a blanket statement that the extension does not handle user data. The public policy and these explanations distinguish local processing from collection by the publisher.

Certifications supported by the current implementation:

- User data is not sold or transferred by the extension to third parties.
- Data is used only for the stated screenshot functionality.
- Data is not used for creditworthiness, lending, advertising or profiling.
- No analytics, telemetry, crash reporting or accounts.

The website and voluntary support messages are separate from extension data handling. There is no extension-level encryption layer for IndexedDB; do not advertise end-to-end encryption or guaranteed secure erasure.

## Upload order

Use `chrome/Screen_01.png` through `chrome/Screen_05.png` in numerical order. They are 1280 × 800 PNGs, built from real Chrome captures with explanatory labels. Unframed source captures remain in `screenshots/`. These are presentation assets, not proof of toolbar activation.

- `chrome/StoreIcon.png`: 128 × 128 PNG with the recommended padding.
- `chrome/SmallAD.png`: required 440 × 280 promo tile.
- `chrome/MarqueePromoTile.png`: optional 1400 × 560 promo tile.
- `ReviewerNotes.txt`: test instructions, no account required.

Upload koalashot-chrome-0.5.4.zip from the verified v0.5.4 release with these screenshots. Older extension ZIPs do not contain this branding and text.

## Account and final submission

Use the existing publisher account. Confirm contact verification and the truthful trader/non-trader declaration in its dashboard; the fact that this extension is free does not decide that status. No account settings were inspected or changed here. Select manual/deferred publication after review if offered, so approval does not publish the item unexpectedly. Website deployment is always manual.

See [RELEASE_READINESS.md](RELEASE_READINESS.md) for the current blockers and [SOURCES.md](SOURCES.md) for official guidance.
