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


def validate_manifests() -> None:
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
        if manifest.get("manifest_version") != 3 or manifest.get("version") != "0.1.0":
            fail(f"unexpected manifest version in {browser}")


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
        if re.search(r"<(?:script|link)[^>]+(?:src|href)=\s*[\"']https?://", text, re.IGNORECASE):
            fail(f"remote landing-page asset found in {path.relative_to(ROOT)}")
    for path in sorted(LANDING.rglob("*.css")):
        text = path.read_text(encoding="utf-8")
        if re.search(r"url\(\s*[\"']?https?://", text, re.IGNORECASE):
            fail(f"remote landing-page stylesheet asset found in {path.relative_to(ROOT)}")


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
    validate_required_files()
    validate_source_policy()
    validate_archives()
    print("Validation passed.")


if __name__ == "__main__":
    main()
