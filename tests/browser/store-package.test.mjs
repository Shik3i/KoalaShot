import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
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
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><title>Store package fixture</title><body style="margin:0;background:#abcdef"><h1>Production ZIP capture</h1><div style="height:1800px">Scroll fixture</div></body>');
});
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
  const fixture = await browser.open(`http://127.0.0.1:${server.address().port}/`, false);
  assert.equal(await browser.evaluate(popup, `(async()=>{
    try { await (await import('./capture-controller.js')).captureScreenshot({target:'visible'}); return false; }
    catch { return true; }
  })()`), true, "The production package cannot capture an ungranted page before its action is invoked");
  async function triggerAction(page) {
    await browser.activate(page);
    const url = await browser.evaluate(page, "location.href");
    const { result } = await browser.socket.request("Target.getTargets", { filter: [{ type: "tab" }, { exclude: true }] });
    const actionTab = result.targetInfos.find(info => info.url === url && info.embedderData?.tabActive);
    assert.ok(actionTab, "Find the actual active CDP tab target, not its page target");
    await browser.socket.request("Extensions.triggerAction", { id: browser.extensionId, targetId: actionTab.targetId });
  }
  await triggerAction(fixture);
  const permission = await browser.evaluate(popup, "(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return (await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.title}))[0].result})()");
  assert.equal(permission, "Store package fixture", "Browser action grants real activeTab permission");
  await browser.evaluate(popup, "document.querySelector('#edit-button').click()");
  await browser.wait(popup, "document.body.dataset.phase === 'idle' && !document.querySelector('#result-card').hidden");
  const editor = await browser.findEditor();
  await browser.wait(editor, "document.querySelector('#stage-wrap') && !document.querySelector('#stage-wrap').hidden && !document.querySelector('#save-button').disabled");
  const editorResult = await browser.evaluate(editor, "({url:location.href,meta:document.querySelector('#capture-meta')?.textContent})");
  assert.match(editorResult.url, /capture=/, "Production package opens the captured original in its editor");
  await browser.activate(editor);
  assert.equal(await browser.evaluate(editor, "document.querySelector('#capture-image').naturalHeight > 1800"), true);
  await browser.evaluate(editor, "document.querySelector('#save-button').click()");
  let exported;
  for (let attempt = 0; attempt < 50 && !exported; attempt++) {
    exported = readdirSync(downloads).find(name => name.endsWith("_edited.png"));
    if (!exported) await delay(100);
  }
  assert.ok(exported, "The production editor downloads an actual PNG");
  assert.equal(readFileSync(join(downloads, exported)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const protectedPage = await browser.open("chrome://version/", false);
  await triggerAction(protectedPage);
  const protectedResult = await browser.evaluate(popup, `(async()=>{
    const {captureScreenshot}=await import('./capture-controller.js');
    const explicit=await captureScreenshot({target:'visible'});
    const fallback=await captureScreenshot({target:'page'});
    return {explicit:{width:explicit.width,height:explicit.height,size:explicit.blob.size,warning:explicit.warning},
      fallback:{target:fallback.captureTarget,size:fallback.blob.size,warning:fallback.warning,internal:fallback.canCaptureInternal}};
  })()`);
  assert.ok(protectedResult.explicit.width > 0 && protectedResult.explicit.height > 0 && protectedResult.explicit.size > 1000);
  assert.equal(protectedResult.explicit.warning, "");
  assert.equal(protectedResult.fallback.target, "visible");
  assert.ok(protectedResult.fallback.size > 1000);
  assert.match(protectedResult.fallback.warning, /blocks scrolling access/);
  assert.equal(protectedResult.fallback.internal, false);
  assert.deepEqual(readFileSync(join(browser.extensionPath, "manifest.json")), original);
  console.log(JSON.stringify({ archive, version, extensionId:browser.extensionId, manifestUnchanged:true, popupReady:true,
    testPermissionsAdded:false, activeTabAction:true, captureAndEditor:true, pngExport:true, protectedVisibleCapture:protectedResult }));
} finally {
  await browser.stop();
  await new Promise(resolve => server.close(resolve));
}
