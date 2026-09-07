# Status — v0.4.0

Updated 2026-09-07. This source version is not a claim of GitHub publication, Chrome Web Store approval, Firefox Add-ons approval, or website deployment.

## Implemented

- Explicit Capture & edit, Copy original and Save original actions; capture preview and reusable result actions.
- Normal document capture or one fully visible, untransformed internal vertical root. Scroll-stall, shrink, navigation/session and deadline guards; bounded growth; horizontal truncation warning.
- Local editor with immutable original, actual effect preview, final opaque redaction mask, crop, keyboard operation, shared bounded history and revision-checked export.
- Atomic draft writes only for live captures; cross-tab discard invalidation; local expiry and journal cleanup.
- Responsive landing, optimized local hero, social card, full local-data disclosure and configurable official store links.
- Exact source-to-ZIP validation and negative packaging tests; tag release depends on both browser jobs.

## Verification record

Final local release checks and repository cleanup: [v0.4.0 validation](releases/0.4.0.md).

Current command outputs, browser versions, screenshots and limitations are consolidated in [audit fix status](audits/2026-09-07/FIXES.md). The original [audit](audits/2026-09-07/AUDIT.md) describes the pre-fix commit and remains historical evidence.

Do not infer a current result from older v0.3.2/v0.3.3 run notes. Local gates and remote CI are separate. Check the exact release commit on GitHub Actions for current remote results; the historical local audit is not remote CI evidence.

## Remaining release acceptance

- Manual toolbar-triggered activeTab/permission checks with the unmodified Chrome and Firefox manifests.
- Firefox ESR/minimum-version and macOS/Linux platform checks; real HiDPI/zoom and assistive-technology acceptance.
- Store listing/account declarations, final screenshots and privacy/legal contact review.
- Deploy and verify the public landing routes, HTTPS and response headers. Configure official store URLs after approval.

## Product boundaries

One vertical root, no horizontal stitching, no nested root traversal, no protected browser pages. Closed Shadow DOM and cross-origin frame contents cannot be inspected. Fixed-element heuristics remain best effort on arbitrary sites. Highly dynamic pages may abort or reach the documented growth cap. Capture lives in the popup: keep it open until completion.

Blur and pixelation are cosmetic. Opaque redaction protects the edited PNG; the temporary original remains available until discard/expiry. Files already saved and clipboard contents are outside automatic deletion.

Future optional work: annotation resize handles, richer text/arrow styling, image insertion, localization, user-selected scroll roots, tiled/PDF export. These features are not required for the currently advertised vertical-PNG scope.