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

The tag must be annotated, match `vMAJOR.MINOR.PATCH`, and resolve to the exact remote `main` commit. The latest GitHub Actions results on that commit must be successful for `verify (20)`, `verify (22)`, `browser-matrix (chrome)`, `browser-matrix (firefox)` and `analyze` (CodeQL). Missing, pending, skipped or failed checks stop the workflow. A published release is never replaced on rerun.

Source manifests, constants, package metadata, README build version and landing metadata must match. Chrome and Firefox success/denial browser jobs must pass; Chrome also runs capture/editor and website regressions. The publication job runs `npm test` and rechecks release eligibility before uploading.

All three ZIPs (Chrome, Firefox and static website) receive basename-only `SHA256SUMS` entries and artifact attestations. The workflow creates a draft, downloads its actual assets, checks their hashes against the verified build, validates ZIP contents/versions, and verifies provenance bound to this repository's release workflow, tag and commit. Only that verified draft is published. A failure leaves the release unpublished for investigation; remove unexpected draft assets before rerunning. Website deployment and store submission remain manual.

The workflow does not rewrite source after the tag. A failing browser job prevents publication.

## After publication

Verify the actual workflow run and tag SHA. Download all three archives and `SHA256SUMS` into the same directory, then run:

```sh
sha256sum -c SHA256SUMS
```

On Windows, or to check archive contents as well, use the repository's portable verifier (Node.js and Python required):

```sh
node scripts/run-python.cjs scripts/release_assets.py /path/to/downloads X.Y.Z
```

The landing ZIP is a durable release asset for the [manual deployment procedure](LANDING_DEPLOYMENT.md). GitHub Actions also retains a convenience landing artifact for a limited time. Neither uploads nor switches the live website.

Load `dist/chrome/` or `dist/firefox/manifest.json` for manual testing. Review the [release checklist](RELEASE_CHECKLIST.md) for store and landing steps.
