"""Mutate copies of built ZIPs; the gate must reject missing, stale and altered payloads."""
import contextlib
import importlib.util
import io
import shutil
import tempfile
import sys
import os
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
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

    def test_unexpected_payload_rejected(self):
        self.mutate(lambda files: files.update({"unexpected.js": b"// extra"}))
        with self.assertRaisesRegex(SystemExit, "file inventory"):
            self.validate()


if __name__ == "__main__":
    unittest.main()
