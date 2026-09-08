#!/usr/bin/env python3
"""Build readable, deterministic unpacked extension directories and ZIP archives."""

from __future__ import annotations

import json
import html
import re
import shutil
import zipfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
LANDING = ROOT / "landing"
DIST = ROOT / "dist"
PACKAGE_EXCLUDED_FILES = {Path("icons/icon-master.png")}


def project_version() -> str:
    try:
        metadata = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read package version: {error}")
    version = metadata.get("version")
    if not isinstance(version, str) or not version:
        fail("package.json must define a non-empty string version")
    return version


def fail(message: str) -> None:
    raise SystemExit(f"build.py: error: {message}")


def required_files() -> list[Path]:
    return [
        EXTENSION / "common" / "browser-api.js",
        EXTENSION / "common" / "clipboard.js",
        EXTENSION / "common" / "capture-store.js",
        EXTENSION / "popup" / "popup.html",
        EXTENSION / "popup" / "popup.js",
        EXTENSION / "popup" / "capture-controller.js",
        EXTENSION / "popup" / "stitcher.js",
        EXTENSION / "content" / "capture-page.js",
        EXTENSION / "editor" / "editor.html",
        EXTENSION / "editor" / "editor.js",
        EXTENSION / "editor" / "editor-export.js",
        EXTENSION / "_locales" / "en" / "messages.json",
        LANDING / "index.html",
        LANDING / "privacy" / "index.html",
        LANDING / "robots.txt",
        LANDING / "sitemap.xml",
        LANDING / "llms.txt",
    ]


def copy_tree(source: Path, destination: Path) -> None:
    for path in sorted(source.rglob("*")):
        if path.is_dir() or path.name == ".DS_Store":
            continue
        relative = path.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def build_extension(browser: str, version: str) -> Path:
    manifest_path = EXTENSION / "manifests" / f"{browser}.json"
    if not manifest_path.is_file():
        fail(f"missing manifest: {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"malformed {browser} manifest: {error}")
    if manifest.get("version") != version:
        fail(f"{browser} manifest version must be {version}")

    output = DIST / browser
    output.mkdir(parents=True, exist_ok=True)
    for path in sorted(EXTENSION.rglob("*")):
        if path.is_dir() or path.name == ".DS_Store" or ".git" in path.parts:
            continue
        relative = path.relative_to(EXTENSION)
        if relative.parts[:1] == ("manifests",) or relative in PACKAGE_EXCLUDED_FILES:
            continue
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    (output / "manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    shutil.copy2(LANDING / "version.json", output / "common" / "product.json")
    return output


def zip_directory(directory: Path, archive: Path) -> None:
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as handle:
        for path in sorted(directory.rglob("*")):
            if path.is_dir() or path.name == ".DS_Store":
                continue
            relative = path.relative_to(directory).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            handle.writestr(info, path.read_bytes())


def build_landing() -> None:
    copy_tree(LANDING, DIST / "landing")
    metadata = json.loads((LANDING / "version.json").read_text(encoding="utf-8"))
    stores = {}
    for browser, raw in metadata.get("stores", {}).items():
        if not raw:
            continue
        url = urlsplit(raw)
        pattern = r"/detail/[^/]+/[a-p]{32}/?" if browser == "chrome" else r"/(?:[a-z]{2}(?:-[A-Z]{2})?/)?firefox/addon/[^/]+/?"
        host = "chromewebstore.google.com" if browser == "chrome" else "addons.mozilla.org"
        if browser not in ("chrome", "firefox") or url.scheme != "https" or url.netloc != host or not re.fullmatch(pattern, url.path):
            fail(f"invalid official {browser} store URL")
        stores[browser] = urlunsplit((url.scheme, url.netloc, url.path, "", ""))
    for path in (DIST / "landing").rglob("*.html"):
        source = path.read_text(encoding="utf-8")
        for browser, url in stores.items():
            def link(match):
                tag = match[0].replace(" hidden", "")
                target = url.rstrip("/") + "/reviews" + ("/" if browser == "firefox" else "") if "data-review" in tag else url
                return tag[:-1] + f' href="{html.escape(target, quote=True)}">'
            source = re.sub(rf'<a\b[^>]*data-store="{browser}"[^>]*>', link, source)
            source = re.sub(rf'<p data-store-status="{browser}">.*?</p>', f'<p data-store-status="{browser}"><a href="{html.escape(url, quote=True)}">Get KoalaShot for {browser.title()}</a></p>', source)
        if stores:
            source = source.replace("data-review-pending>", "data-review-pending hidden>")
        source = re.sub(r'(<span data-app-version[^>]*?) hidden></span>', rf'\1>v{html.escape(metadata["version"])}</span>', source)
        path.write_text(source, encoding="utf-8")


def main() -> None:
    version = project_version()
    missing = [str(path.relative_to(ROOT)) for path in required_files() if not path.is_file()]
    if missing:
        fail(f"required files are missing: {', '.join(missing)}")
    icon_script = ROOT / "scripts" / "generate_icons.py"
    if not all((EXTENSION / "icons" / f"icon-{size}.png").is_file() for size in (16, 32, 48, 96, 128)):
        fail(f"required PNG icons are missing; run {icon_script}")
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    for browser in ("chrome", "firefox"):
        output = build_extension(browser, version)
        zip_directory(output, DIST / f"koalashot-{browser}-{version}.zip")
    build_landing()
    zip_directory(DIST / "landing", DIST / f"koalashot-landing-{version}.zip")
    print("Built dist/chrome/")
    print("Built dist/firefox/")
    print(f"Built dist/koalashot-chrome-{version}.zip")
    print(f"Built dist/koalashot-firefox-{version}.zip")
    print("Built dist/landing/")


if __name__ == "__main__":
    main()
