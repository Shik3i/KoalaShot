import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.KOALASHOT_BROWSER = "chrome";
const { ChromeBrowser } = await import("./extension-flow.test.mjs");
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const version = JSON.parse(readFileSync(join(root, "package.json"))).version;
const profile = mkdtempSync(join(tmpdir(), "koalashot-store-package-"));
const unpacked = join(profile, "original-zip");
const downloads = join(profile, "downloads");
mkdirSync(downloads);
const archive = resolve(process.env.KOALASHOT_STORE_ZIP || join(root, "dist", `koalashot-chrome-${version}.zip`));
execFileSync(process.execPath, [join(root, "scripts/run-python.cjs"), "-m", "zipfile", "-e", archive, unpacked]);
const original = readFileSync(join(unpacked, "manifest.json"));
const manifest = JSON.parse(original);
assert.equal(Object.hasOwn(manifest, "key"), false);
assert.equal(Object.hasOwn(manifest, "host_permissions"), false);
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
const server = createServer((_request, response) => response.end("Store package smoke fixture"));
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = new ChromeBrowser(`http://127.0.0.1:${server.address().port}`, profile, downloads, "/", { storePackagePath: unpacked });
try {
  await browser.start();
  assert.deepEqual(readFileSync(join(browser.extensionPath, "manifest.json")), original, "Chrome must load the unmodified ZIP manifest");
  const popup = await browser.open(`chrome-extension://${browser.extensionId}/popup/popup.html`, false);
  await browser.wait(popup, "document.documentElement.dataset.koalashotReady === 'true'");
  const loaded = await browser.evaluate(popup, "({manifest:chrome.runtime.getManifest(),ready:!document.querySelector('#edit-button').disabled,lang:document.documentElement.lang})");
  assert.equal(loaded.manifest.version, version);
  assert.equal(Object.hasOwn(loaded.manifest, "key"), false);
  assert.deepEqual(loaded.manifest.permissions, manifest.permissions);
  assert.equal(loaded.ready, true);
  assert.equal(loaded.lang, "en");
  console.log(JSON.stringify({ archive, version, extensionId:browser.extensionId, manifestUnchanged:true, popupReady:true, testPermissionsAdded:false }));
} finally {
  await browser.stop();
  await new Promise(resolve => server.close(resolve));
}
