import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("assets", Path(__file__).resolve().parents[1] / "scripts/release_assets.py")
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class ReleaseAssetsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="koalashot-assets-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        for name in assets.asset_names("1.2.3"):
            with zipfile.ZipFile(self.directory / name, "w") as archive:
                if "landing" in name:
                    for member in ("index.html", "help/index.html", "privacy/index.html", "legal/index.html", "404.html", "_headers"):
                        archive.writestr(member, "fixture")
                    archive.writestr("version.json", json.dumps({"version": "1.2.3"}))
                else:
                    for member in ("popup/popup.html", "editor/editor.html"):
                        archive.writestr(member, "fixture")
                    for member in ("manifest.json", "common/product.json"):
                        archive.writestr(member, json.dumps({"version": "1.2.3"}))
        assets.write_checksums(self.directory, "1.2.3")

    def test_portable_checksums_and_zip_contents(self):
        assets.verify(self.directory, "1.2.3")

    def test_prefixed_missing_duplicate_or_extra_checksum_rejected(self):
        path = self.directory / "SHA256SUMS"
        original = path.read_text()
        for text in (original.replace("  koalashot", "  dist/koalashot"), "\n".join(original.splitlines()[1:]), original + original.splitlines()[0] + "\n", original.replace("chrome-1.2.3", "extra-1.2.3")):
            with self.subTest(text=text):
                path.write_text(text)
                with self.assertRaises(ValueError):
                    assets.verify(self.directory, "1.2.3")

    def test_modified_download_rejected(self):
        path = self.directory / assets.asset_names("1.2.3")[0]
        path.write_bytes(path.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
            assets.verify(self.directory, "1.2.3")

    def test_archive_version_mismatch_even_with_valid_hash(self):
        with zipfile.ZipFile(self.directory / assets.asset_names("1.2.3")[0], "w") as archive:
            archive.writestr("manifest.json", '{"version":"9.9.9"}')
        assets.write_checksums(self.directory, "1.2.3")
        with self.assertRaisesRegex(ValueError, "Archive version mismatch"):
            assets.verify(self.directory, "1.2.3")

    def test_unsafe_member_rejected(self):
        with zipfile.ZipFile(self.directory / assets.asset_names("1.2.3")[0], "a") as archive:
            archive.writestr("../escape", "bad")
        assets.write_checksums(self.directory, "1.2.3")
        with self.assertRaisesRegex(ValueError, "Unsafe or duplicate"):
            assets.verify(self.directory, "1.2.3")

    def test_remote_assets_must_match_local_verified_bytes(self):
        expected = self.directory / "expected"
        expected.mkdir()
        for name in assets.asset_names("1.2.3"):
            (expected / name).write_bytes(b"different-build")
        with self.assertRaisesRegex(ValueError, "Uploaded bytes differ"):
            assets.verify(self.directory, "1.2.3", expected)


if __name__ == "__main__":
    unittest.main()
