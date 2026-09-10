# Testing

## Commands

```sh
npm ci
npm test
npm run test:browser:chrome
npm run test:browser:firefox
npm run test:regressions
```

`npm test` runs unit tests, ESLint, Markdown links, the dependency audit including development tools, both builds, exact archive validation, negative archive tests, and pinned AMO validation with warnings treated as errors. Browser jobs are separate local commands and mandatory dependencies of the tag release job.

Current results belong in [audit fix status](audits/2026-09-07/FIXES.md). Build first when invoking browser tests directly. Tests never modify the release manifests.

## Automated coverage and boundaries

| Surface | Coverage |
| --- | --- |
| Model | Placement, limits, expiry, settings, protocol, annotations, geometry, immutable history and crop |
| Controller | Stalled scroll, shrinking page, cancellation during final encoding, width warning and source-origin minimization |
| Archive gate | Exact two packages, source bytes and inventories; missing, stale, altered and foreign payload rejection |
| Production Chrome ZIP | Unchanged manifest; CDP browser-action activation grants activeTab; capture opens the editor; visible and fallback capture on chrome://version/ |
| Chrome and Firefox | Real page/internal capture, cleanup, target persistence, editor tools, crop, draft reload, keyboard annotation, zoom, PNG, clipboard success and denial, expiry and discard |
| Chromium regressions | Mixed scroll roots, late sticky, internal candidate selection, late abort, redaction plus effects, export race, native control Space, cross-tab deletion/orphan draft, responsive light/dark landing |
| Responsive editor | Chrome 390px and DPR 2; Firefox real window at 500px minimum |
| Landing | 320, 390, 768, 1440px; light/dark contrast and horizontal overflow |

The isolated harness adds temporary `<all_urls>` and `tabs` permissions to replace the toolbar's trusted activeTab grant. The Firefox test archive also adds a small background bootstrap to open its own popup tab. These changes are test-only.

`node tests/browser/store-package.test.mjs` separately extracts the shipping Chrome ZIP and uses no added extension permissions or development key. The isolated browser enables experimental extension debugging to invoke `Extensions.triggerAction` on the real tab target. This proves action permission handling without asserting a physical mouse click or store acceptance.

Firefox starts with `--remote-allow-system-access` in a disposable profile on loopback because WebDriver BiDi otherwise rejects extension-page script access. Firefox privileged-page pointer events are synthetic, and extension viewport/DPR emulation is unsupported. Real browser-window resizing tests 500px; Chromium covers 390px and DPR 2. These results do not prove trusted toolbar activation, native screen-reader operation or physical HiDPI devices.

The harness only stops browser processes it launched. Use `KOALASHOT_CHROME` or `KOALASHOT_FIREFOX` for explicit binary paths. Chrome-for-Testing is preferred where branded Chrome disables unpacked-extension command-line loading.

## Manual acceptance

Build, then load `dist/chrome/` through Chrome's Load unpacked action, or select `dist/firefox/manifest.json` in Firefox `about:debugging#/runtime/this-firefox`. No manually supplied extension ID is necessary.

Serve owned fixtures:

```sh
python -m http.server 8000
```

Open `http://127.0.0.1:8000/tests/fixtures/`. Record browser/OS/version, display scaling, outcome and image evidence.

- Start capture from the toolbar with the shipped activeTab-only manifest. Deny and later grant optional clipboard permission.
- Close popup mid-scroll; cancel during capture; navigate or activate another tab; confirm the original page scroll, styles, snap and sticky positioning are restored.
- Try protected pages, browser stores, PDF, file URLs, cross-origin frames and closed shadow roots. Verify clear errors/limits.
- Check fixed/sticky, lazy-image, growing/shrinking, scrollbar and internal-root fixtures. Inspect PNG seams and the first/last row.
- Inspect narrow editor layout, physical HiDPI and non-default zoom on Chrome, Firefox current/ESR and the intended operating systems.
- Keyboard-only tools, dialogs, select/button Space, pan release after focus loss and a screen reader.
- Redact sensitive text, overlap it with every effect, crop and export. Inspect reopened PNG; discard from another editor tab and verify both tabs clear.
- Open an existing v0.3.3 temporary record after upgrade; verify draft restoration, expiry, then discard.
- Verify actual public landing routes, privacy link, store links and headers after deployment.

Manual rows are pending until their evidence is recorded; do not mark them passed based on synthetic automation.
