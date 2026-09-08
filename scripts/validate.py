#!/usr/bin/env python3
"""Validate source policy, required files, and generated distribution contents."""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
LANDING = ROOT / "landing"
DIST = ROOT / "dist"
ALLOWED_PERMISSIONS = {"activeTab", "scripting", "storage"}
FORBIDDEN_PERMISSIONS = {"<all_urls>", "tabs", "debugger", "downloads", "history", "bookmarks", "cookies", "webRequest", "management", "nativeMessaging", "clipboardRead"}
STABLE_SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


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


def project_version() -> str:
    metadata = read_json(ROOT / "package.json")
    version = metadata.get("version")
    if not isinstance(version, str) or not STABLE_SEMVER.fullmatch(version):
        fail("package.json must define a stable MAJOR.MINOR.PATCH version")
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
        LANDING / "index.html",
        LANDING / "privacy" / "index.html",
        LANDING / "legal" / "index.html",
        LANDING / "version.json",
        LANDING / "_headers",
    ]
    required += [EXTENSION / "icons" / f"icon-{size}.png" for size in (16, 32, 48, 96, 128)]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        fail(f"required files missing: {', '.join(missing)}")


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
        if re.search(r"<script[^>]+src=\s*[\"']https?://", text, re.IGNORECASE) or re.search(r"<link[^>]+rel=\s*[\"']stylesheet[\"'][^>]+href=\s*[\"']https?://", text, re.IGNORECASE):
            fail(f"remote landing-page asset found in {path.relative_to(ROOT)}")
        if "Content-Security-Policy" not in text:
            fail(f"landing page is missing its document CSP in {path.relative_to(ROOT)}")
    for path in sorted(LANDING.rglob("*.css")):
        text = path.read_text(encoding="utf-8")
        if re.search(r"url\(\s*[\"']?https?://", text, re.IGNORECASE):
            fail(f"remote landing-page stylesheet asset found in {path.relative_to(ROOT)}")


def validate_landing_version() -> None:
    version = project_version()
    metadata = read_json(LANDING / "version.json")
    if metadata.get("version") != version:
        fail(f"landing/version.json must contain version {version}")


def validate_archives() -> None:
    version = project_version()
    expected_archives = {f"koalashot-{browser}-{version}.zip" for browser in ("chrome", "firefox", "landing")}
    actual_archives = {path.name for path in DIST.glob("*.zip")} if DIST.exists() else set()
    if actual_archives != expected_archives:
        fail(f"expected exactly {sorted(expected_archives)}, found {sorted(actual_archives)}; run npm run build")
    sources = {
        path.relative_to(EXTENSION).as_posix(): path
        for path in EXTENSION.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
        and path.relative_to(EXTENSION).parts[0] != "manifests"
        and path.relative_to(EXTENSION).as_posix() != "icons/icon-master.png"
    }
    sources["common/product.json"] = LANDING / "version.json"
    expected_files = set(sources) | {"manifest.json"}
    for browser in ("chrome", "firefox"):
        archive = DIST / f"koalashot-{browser}-{version}.zip"
        with zipfile.ZipFile(archive) as handle:
            names = handle.namelist()
            if len(names) != len(set(names)) or set(names) != expected_files:
                fail(f"unexpected file inventory in {archive.name}")
            manifest = json.loads(handle.read("manifest.json"))
            if manifest != read_json(EXTENSION / "manifests" / f"{browser}.json"):
                fail(f"manifest differs from source in {archive.name}")
            for name, source in sources.items():
                if handle.read(name) != source.read_bytes():
                    fail(f"source mismatch in {archive.name}: {name}")
            if handle.testzip() is not None:
                fail(f"corrupt ZIP: {archive.name}")
    print("Validated both extension ZIP archives against their complete source inventory.")
    with zipfile.ZipFile(DIST / f"koalashot-landing-{version}.zip") as handle:
        files = {path.relative_to(DIST / "landing").as_posix(): path for path in (DIST / "landing").rglob("*") if path.is_file()}
        if len(handle.namelist()) != len(files) or set(handle.namelist()) != set(files):
            fail("landing ZIP inventory differs from built website")
        for name, path in files.items():
            if handle.read(name) != path.read_bytes():
                fail(f"landing ZIP content mismatch: {name}")


def main() -> None:
    validate_manifests()
    validate_version_consistency()
    validate_required_files()
    validate_source_policy()
    validate_landing_version()
    validate_archives()
    print("Validation passed.")


if __name__ == "__main__":
    main()
