# Release checklist

## Source and version

- [x] Pull `origin/main` and confirm the intended worktree scope.
- [x] Set one version in `package.json`, both lockfile fields, both manifests, `extension/common/constants.js`, and `landing/version.json` (`0.3.2`).
- [x] Update `CHANGELOG.md`, `README.md`, `docs/STATUS.md`, and store copy where behavior changed.
- [x] Confirm `git diff --check` and inspect the complete diff.

## Verification

- [x] Run `npm ci` from the committed lockfile.
- [x] Run `npm test` (`Release verification passed`).
- [x] Run `npm run test:browser:chrome`.
- [ ] Run `npm run test:browser:firefox` — blocked locally by `Firefox BiDi endpoint timed out; last value: false`.
- [ ] Confirm CI `verify`, CI `browser-matrix (chrome)`, CI `browser-matrix (firefox)`, and CodeQL are successful for the release commit.
- [x] Inspect the landing page at desktop and 390×844 in light and dark color schemes.
- [x] Validate `dist/koalashot-chrome-0.3.2.zip` and `dist/koalashot-firefox-0.3.2.zip` from the local archive gate.
- [x] Complete any remaining manual browser/platform rows in `docs/TESTING.md` or record them accurately as not run.

## Publication boundaries

- [ ] Commit the complete intended source scope.
- [ ] Push the source branch and verify the remote SHA.
- [ ] Create and push `vX.Y.Z` only after the commit is final.
- [ ] Verify the tag-driven GitHub workflow, release assets, checksums, and artifact attestation.
- [x] Prepare real Chrome store screenshots, the mandatory `440×280` small promo, and the optional `1400×560` marquee in `store-assets/`.
- [ ] Review real store screenshots and listing copy before account submission.
- [ ] Deploy `dist/landing/` separately and verify HTTPS, `/`, `/privacy/`, `/version.json`, cache headers, and canonical links.
- [ ] Replace store placeholders only after live store URLs exist.
- [ ] Enable Dependabot alerts and protect `main` with pull requests plus the successful CI and CodeQL checks after those checks exist on the default branch.

A GitHub Release, browser-store publication, and website deployment are three separate states. Do not mark one complete based on another.
