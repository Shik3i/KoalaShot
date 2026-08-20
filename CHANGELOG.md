# Changelog

All notable user-visible changes are documented here. KoalaShot uses semantic versioning.

## [0.3.2] - Unreleased

### Added

- Original KoalaShot mascot artwork and a product-focused responsive landing-page hero.
- Matching flat 2D favicon and regenerated Chrome/Firefox extension icons at every packaged size.
- Security policy, contribution guide, store-listing packet, release checklist, Dependabot configuration, and CodeQL workflow.

### Changed

- Release documentation now distinguishes source readiness, store submission, publication, and deployment.
- Editor storage documentation now matches the split immutable capture store, lightweight draft store, and tab-scoped reload journal.

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

[0.3.2]: https://github.com/Shik3i/KoalaShot/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/Shik3i/KoalaShot/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Shik3i/KoalaShot/releases/tag/v0.3.0
