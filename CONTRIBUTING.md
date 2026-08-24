# Contributing

## Development setup

Requirements: Node.js 20 or newer, npm, Python 3, and Git.

```sh
git clone https://github.com/Shik3i/KoalaShot.git
cd KoalaShot
npm ci
npm test
```

Build the unpacked extensions and deterministic ZIP archives with `npm run build`. Run `npm run test:browser:matrix` for the real Chrome and Firefox success and clipboard-denial flows.

## Change expectations

- Keep extension runtime code readable and dependency-free. Do not add bundling, minification, obfuscation, remote code, remote fonts, analytics, or telemetry.
- Keep required permissions limited to `activeTab`, `scripting`, and `storage`; `clipboardWrite` stays optional.
- Treat page-derived values as untrusted data and use safe DOM APIs.
- Preserve the immutable original PNG and the single full-resolution export path.
- Add focused regression tests for behavior changes and update the relevant Markdown contracts.
- Pin GitHub Actions to exact 40-character commit revisions.

## Pull requests

Use a focused branch and describe the user-visible change, security/privacy impact, test evidence, and remaining manual coverage. `npm test` must pass. Browser-facing changes should include the relevant `npm run test:browser:matrix` result or a precise explanation of what was not run.

Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public pull request.
