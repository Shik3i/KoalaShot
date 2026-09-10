"""Mutate copies of built ZIPs; the gate must reject missing, stale and altered payloads."""
import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import sys
import os
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "scripts"))
from manifest_policy import validate_manifest, validate_payload_names
spec = importlib.util.spec_from_file_location("validator", ROOT / "scripts/validate.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
build_spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build.py")
builder = importlib.util.module_from_spec(build_spec)
build_spec.loader.exec_module(builder)


class ArchiveValidation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="koalashot-archive-test-")
        self.original_dist = validator.DIST
        validator.DIST = Path(self.temp.name)
        for source in self.original_dist.glob("*.zip"):
            shutil.copy2(source, validator.DIST / source.name)
        shutil.copytree(self.original_dist / "landing", validator.DIST / "landing")
        self.archive = validator.DIST / f"koalashot-chrome-{validator.project_version()}.zip"

    def tearDown(self):
        validator.DIST = self.original_dist
        self.temp.cleanup()

    def validate(self):
        with contextlib.redirect_stdout(io.StringIO()):
            validator.validate_archives()

    def mutate(self, change):
        with zipfile.ZipFile(self.archive) as archive:
            entries = {name: archive.read(name) for name in archive.namelist()}
        change(entries)
        with zipfile.ZipFile(self.archive, "w") as archive:
            for name, data in entries.items():
                archive.writestr(name, data)

    def test_both_exact_archives_pass(self):
        self.validate()

    def test_zip_bytes_do_not_depend_on_file_timestamps(self):
        source = validator.DIST / "repro-source"
        source.mkdir()
        payload = source / "sample.txt"
        payload.write_bytes(b"identical content\n")
        first, second = validator.DIST / "first.zip", validator.DIST / "second.zip"
        builder.zip_directory(source, first)
        os.utime(payload, (1800000000, 1800000000))
        builder.zip_directory(source, second)
        self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_missing_browser_rejected(self):
        self.archive.unlink()
        with self.assertRaisesRegex(SystemExit, "expected exactly"):
            self.validate()

    def test_stale_archive_rejected(self):
        shutil.copy2(self.archive, validator.DIST / "koalashot-chrome-0.0.1.zip")
        with self.assertRaisesRegex(SystemExit, "expected exactly"):
            self.validate()

    def test_missing_editor_file_rejected(self):
        self.mutate(lambda files: files.pop("editor/editor.js"))
        with self.assertRaisesRegex(SystemExit, "file inventory"):
            self.validate()

    def test_changed_script_rejected(self):
        self.mutate(lambda files: files.update({"editor/editor.js": b"// stale code"}))
        with self.assertRaisesRegex(SystemExit, "source mismatch"):
            self.validate()

    def test_wrong_browser_manifest_rejected(self):
        manifest = (ROOT / "extension/manifests/firefox.json").read_bytes()
        self.mutate(lambda files: files.update({"manifest.json": manifest}))
        with self.assertRaisesRegex(SystemExit, "manifest differs"):
            self.validate()

    def test_development_key_rejected_in_store_archive(self):
        def add_key(files):
            manifest = json.loads(files["manifest.json"])
            manifest["key"] = "test-development-key"
            files["manifest.json"] = json.dumps(manifest).encode()
        self.mutate(add_key)
        with self.assertRaisesRegex(SystemExit, "development-only manifest key"):
            self.validate()

    def test_build_refuses_development_manifest(self):
        source = validator.DIST / "test-source"
        (source / "manifests").mkdir(parents=True)
        (source / "manifests/chrome.json").write_text(json.dumps({
            "version": validator.project_version(), "key": "test-development-key",
        }), encoding="utf-8")
        with patch.object(builder, "EXTENSION", source):
            with self.assertRaisesRegex(SystemExit, "development-only manifest key"):
                builder.build_extension("chrome", validator.project_version())

    def test_unexpected_payload_rejected(self):
        self.mutate(lambda files: files.update({"unexpected.js": b"// extra"}))
        with self.assertRaisesRegex(SystemExit, "file inventory"):
            self.validate()


class ManifestPolicy(unittest.TestCase):
    def test_source_policy_rejects_store_and_privacy_blockers(self):
        original = json.loads((ROOT / "extension/manifests/chrome.json").read_text())
        read = lambda name: (ROOT / "extension" / name).read_bytes()
        validate_manifest(original, "chrome", read)
        mutations = [
            {"host_permissions": ["<all_urls>"]}, {"update_url": "https://example.test/update"},
            {"incognito": "spanning"}, {"name": "__MSG_missing__"}, {"description": "x" * 133},
            {"action": {"default_title": "Capture", "default_popup": "../missing.html"}},
            {"action": {"default_title": "Capture", "default_popup": "missing.html"}},
            {"browser_specific_settings": {}}, {"content_security_policy": {}},
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_manifest({**original, **mutation}, "chrome", read)

    def test_development_payloads_are_rejected(self):
        for name in [".env", "tests/probe.js", "node_modules/lib/index.js", "popup/view.test.js", "secret.pem"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_payload_names([name])


if __name__ == "__main__":
    unittest.main()
