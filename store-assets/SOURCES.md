# Store preparation sources

Listing sources checked on 8 September 2026; extension architecture rechecked on 10 September 2026. Official guidance only; wording in the dashboard can change. Product descriptions are based on KoalaShot's code and observed behavior, not copied from other listings.

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare): test the shipping package, put manifest.json at the ZIP root and increase its version for updates.
- [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs): extension pages can use the API without a background worker. Native visible capture can support protected pages with activeTab even when script injection is forbidden.
- [User privacy](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy): minimize permissions and preserve private-browsing expectations.
- [Incognito manifest behavior](https://developer.chrome.com/docs/extensions/reference/manifest/incognito): spanning is the implicit default; split changes execution contexts but chrome.storage.local remains shared. KoalaShot explicitly disables private windows until a separate private editor-storage lifecycle exists.
- [Extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy): keep executable content packaged and disallow remote execution.

- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing): lead with the task, keep the summary within 132 characters, use specific features and current screenshots, avoid keyword repetition and unsupported superlatives.
- [Supplying images](https://developer.chrome.com/docs/webstore/images): icon, small promo and at least one screenshot are required. This packet supplies five 1280 × 800 images, a 440 × 280 promo and optional 1400 × 560 marquee. Store-icon padding is separate from toolbar sizing.
- [Listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing): category, language, homepage, support and graphic upload fields. The product currently has English metadata only; a prepared translation is not a translated UI.
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local processing still needs disclosure; screenshots count as website content. Include an affirmative Limited Use statement.
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): explain purpose, each permission, remote-code use and data practices consistently with the extension and public policy.
- [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies): public claims and assets must describe what the submitted extension actually does.
- [Trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure): publisher status is a factual account declaration; free pricing alone does not settle it.
- [Firefox data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/): Mozilla's manifest declarations concern transmission outside the local extension/browser. Do not copy Chrome field labels mechanically into Firefox.
- [KoalaStuff legal notice](https://koalastuff.net/legal) and [central privacy policy](https://koalastuff.net/privacy): publisher links; the legal URL was corrected to /legal by the owner on 8 September 2026. The central site's seven-day Caddy log retention is not evidence of KoalaShot's hosting configuration.
- [Section 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html): operator details depend on applicability. The central notice's private-project classification has not been independently established by this repository review.

Organization reference: local `KoalaSync/assets/StoreAssets/` groups StoreDescription.md, Screen_01…05, SmallAD.png and MarquePromoTile.png. KoalaShot follows that practical grouping inside its existing store-assets directory, with browser-specific images, source captures and reproducible layouts. No KoalaSync claims, user counts or language-support claims were copied.
