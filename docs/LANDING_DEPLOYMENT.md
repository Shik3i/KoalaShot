# Landing deployment

The build output in `dist/landing/` is a static site with three routes:

- `/`
- `/privacy/`
- `/legal/`

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
    file_server
}
```

After deployment, verify all routes over HTTPS and confirm that `/version.json` reports the release version. The canonical publisher details remain at [KoalaStuff's legal notice](https://koalastuff.net/imprint).
