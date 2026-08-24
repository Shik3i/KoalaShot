#!/usr/bin/env python3
"""Validate source policy, required files, and generated distribution contents."""

from __future__ import annotations

import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
LANDING = ROOT / "landing"
DIST = ROOT / "dist"
WORKFLOWS = ROOT / ".github" / "workflows"
ALLOWED_PERMISSIONS = {"activeTab", "scripting", "storage"}
FORBIDDEN_PERMISSIONS = {"<all_urls>", "tabs", "debugger", "downloads", "history", "bookmarks", "cookies", "webRequest", "management", "nativeMessaging", "clipboardRead"}


def fail(message: str) -> None:
    raise SystemExit(f"validate.py: error: {message}")


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {error}")
    if not isinstance(value, dict):
        fail(f"manifest is not an object: {path.relative_to(ROOT)}")
    return value


class LandingAssetParser(HTMLParser):
    REMOTE_ASSET_RELS = {"stylesheet", "preload", "modulepreload", "icon", "apple-touch-icon", "manifest"}

    def __init__(self) -> None:
        super().__init__()
        self.remote_asset = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, object]]) -> None:
        attributes = dict(attrs)
        if tag == "script" and str(attributes.get("src", "")).startswith(("http://", "https://")):
            self.remote_asset = str(attributes["src"])
        if tag == "link":
            relations = set(str(attributes.get("rel", "")).lower().split())
            href = str(attributes.get("href", ""))
            if relations & self.REMOTE_ASSET_RELS and href.startswith(("http://", "https://")):
                self.remote_asset = href


def project_version() -> str:
    metadata = read_json(ROOT / "package.json")
    version = metadata.get("version")
    if not isinstance(version, str) or not version:
        fail("package.json must define a non-empty string version")
    return version


def validate_manifests() -> None:
    version = project_version()
    for browser in ("chrome", "firefox"):
        manifest = read_json(EXTENSION / "manifests" / f"{browser}.json")
        permissions = set(manifest.get("permissions", []))
        optional = set(manifest.get("optional_permissions", []))
        if permissions - ALLOWED_PERMISSIONS:
            fail(f"unexpected required permissions in {browser}: {sorted(permissions - ALLOWED_PERMISSIONS)}")
        if permissions & FORBIDDEN_PERMISSIONS:
            fail(f"forbidden permissions in {browser}: {sorted(permissions & FORBIDDEN_PERMISSIONS)}")
        if optional & FORBIDDEN_PERMISSIONS:
            fail(f"forbidden optional permissions in {browser}: {sorted(optional & FORBIDDEN_PERMISSIONS)}")
        if optional != {"clipboardWrite"}:
            fail(f"optional permissions in {browser} must contain only clipboardWrite")
        if manifest.get("manifest_version") != 3 or manifest.get("version") != version:
            fail(f"unexpected manifest version in {browser}")
        if browser == "firefox":
            gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
            collection = gecko.get("data_collection_permissions")
            if not isinstance(collection, dict) or collection.get("required") != ["none"]:
                fail("Firefox must declare required data_collection_permissions as ['none']")


def validate_version_consistency() -> None:
    version = project_version()
    lockfile = read_json(ROOT / "package-lock.json")
    if lockfile.get("version") != version or lockfile.get("packages", {}).get("", {}).get("version") != version:
        fail(f"package-lock.json must contain version {version}")
    constants = (EXTENSION / "common" / "constants.js").read_text(encoding="utf-8")
    match = re.search(r'export const VERSION = ["\']([^"\']+)["\']', constants)
    if not match or match.group(1) != version:
        fail(f"extension/common/constants.js must contain version {version}")


def validate_required_files() -> None:
    required = [
        EXTENSION / "popup" / "popup.html",
        EXTENSION / "popup" / "popup.css",
        EXTENSION / "popup" / "popup.js",
        EXTENSION / "content" / "capture-page.js",
        EXTENSION / "editor" / "editor.html",
        EXTENSION / "editor" / "editor.css",
        EXTENSION / "editor" / "editor.js",
        EXTENSION / "editor" / "editor-export.js",
        EXTENSION / "common" / "browser-api.js",
        EXTENSION / "common" / "clipboard.js",
        EXTENSION / "common" / "capture-store.js",
        EXTENSION / "common" / "filename.js",
        EXTENSION / "_locales" / "en" / "messages.json",
        EXTENSION / "icons" / "icon-master.png",
        LANDING / "index.html",
        LANDING / "privacy" / "index.html",
        LANDING / "assets" / "favicon.png",
        LANDING / "assets" / "koalashot-mascot-2d.webp",
        LANDING / "robots.txt",
        LANDING / "sitemap.xml",
        LANDING / "llms.txt",
        LANDING / "version.json",
        ROOT / "SECURITY.md",
        ROOT / "CHANGELOG.md",
        ROOT / "CONTRIBUTING.md",
        ROOT / "docs" / "STORE_LISTING.md",
        ROOT / "docs" / "RELEASE_CHECKLIST.md",
    ]
    required += [EXTENSION / "icons" / f"icon-{size}.png" for size in (16, 32, 48, 96, 128)]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        fail(f"required files missing: {', '.join(missing)}")


