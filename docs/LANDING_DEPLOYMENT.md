# Landing deployment

Deployment is always manual. The release workflow only packages the website; it never deploys it.

The build output in `dist/landing/` (also `koalashot-landing-X.Y.Z.zip` in a verified release) is a static site with four routes:

- `/`
- `/privacy/`
- `/legal/`
- `/help/`

Unknown paths must serve `404.html` with HTTP 404, including deeply nested paths. Its assets and navigation use root-relative URLs; do not configure an SPA fallback returning HTTP 200.

The output includes `landing/_headers`. Hosts that support the `_headers` convention can apply it directly. Other hosts must configure equivalent response headers:

- `Content-Security-Policy` matching `_headers`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`

For a Caddy deployment, the relevant shape is:

```caddyfile
shot.koalastuff.net {
    root * /srv/koalashot-landing
    encode gzip
    header {
        Content-Security-Policy "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    }
    @metadata path /version.json
    header @metadata Cache-Control "no-store"
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=86400"
    file_server
    handle_errors {
        @notFound expression {err.status_code} == 404
        handle @notFound {
            rewrite * /404.html
            file_server
        }
    }
}
```

Apply the same security headers to error responses. Validate the Caddy configuration before reloading it. `_headers` is deployment metadata, not a substitute for configuring Caddy: add `Cache-Control: no-store` specifically for `/version.json` and appropriate MIME types. The canonical publisher details remain at [KoalaStuff's legal notice](https://koalastuff.net/imprint).

Serve `/version.json` with `Cache-Control: no-store`; ordinary assets use `public, max-age=86400`. Confirm correct MIME types for `.webp` and `.png`. The hero uses the optimized local WebP; Open Graph uses `assets/og-card.png`.

Store installation links are controlled by `stores.chrome` and `stores.firefox` in `landing/version.json`. Keep them `null` until approved store URLs exist. Set only HTTPS URLs on `chromewebstore.google.com/detail/` or `addons.mozilla.org/.../firefox/addon/`, rebuild and deploy. Test both populated and unavailable-store states. Do not advertise a pending listing as installable.

## Manual acceptance and rollback

1. Select a published, verified release and record its version and tag commit. Download its three ZIPs and `SHA256SUMS`. Run `node scripts/run-python.cjs scripts/release_assets.py /path/to/downloads X.Y.Z` from the repository. Keep the current production directory and server configuration for rollback.
2. Extract only the verified landing ZIP into a new versioned directory. Confirm `version.json`, `help/index.html`, `privacy/index.html`, `legal/index.html`, `404.html` and `_headers` are present. Configure HTTPS, response headers, the custom 404 and metadata cache policy before switching traffic.
3. Manually switch the configured document root to the new directory. Use an atomic directory/symlink switch if supported by the host; avoid copying individual files into a live directory. Purge any host/CDN cache as needed.
4. Run the read-only acceptance command with the intended version:

   ```sh
   npm run verify:deployment -- https://shot.koalastuff.net X.Y.Z
   ```

   It checks HTTPS without accepting redirects, all four pages, matching built HTML and JSON versions, response headers, uncached version metadata and a deeply nested HTTP 404. A TLS error or stale version is a failed deployment check, not an accepted release. Review the layout and every configured store link in a real browser as well.
5. If acceptance fails after the switch, manually restore the previous document root and configuration, then rerun the probe with the previous version. Keep the failed directory for diagnosis. Do not remove the previous working deployment until acceptance passes.

Before store submission, the public privacy policy must be reachable over valid HTTPS. Repository files and a successful local build do not establish this. Fix domain/certificate/server issues on the host manually and rerun the acceptance probe.
