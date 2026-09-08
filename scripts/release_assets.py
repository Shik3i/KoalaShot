"""Portable release checksum and ZIP verification; never extracts untrusted paths."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath


def asset_names(version):
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version):
        raise ValueError("Expected stable MAJOR.MINOR.PATCH")
    return [f"koalashot-{target}-{version}.zip" for target in ("chrome", "firefox", "landing")]


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_checksums(directory, version):
    (directory / "SHA256SUMS").write_text("".join(f"{checksum(directory / name)}  {name}\n" for name in asset_names(version)), encoding="utf-8")


def verify(directory, version, expected=None):
    names = asset_names(version)
    lines = (directory / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    entries = [re.fullmatch(r"([a-f0-9]{64})  ([a-z0-9.-]+)", line) for line in lines]
    if any(entry is None for entry in entries) or sorted(entry[2] for entry in entries) != sorted(names):
        raise ValueError("SHA256SUMS must contain exactly the three release basenames")
    for entry in entries:
        name = entry[2]
        path = directory / name
        if checksum(path) != entry[1]:
            raise ValueError(f"Checksum mismatch: {name}")
        if expected and checksum(path) != checksum(expected / name):
            raise ValueError(f"Uploaded bytes differ from verified build: {name}")
        with zipfile.ZipFile(path) as archive:
            members = archive.namelist()
            if len(members) != len(set(members)) or any(not p or "\\" in p or ":" in p or PurePosixPath(p).is_absolute() or ".." in PurePosixPath(p).parts for p in members):
                raise ValueError(f"Unsafe or duplicate ZIP member: {name}")
            if archive.testzip():
                raise ValueError(f"Corrupt ZIP: {name}")
            landing = name == names[2]
            metadata = json.loads(archive.read("version.json" if landing else "manifest.json"))
            if metadata.get("version") != version:
                raise ValueError(f"Archive version mismatch: {name}")
            required = {"index.html", "help/index.html", "privacy/index.html", "legal/index.html", "404.html", "_headers"} if landing else {"popup/popup.html", "editor/editor.html", "common/product.json"}
            if not required.issubset(members):
                raise ValueError(f"Missing required ZIP members: {name}")
            if not landing and json.loads(archive.read("common/product.json")).get("version") != version:
                raise ValueError(f"Product metadata version mismatch: {name}")
    print(f"Verified checksums and contents: {', '.join(names)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("version")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--expected", type=Path)
    args = parser.parse_args()
    if args.write:
        write_checksums(args.directory, args.version)
    verify(args.directory, args.version, args.expected)