def validate_icon_consistency() -> None:
    extension_master = EXTENSION / "icons" / "icon-master.png"
    landing_favicon = LANDING / "assets" / "favicon.png"
    if extension_master.read_bytes() != landing_favicon.read_bytes():
        fail("landing favicon must be byte-identical to extension/icons/icon-master.png")


def validate_source_policy() -> None:
    for path in sorted(EXTENSION.rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        if re.search(r"\beval\s*\(|\bnew\s+Function\s*\(", text):
            fail(f"dynamic code execution found in {path.relative_to(ROOT)}")
        if re.search(r"fetch\s*\(\s*[\"']https?://", text):
            fail(f"remote fetch found in {path.relative_to(ROOT)}")
        nonempty = [line for line in text.splitlines() if line.strip()]
        if nonempty and len(nonempty) == 1 and len(nonempty[0]) > 500:
            fail(f"unreadable single-line JavaScript found in {path.relative_to(ROOT)}")
    for path in sorted(LANDING.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        parser = LandingAssetParser()
        parser.feed(text)
        if parser.remote_asset:
            fail(f"remote landing-page asset found in {path.relative_to(ROOT)}: {parser.remote_asset}")
    for path in sorted(LANDING.rglob("*.css")):
        text = path.read_text(encoding="utf-8")
        if re.search(r"url\(\s*[\"']?https?://", text, re.IGNORECASE):
            fail(f"remote landing-page stylesheet asset found in {path.relative_to(ROOT)}")


def validate_workflows() -> None:
    action_reference = re.compile(r"^\s*uses:\s*[^\s@]+@([^\s#]+)", re.MULTILINE)
    immutable_revision = re.compile(r"^[0-9a-f]{40}$")
    for path in sorted(WORKFLOWS.glob("*.yml")):
        text = path.read_text(encoding="utf-8")
        revisions = action_reference.findall(text)
        if not revisions:
            fail(f"workflow has no action references: {path.relative_to(ROOT)}")
        for revision in revisions:
            if not immutable_revision.fullmatch(revision):
                fail(f"workflow action is not pinned to an exact commit in {path.relative_to(ROOT)}: @{revision}")

    release = (WORKFLOWS / "release.yml").read_text(encoding="utf-8")
    for forbidden in ("git commit", "git push"):
        if forbidden in release:
            fail(f"release workflow must not mutate source branches: found {forbidden!r}")
    if "npm run test:browser:matrix" not in release:
        fail("release workflow must run the Chrome and Firefox browser matrix")

    ci = (WORKFLOWS / "ci.yml").read_text(encoding="utf-8")
    for required in (
        "browser-matrix:",
        "browser: [chrome, firefox]",
        "chrome-version: 151.0.7922.34",
        "firefox-version: 152.0.3",
        "npm run test:browser:${{ matrix.browser }}",
    ):
        if required not in ci:
            fail(f"CI workflow is missing browser coverage: {required}")
    for required in ("chrome-version: 151.0.7922.34", "firefox-version: 152.0.3"):
        if required not in release:
            fail(f"release workflow is missing a qualified browser pin: {required}")

    codeql = (WORKFLOWS / "codeql.yml").read_text(encoding="utf-8")
    push_block = codeql.split("pull_request:", 1)[0]
    if re.search(r"push:\s*\n\s+branches:", push_block):
        fail("CodeQL push analysis must not be limited to selected branches")


def validate_landing_version() -> None:
    version = project_version()
    metadata = read_json(LANDING / "version.json")
    if metadata.get("version") != version:
        fail(f"landing/version.json must contain version {version}")

    if (LANDING / "legal").exists():
        fail("landing/legal must not exist; legal links belong to https://koalastuff.net/legal")
    for relative in ("index.html", "privacy/index.html"):
        text = (LANDING / relative).read_text(encoding="utf-8")
        if 'href="https://koalastuff.net/legal"' not in text:
            fail(f"{relative} must link to the canonical KoalaStuff legal notice")
        if re.search(r'href=["\'][^"\']*legal/', text):
            fail(f"{relative} must not link to a local legal page")
        for asset in ("styles.css", "main.js"):
            if f"{asset}?v={version}" not in text:
                fail(f"{relative} must cache-bust {asset} with project version {version}")


def validate_archives() -> None:
    if not DIST.exists():
        print("No dist/ directory found; source validation passed and archive validation was skipped.")
        return
    forbidden_parts = {"node_modules", "tests", "docs", ".git"}
    for archive in sorted(DIST.glob("*.zip")):
        with zipfile.ZipFile(archive) as handle:
            names = handle.namelist()
            for name in names:
                parts = set(Path(name).parts)
                if parts & forbidden_parts or name.endswith(".map") or name.endswith(".DS_Store"):
                    fail(f"development-only file in {archive.name}: {name}")
            if "manifest.json" not in names:
                fail(f"manifest.json missing from {archive.name}")
    print(f"Validated {len(list(DIST.glob('*.zip')))} extension ZIP archive(s).")


def main() -> None:
    validate_manifests()
    validate_version_consistency()
    validate_required_files()
    validate_icon_consistency()
    validate_source_policy()
    validate_workflows()
    validate_landing_version()
    validate_archives()
    print("Validation passed.")


if __name__ == "__main__":
    main()
