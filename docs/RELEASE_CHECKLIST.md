# Release checklist

Reusable acceptance checklist. Reset for each candidate; recorded local results are in [audit fix status](audits/2026-09-07/FIXES.md).

## Source and validation

- [ ] Review the entire intended diff; preserve unrelated work.
- [ ] Keep package, lockfile, manifests, constants, landing metadata and README build version aligned.
- [ ] Update changelog, status, privacy and store copy.
- [ ] Run `npm ci`, `npm test`, both browser matrices and `npm run test:regressions`.
- [ ] Run `git diff --check`.
- [ ] Inspect exported PNGs, landing and real product screenshots.
- [ ] Complete the manual acceptance rows in `docs/TESTING.md` on the shipped permission model.

## Publication

- [ ] Commit the intended source branch and open a reviewed PR.
- [ ] Confirm CI, both browser jobs and CodeQL for the final commit; merge through branch protection.
- [ ] Create the annotated version tag on the verified merged commit.
- [ ] Confirm the tag workflow, both ZIPs, checksums and artifact attestations.
- [ ] Review and submit Chrome/Firefox listing text, privacy answers and screenshots.
- [ ] Deploy `dist/landing/`; verify HTTPS, routes, MIME types, CSP and cache headers.
- [ ] Set approved official URLs in `landing/version.json`, rebuild/deploy and test installation links.

GitHub release, store publication and website deployment are separate states. A local green test result is not store approval.