"""Store availability must work without the metadata fetch or JavaScript."""
import importlib.util
import json
import tempfile
import unittest
import sys
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("build", ROOT / "scripts/build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class LandingMetadataTest(unittest.TestCase):
    def test_all_routes_have_resolvable_local_links_and_assets(self):
        class Links(HTMLParser):
            def __init__(self):
                super().__init__()
                self.links = []
            def handle_starttag(self, tag, attrs):
                self.links.extend(value for key, value in attrs if key in ("href", "src") and value)
        for page in (ROOT / "landing").rglob("*.html"):
            parser = Links()
            parser.feed(page.read_text(encoding="utf-8"))
            for value in parser.links:
                url = urlsplit(value)
                if url.scheme or url.netloc or not url.path:
                    continue
                target = ROOT / "landing" / unquote(url.path).lstrip("/") if url.path.startswith("/") else page.parent / unquote(url.path)
                if target.is_dir():
                    target /= "index.html"
                self.assertTrue(target.is_file(), f"{page}: broken link {value}")

    def test_all_store_combinations_render_without_javascript(self):
        for chrome_live, firefox_live in ((False, False), (True, False), (False, True), (True, True)):
            with self.subTest(chrome=chrome_live, firefox=firefox_live), tempfile.TemporaryDirectory(prefix="koalashot-store-test-") as temporary:
                build.LANDING = Path(temporary) / "source"
                build.DIST = Path(temporary) / "output"
                build.copy_tree(ROOT / "landing", build.LANDING)
                stores = {"chrome": "https://chromewebstore.google.com/detail/koalashot/" + "a" * 32 if chrome_live else None, "firefox": "https://addons.mozilla.org/en-US/firefox/addon/koalashot/" if firefox_live else None}
                (build.LANDING / "version.json").write_text(json.dumps({"version": "1.2.3", "stores": stores}), encoding="utf-8")
                build.build_landing()
                for page in (build.DIST / "landing").rglob("*.html"):
                    source = page.read_text(encoding="utf-8")
                    for browser, url in stores.items():
                        self.assertEqual(f'data-store="{browser}" data-review hidden' in source, url is None)
                    self.assertIn('>v1.2.3</span>', source)

    def test_partial_publication_has_static_links_and_independent_status(self):
        with tempfile.TemporaryDirectory(prefix="koalashot-store-test-") as temporary:
            build.LANDING = Path(temporary) / "source"
            build.DIST = Path(temporary) / "output"
            build.copy_tree(ROOT / "landing", build.LANDING)
            chrome = "https://chromewebstore.google.com/detail/koalashot/" + "a" * 32
            metadata = {"version": "0.4.0", "stores": {"chrome": chrome, "firefox": None}}
            (build.LANDING / "version.json").write_text(json.dumps(metadata), encoding="utf-8")
            build.build_landing()
            for path in (build.DIST / "landing").rglob("*.html"):
                source = path.read_text(encoding="utf-8")
                self.assertRegex(source, rf'data-review\s+title="[^"]+"\s+href="{chrome}/reviews"')
                self.assertIn('data-store="firefox" data-review hidden', source)
                self.assertIn('>v0.4.0</span>', source)
            index = (build.DIST / "landing/index.html").read_text(encoding="utf-8")
            self.assertIn('Firefox: official listing link not yet configured.', index)
            self.assertIn(f'href="{chrome}">Get KoalaShot for Chrome', index)

    def test_invalid_store_url_stops_build(self):
        with tempfile.TemporaryDirectory(prefix="koalashot-store-test-") as temporary:
            build.LANDING = Path(temporary) / "source"
            build.DIST = Path(temporary) / "output"
            build.copy_tree(ROOT / "landing", build.LANDING)
            (build.LANDING / "version.json").write_text(json.dumps({"version": "0.4.0", "stores": {"chrome": "https://evil.test/detail/foo"}}), encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "invalid official chrome store URL"):
                build.build_landing()


if __name__ == "__main__":
    unittest.main()
