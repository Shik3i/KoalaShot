# Changelog

All notable user-visible changes are documented here. KoalaShot uses semantic versioning.

## [Unreleased]

## [0.5.2] - 2026-09-08

- Resolve release drafts through the authenticated release list and verify the pinned numeric release ID. The tag-name endpoint does not expose unpublished drafts. Publication now requires an explicit `--publish`; the default verification mode is read-only.
- Includes the changes below. v0.5.1 remains an unpublished draft after its final verification stopped at the unavailable tag-name endpoint.

## [0.5.1] - 2026-09-08

- Preserve the annotated tag object during release checkout and run ordinary CI/CodeQL on branches and PRs, avoiding duplicate tag jobs racing the release preflight. Tag releases still run their own complete browser and package verification.
- Wait for Chrome's initial document before creating test tabs, and use its assigned debug port to avoid startup and stale-port races in browser verification.
- Includes the v0.5.0 changes below. The v0.5.0 tag was not published as a GitHub release because its preflight stopped before creating assets.

## [0.5.0] - 2026-09-08

- Require annotated release tags on verified main, publish only after downloading and verifying draft assets and provenance, and include a portable static-website ZIP and checksums.
- Add website help, a custom 404, actual editor imagery, store-state browser tests, and a read-only acceptance probe for manual deployments. Refresh Chrome/Firefox store screenshots and listing text.

- Separate capture-and-copy, capture-and-save and capture-and-edit. Migrate the legacy automatic-editor option, preserve completed captures on failure, and show cancellation only during capture.
- Coordinate screenshot rate limits across extension pages; verify live frame geometry, scroll revisions and session liveness around every screenshot. Keep the page watchdog beyond the screenshot timeout.
- Save drafts with atomic revisions. Pause conflicting editors, offer separate copies without extending retention, and refuse damaged drafts instead of silently removing annotations.
- Require applying or discarding pending text/crop before export. Make Undo discard a pending edit first; preserve native control keys and enable command shortcuts from the toolbar.
- Add shape resize handles, duplication, custom PNG filenames, marker size and effect strength. Keep Fit active across resizing and limit style edits to the selected annotation in Select.
- Rework popup, editor and landing footers, responsive toolbars and keyboard help. Correct privacy/storage explanations and link the central KoalaStuff legal notice.
- Share official store metadata between extension packages and landing output. Generate per-browser review links and static install links that survive a failed metadata fetch.

## [0.4.0] - 2026-09-07

- Add Capture & edit as the primary action, a completed capture preview, reusable output actions, and direct Help/Privacy links.
- Apply opaque redaction last in both preview and export; round its coverage outward. Effects cannot restore pixels underneath a redaction.
- Reject stale exports if the document changed during encoding. Invalidate other editor tabs when their original is discarded; reject orphan draft writes atomically.
- Keep document and internal scroll targets separate, reject unsuitable internal roots, unstick sticky content without hiding later headings, and restore original page styles.
- Bound capture time, detect scroll stalls, shrinking pages and stitch gaps, honor late cancellation, and carry horizontal truncation warnings into the editor.
- Share immutable history snapshots and cap history retention. Render actual blur/pixelation previews with a bounded cache. Preserve native keyboard behavior on controls.
- Store source origin instead of the full URL; document original PNG, metadata, draft journal, expiry and deletion behavior.
- Improve landing contrast, mobile gutters, image payload and PNG social card; activate install links only for configured official store URLs.
- Require both browser flows before tag publication and compare every ZIP entry against source. Add negative packaging tests and audit regression coverage.

The original audit and follow-up evidence are in `docs/audits/2026-09-07/`. Store upload and website deployment have not been performed for this candidate.

## [0.3.2] - 2026-08-25

### Added

- Original KoalaShot mascot artwork and a product-focused responsive landing-page hero.
- Matching flat 2D favicon and regenerated Chrome/Firefox extension icons at every packaged size.
- Security policy, contribution guide, store-listing packet, release checklist, Dependabot configuration, and CodeQL workflow.
- Keyboard-operable annotation creation, selection, movement, and deletion with an accessible annotation list.
- Chrome and Firefox CI browser jobs covering full success and clipboard-denial flows.

### Changed

- Release documentation now distinguishes source readiness, store submission, publication, and deployment.
- Editor storage documentation now matches the split immutable capture store, lightweight draft store, and tab-scoped reload journal.
- Dark-mode primary button colors now meet WCAG AA contrast with white text.
- Temporary editor records are rejected and removed on expired reads, pruned at startup, and deleted at the 24-hour deadline while an editor remains open.
- Release automation now runs the real Chrome and Firefox browser matrix before publishing artifacts.

### Fixed

- Cancelling while a content-script request is pending now rejects immediately instead of waiting for the request timeout.

## [0.3.1] - 2026-08-20

### Added

- Internal vertical scroll-root capture with a persistent popup selector.
- Ellipse, Pixelate, Blur, numbered Marker, Crop, responsive editor layout, and local draft restoration.
- Exact-PNG download fallback after clipboard permission denial or write failure.
- Deterministic release archives, strict validation, cross-browser automation, and immutable tag-driven release automation.

### Security

- Opaque Redact remains separate from cosmetic Pixelate and Blur.
- Extension permissions remain limited to `activeTab`, `scripting`, `storage`, and optional `clipboardWrite`.

## [0.3.0] - 2026-08-19

- Initial public capture, clipboard, download, local editor, privacy page, and landing-page release.

[0.3.2]: https://github.com/Shik3i/KoalaShot/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Shik3i/KoalaShot/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Shik3i/KoalaShot/releases/tag/v0.3.0

[0.4.0]: https://github.com/Shik3i/KoalaShot/compare/v0.3.3...v0.4.0
