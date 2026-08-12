# Testing

## Automated commands

From the repository root:

```sh
npm run icons
npm test
npm run build
npm run validate
```

The unit tests cover filename sanitization and local date formatting, deterministic capture positions, final overlap placement, CSS-to-bitmap rounding, raw-memory estimation, bounded dynamic height, browser clipboard selection, temporary-record expiry, settings defaults, and runtime message validation.

The Phase 2 unit tests additionally cover annotation schema validation, invalid draft rejection, original-pixel coordinate conversion, zoom-independent movement, rectangle normalization, freehand point reduction, line and arrow hit testing, text bounds, shared arrowhead geometry, bounded undo/redo with redo invalidation, edited filenames, and opaque redaction drawing.

The build checks required source files and produces readable unpacked directories and ZIP archives. Validation checks both manifests, permission policy, remote-code patterns, dynamic-code patterns, landing-page asset policy, archive contents, and required files.

## Manual fixture setup

Serve the repository with a local static server so fixture URLs remain ordinary HTTP pages. For example, from the repository root:

```sh
python3 -m http.server 8000
```

Open fixtures from `http://127.0.0.1:8000/tests/fixtures/`. Do not use a remote asset or upload service.

## Browser matrix

| Scenario | Chrome | Vivaldi / Edge / Brave | Firefox |
| --- | --- | --- | --- |
| Load unpacked/temporary build | Run manually | Run manually | Run manually |
| Basic long page | Pending manual run | Pending manual run | Pending manual run |
| 100% and non-default zoom | Pending manual run | Pending manual run | Pending manual run |
| HiDPI | Pending manual run where available | Pending manual run where available | Pending manual run where available |
| Light and dark system mode | Pending manual run | Pending manual run | Pending manual run |
| Cancellation and popup close | Pending manual run | Pending manual run | Pending manual run |
| Tab switch/navigation abort | Pending manual run | Pending manual run | Pending manual run |
| Permission denial / clipboard failure | Pending manual run | Pending manual run | Pending manual run |
| Editor handoff, draft reload, expiry, discard | Pending manual run | Pending manual run | Pending manual run |
| Pen, highlighter, arrow, line, rectangle, text, redaction | Pending manual run | Pending manual run | Pending manual run |
| Select, move, delete, undo/redo, zoom, pan, keyboard-only | Pending manual run | Pending manual run | Pending manual run |
| Protected page and internal scroll rejection | Pending manual run | Pending manual run | Pending manual run |
| Page restoration and scrollbar fixture | Pending manual run | Pending manual run | Pending manual run |

The automated command results and the actual manual browser runs must be recorded in `docs/STATUS.md`; this repository snapshot does not claim manual browser coverage without running it.
