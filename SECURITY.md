# Security policy

## Supported versions

Security fixes are developed against the current `main` branch and released in the newest version. Older versions may not receive backports.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or attach private screenshots to one. Use GitHub's [private vulnerability report](https://github.com/Shik3i/KoalaShot/security/advisories/new) and include:

- the affected KoalaShot version and browser;
- reproducible steps and the expected impact;
- whether the issue can expose captured pixels, page data, clipboard data, or local drafts;
- a minimal proof of concept without real personal data.

You should receive an acknowledgement within seven days. Please allow time to reproduce, fix, validate, and publish a coordinated release before public disclosure.

## Security boundaries

KoalaShot deliberately has no extension-runtime network requests, accounts, analytics, telemetry, remote configuration, or remote code. `activeTab` access begins only after an explicit user action. Opaque Redact is the security tool; Pixelate and Blur are cosmetic and must not be used to hide sensitive data.
