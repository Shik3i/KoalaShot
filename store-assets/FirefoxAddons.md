# Firefox Add-ons submission

Use the English name and description in [StoreDescription.md](StoreDescription.md), the privacy URL `https://shot.koalastuff.net/privacy/` and support URL `https://github.com/Shik3i/KoalaShot/issues`. The UI is English; do not advertise translated product screens. Choose the closest screenshot/tools category available in AMO.

Upload the new verified Firefox ZIP, not the Chrome ZIP or an expanded-permission test profile. The configured add-on ID is `koalashot@koalastuff.net`; the current minimum is Firefox 142. Desktop Chrome and Firefox are the tested targets. Do not claim Firefox Android or every operating system is verified.

Use `firefox/Screen_01.png` through `firefox/Screen_05.png` in numerical order. These use actual Firefox product captures. `firefox/StoreIcon.png` is the supplied icon. Raw captures remain in `screenshots/`. Use [ReviewerNotes.txt](ReviewerNotes.txt) for the technical review instructions.

The production manifest declares `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`. Mozilla describes this mechanism in terms of data transmitted outside the add-on/local browser. It is consistent with the current extension having no screenshot upload or telemetry; it does not mean screenshots are not processed locally. Keep the privacy policy available and explain local originals, drafts, export and expiry.

No minification, remote executable code or third-party runtime dependencies are shipped. If the review requests source or build instructions, supply the exact tagged repository source, `npm ci`, `npm run build` and the verification steps in [the release documentation](../docs/RELEASE.md). Do not include node_modules, private browser profiles or local output experiments.

Publishing and signing are separate from a passing local AMO linter. Check the actual AMO review result and publication settings manually; no store upload or publication has been performed here.
