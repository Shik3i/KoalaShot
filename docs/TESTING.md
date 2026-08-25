# Testing

## Automated commands

From the repository root:

```sh
npm run icons
npm test
```

`npm test` runs the full local release gate: unit tests, ESLint, production dependency audit, extension build, archive validation, and Firefox AMO validation with warnings treated as errors. Use `npm run test:unit` for only the unit suite.

`npm run audit:docs` checks every repository Markdown link and verifies the required open-source project documents. `npm run build` copies the landing `_headers` deployment contract into `dist/landing/`.

The unit tests cover filename sanitization and local date formatting, deterministic capture positions, final overlap placement, CSS-to-bitmap rounding, raw-memory estimation, bounded dynamic height, browser clipboard selection, temporary-record expiry, settings defaults, and runtime message validation.

The v0.3.2 editor unit tests additionally cover annotation schema validation for ellipse/effects/markers, crop validation and document-state history, invalid draft rejection, original-pixel coordinate conversion, zoom-independent movement, rectangle normalization, freehand point reduction, line and arrow hit testing, text bounds, shared arrowhead geometry, bounded undo/redo with redo invalidation, edited filenames, crop export, and opaque redaction drawing.

The build checks required source files and produces readable unpacked directories and ZIP archives. Validation checks both manifests, permission policy, remote-code patterns, dynamic-code patterns, landing-page asset policy, archive contents, and required files.

## Manual fixture setup

Serve the repository with a local static server so fixture URLs remain ordinary HTTP pages. For example, from the repository root:

```sh
python -m http.server 8000
```

On Windows, `py -3 -m http.server 8000` is equivalent.

Open fixtures from `http://127.0.0.1:8000/tests/fixtures/`. Do not use a remote asset or upload service.

## Browser matrix

| Scenario | Chrome | Vivaldi / Edge / Brave | Firefox |
| --- | --- | --- | --- |
| Load unpacked/temporary build | Run manually | Run manually | Run manually |
| Basic long page | Chrome-for-Testing v0.3.2 full flow passed on 2026-08-25 | Pending manual run | Blocked: Firefox BiDi endpoint timed out before the flow started |
| 100% and non-default zoom | Pending manual run | Pending manual run | Pending manual run |
| HiDPI | Pending manual run where available | Pending manual run where available | Pending manual run where available |
| Light and dark system mode | Pending manual run | Pending manual run | Pending manual run |
| Cancellation and popup close | Pending manual run | Pending manual run | Pending manual run |
| Tab switch/navigation abort | Pending manual run | Pending manual run | Pending manual run |
| Permission denial / clipboard failure | Pending manual run | Pending manual run | Pending manual run |
| Editor handoff, draft reload, expiry, discard | Handoff/reload/discard passed; expiry covered by unit tests | Pending manual run | Blocked before browser flow; expiry covered by unit tests |
| Pen, highlighter, arrow, line, rectangle, ellipse, pixelate, blur, marker, text, crop, redaction | v0.3.2 full flow passed | Pending manual run | Blocked before browser flow |
| Select, move, delete, undo/redo, zoom, pan, keyboard-only | Pending manual run | Pending manual run | Pending manual run |
| Protected page, page-mode rejection, and internal scroll toggle/capture | v0.3.2 full flow passed | Pending manual run | Blocked before browser flow |
| Page restoration and scrollbar fixture | Pending manual run | Pending manual run | Pending manual run |

The automated command results and actual browser runs must be recorded in `docs/STATUS.md`. The current Chrome run includes editor coverage; the Firefox run is blocked before browser flow by the local BiDi endpoint timeout. Clipboard remains subject to browser user-gesture/permission rules.

Loading `dist/chrome/` with Chrome's Load unpacked action does not require an extension ID. The normal manual flow is to click KoalaShot in the toolbar.

The optional CDP harness opens the built popup directly from the extension URL and does not require a user-supplied extension ID. On Windows it prefers the installed Chrome-for-Testing binary; override it only when needed:

```powershell
$env:KOALASHOT_BROWSER = "chrome"
$env:KOALASHOT_CHROME = "C:\Users\<user>\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe"
npm run test:browser
```

The Chrome harness copies `dist/chrome/` into a disposable profile directory and adds temporary test-only `host_permissions: ["<all_urls>"]` plus `tabs`, because CDP cannot synthesize the trusted toolbar gesture required to grant `activeTab`. These permissions are never written to the source manifest or release archive.

Firefox uses a temporary test ZIP derived from the built Firefox directory. It adds temporary `<all_urls>` access, `tabs`, and a deterministic test-profile UUID map; these changes are not part of the shipped archive:

```powershell
$env:KOALASHOT_BROWSER = "firefox"
npm run test:browser
```
