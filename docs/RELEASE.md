# Release runbook

Tag-driven release; no Docker step. Prepare the source in a feature branch, validate, and merge through the repository's normal PR protection. Never bypass protection to publish.

## Prepare

```sh
npm ci
npm run release:prepare -- X.Y.Z
npm test
npm run test:browser:chrome
npm run test:browser:firefox
npm run test:regressions
git diff --check
git status --short
```

Replace `X.Y.Z` with a new stable semantic version. Skip preparation if the intended version is already set. Update the changelog and review the complete implementation plus version diff before committing the intended files. Push the feature branch, review CI/CodeQL, and merge the PR.

After confirming that local `main` exactly matches the verified merged remote commit, create and push the annotated tag:

```sh
git tag -a vX.Y.Z -m "KoalaShot vX.Y.Z"
git push origin vX.Y.Z
```

Tagging/pushing and store uploads are explicit publication steps, separate from local preparation.

## Workflow gates

The tag must match `vMAJOR.MINOR.PATCH`. Source manifests, constants, package metadata, README build version and landing metadata must match. Chrome and Firefox success/denial browser jobs must pass; the Chrome job also runs audit regressions. Only then does the publication job run `npm test`, generate checksums/attestations, upload the landing artifact and publish the two extension ZIPs.

The workflow does not rewrite source after the tag. A failing browser job prevents publication.

## After publication

Verify the actual workflow run and tag SHA. Download both archives and `SHA256SUMS`, then run:

```sh
sha256sum -c SHA256SUMS
```

Load `dist/chrome/` or `dist/firefox/manifest.json` for manual testing. Review the [release checklist](RELEASE_CHECKLIST.md) for store and landing steps.