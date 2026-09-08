# Store listing packet

Listing draft for the v0.5.2 candidate. Review the actual store dashboard declarations before submitting. Publication and account actions are separate owner-controlled steps.

## Name

KoalaShot – Full Page Screenshot

## Short description

Capture a complete webpage, copy or save the PNG, and annotate it locally.

## Detailed description

KoalaShot captures the vertical length of the page you choose, stitches it into one PNG, and lets you edit the result before copying or saving it. Capture & copy copies the original PNG without opening the editor. Capture & save downloads the original PNG. Capture & edit opens the local editor without creating an original download or clipboard copy. Completed captures can be reused from the popup preview.

The local editor includes pen, highlighter, arrows, lines, rectangles, ellipses, multiline text, opaque redaction, cosmetic pixelation and blur, numbered markers, crop, selection, movement, rectangular resize handles, duplication, custom PNG filenames, undo/redo, zoom, and pan. The original capture stays immutable while edited exports are rendered at full resolution.

Privacy is a product constraint: no account, uploads, analytics, telemetry, tracking, remote code, remote configuration, or screenshot-history service. Temporary editor data stays in extension-local storage, becomes unavailable after 24 hours, and is deleted at that deadline by an open editor or on the next popup/editor start. It can be discarded immediately.

Some browser-protected pages, built-in viewers, closed Shadow DOM, cross-origin frame interfaces, and pages beyond safe canvas limits cannot be captured. Internal capture supports one fully visible vertical scroll area at a time.

## Categories and language

- Primary category: Productivity
- Secondary category where available: Utilities
- Initial listing language: English

## Permission explanations

- `activeTab`: access only the current tab after the user explicitly starts a capture.
- `scripting`: inject the local capture script into that explicitly selected tab.
- `storage`: remember local settings and hold temporary local editor data.
- optional `clipboardWrite`: copy the user-requested PNG. If denied or unavailable, KoalaShot offers the same PNG as a local download.

## Privacy answers

- Data sold: no.
- Data transferred to third parties: no.
- Analytics or telemetry: no.
- Remote code: no.
- User accounts: no.
- Screenshot uploads: no.
- Privacy policy: `https://shot.koalastuff.net/privacy/`
- Legal notice: `https://koalastuff.net/imprint`
- Support: `https://github.com/Shik3i/KoalaShot/issues`

## Prepared submission assets

- `store-assets/screenshots/chrome-popup-capture.png`: real Chrome popup, 1280×800.
- `store-assets/screenshots/chrome-editor-clean.png`: real Chrome editor, 1280×800.
- `store-assets/screenshots/chrome-editor-annotated.png`: real Chrome editor with annotations, 1280×800.
- `store-assets/screenshots/firefox-editor-clean.png` and `firefox-editor-annotated.png`: real Firefox editor, 1280×800.
- `store-assets/screenshots/firefox-popup-capture.png`: real Firefox popup opened as a tab, supporting image.
- `store-assets/chrome-small-promo-440x280.png`: Chrome Web Store small promo tile.
- `store-assets/chrome-marquee-1400x560.png`: optional Chrome Web Store marquee.

## Submission assets still requiring owner review

- Review the new Chrome/Firefox screenshots; use the annotated editor first. Popup screenshots show the real popup as a tab, not a toolbar overlay.
- Configure final official store URLs in `landing/version.json` after approval; unavailable install links remain hidden.
- Optional product video, if one is uploaded.

Do not use composited mockups as proof of runtime behavior. Listing screenshots must show the real packaged extension.
