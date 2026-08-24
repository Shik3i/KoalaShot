# Release checklist

## Source and version

- [ ] Pull `origin/main` and confirm the intended worktree scope.
- [ ] Set one version in `package.json`, both lockfile fields, both manifests, `extension/common/constants.js`, and `landing/version.json`.
- [ ] Update `CHANGELOG.md`, `README.md`, `docs/STATUS.md`, and store copy where behavior changed.
- [ ] Confirm `git diff --check` and inspect the complete diff.

## Verification

- [ ] Run `npm ci` from the committed lockfile.
- [ ] Run `npm test`.
- [ ] Run `npm run test:browser:matrix`.
- [ ] Confirm CI `verify`, CI `browser-matrix (chrome)`, CI `browser-matrix (firefox)`, and CodeQL are successful for the release commit.
- [ ] Inspect the landing page at desktop and 390×844 in light and dark color schemes.
- [ ] Verify `dist/koalashot-chrome-X.Y.Z.zip` and `dist/koalashot-firefox-X.Y.Z.zip` install from a clean profile.
- [ ] Complete any remaining manual browser/platform rows in `docs/TESTING.md` or record them accurately as not run.

## Publication boundaries

- [ ] Commit the complete intended source scope.
- [ ] Push the source branch and verify the remote SHA.
- [ ] Create and push `vX.Y.Z` only after the commit is final.
- [ ] Verify the tag-driven GitHub workflow, release assets, checksums, and artifact attestation.
- [ ] Review real store screenshots and listing copy before account submission.
- [ ] Deploy `dist/landing/` separately and verify HTTPS, `/`, `/privacy/`, `/version.json`, cache headers, and canonical links.
- [ ] Replace store placeholders only after live store URLs exist.
- [ ] Enable Dependabot alerts and protect `main` with pull requests plus the successful CI and CodeQL checks after those checks exist on the default branch.

A GitHub Release, browser-store publication, and website deployment are three separate states. Do not mark one complete based on another.
