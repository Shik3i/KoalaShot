# Release runbook

KoalaShot releases are tag-driven and contain no Docker step. The tag must point at the fully prepared source tree. The workflow does not rewrite `main` after the tag has been pushed.

## Prepare and publish

From a clean checkout on `main`:

```sh
npm ci
npm run release:prepare -- 0.4.0
npm test
git diff --check
git status --short
git add README.md package.json package-lock.json extension/manifests/chrome.json extension/manifests/firefox.json extension/common/constants.js landing/version.json
git commit -m "chore(release): prepare v0.4.0"
git push origin main
git tag -a v0.4.0 -m "KoalaShot v0.4.0"
git push origin v0.4.0
```

Replace `0.4.0` with the intended stable `MAJOR.MINOR.PATCH` version. Do not create the tag before the preparation commit is pushed.

## Workflow gates

The tag workflow validates:

- The tag format is exactly `vMAJOR.MINOR.PATCH`.
- `package.json`, both manifests, `landing/version.json`, `constants.js`, and the README agree with the tag.
- `npm ci` and the full `npm test` release gate pass.
- Chrome and Firefox archives have SHA-256 checksums.
- Release archives receive GitHub artifact attestations.
- The landing output is uploaded as a separate workflow artifact.

The workflow then publishes both extension ZIPs, `SHA256SUMS`, and generated GitHub release notes. No source files are mutated after tag creation.

## Verification after publication

Check the GitHub Actions run, the release assets, and the published tag. Download both ZIPs and verify:

```sh
sha256sum -c SHA256SUMS
```

For a local unpacked test, use `dist/chrome/` with Chrome's Load unpacked flow or `dist/firefox/manifest.json` as a temporary Firefox add-on. No extension ID is required for Chrome's unpacked flow.
