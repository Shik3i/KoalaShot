#!/usr/bin/env python3
"""Create a Firefox-only browser-test archive with local fixture access."""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: create-firefox-test-archive.py <source-dir> <archive-path>")

    source = Path(sys.argv[1]).resolve()
    archive = Path(sys.argv[2]).resolve()
    manifest_path = source / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["host_permissions"] = ["<all_urls>"]
    manifest["permissions"] = sorted(set(manifest.get("permissions", [])) | {"tabs"})

    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for path in sorted(source.rglob("*")):
            if path.is_file() and path != manifest_path:
                output.write(path, path.relative_to(source).as_posix())
        output.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
