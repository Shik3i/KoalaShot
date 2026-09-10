# Submission readiness — v0.6.2

## Repository release

Use the matching [GitHub release](https://github.com/Shik3i/KoalaShot/releases/tag/v0.6.2), its three ZIPs and SHA256SUMS. An existing tag is never replaced. A repository build or GitHub publication does not mean the extension has been submitted to or approved by a browser store.

The release gates cover unit/lifecycle tests, ESLint, dependency audit, manifest and archive validation, negative archive tests, AMO lint, Chrome/Firefox capture and editor workflows, permission denial, recovery, English tooltips and website routes. Chrome additionally loads the unmodified production ZIP and invokes the browser action to exercise activeTab, capture/editor opening and protected-page visible capture.

Editor originals and drafts remain local, expire after 24 hours and are removed by documented cleanup. Private windows are explicitly unsupported: persistent editor storage is not a separate private store. No screenshot upload, account, telemetry, analytics or remote executable code is included.

## Required before store submission

1. Deploy the verified landing archive and configure HTTPS for https://shot.koalastuff.net. Run `npm run verify:deployment -- https://shot.koalastuff.net 0.6.2`. The privacy page must be publicly accessible. On 10 September 2026 this check failed with `SSL alert number 80`; this is an unresolved submission requirement, not proof that the local website archive is defective.
2. Confirm that hosting disclosures match the actual provider, operator and log retention. The repository does not invent hosting details.
3. Upload the verified browser-specific ZIP with the English listing and matching images. Confirm contact verification and the factual trader declaration in the existing publisher account. These account states and store acceptance have not been verified by automated repository tests.
4. After approval, populate the official store URLs in landing/version.json and release a matching build. Until then null values correctly hide install and rating links.

Website deployment and store submission remain manual owner actions. Neither has been performed by this audit.

## Evidence limits

Browser workflows use isolated profiles. The production-ZIP Chrome test adds no extension permissions and uses CDP to invoke the real extension action; it is not a physical toolbar click. Screenshot composition uses a separate test harness. Native permission dialogs, physical HiDPI devices and screenreader use still require manual acceptance. See [TESTING.md](../docs/TESTING.md).

The only executable fetch in the extension reads packaged product.json. The resource checks are not a complete browser or operating-system network trace. No claim of encrypted local storage or guaranteed secure erasure is made.
