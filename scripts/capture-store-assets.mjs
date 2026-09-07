// Real packaged editor screenshots using repository-owned page content.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const name = process.argv[2] || "chrome";
assert.ok(["chrome", "firefox"].includes(name));
process.env.KOALASHOT_BROWSER = name;
const { ChromeBrowser, FirefoxBrowser } = await import("../tests/browser/extension-flow.test.mjs");
const output = join(root, "store-assets/screenshots");
mkdirSync(output, { recursive: true });
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(readFileSync(join(root, "tests/fixtures/store-demo.html")));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = join(tmpdir(), `koalashot-store-${name}-${Date.now()}`);
mkdirSync(join(profile, "downloads"), { recursive: true });
const browser = new (name === "chrome" ? ChromeBrowser : FirefoxBrowser)(base, profile, join(profile, "downloads"));
async function screenshot(page, suffix) {
  const path = join(output, `${name}-${suffix}.png`);
  await browser.activate(page);
  if (name === "chrome") await browser.captureScreenshot(page, path);
  else {
    // BiDi screenshots reject privileged pages; use Firefox's real tab capture.
    const dataUrl = await browser.evaluate(page, "browser.tabs.captureVisibleTab({format:'png'})");
    writeFileSync(path, Buffer.from(dataUrl.split(",")[1], "base64"));
  }
  const dimensions = await browser.evaluate(page, "({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})");
  console.log(JSON.stringify({ path, ...dimensions }));
}
try {
  await browser.start();
  const fixture = await browser.open(`${base}/tests/fixtures/store-demo.html`);
  // captureVisibleTab uses the real compositor viewport in Chrome. Do not
  // substitute a CDP viewport during the source capture for listing images.
  if (name === "firefox") await browser.setViewport(fixture, 1200, 800, 1);
  const layout = await browser.evaluate(fixture, "({width:innerWidth,card:document.querySelector('.card').getBoundingClientRect().toJSON()})");
  const extensionUrl = name === "chrome" ? `chrome-extension://${browser.extensionId}` : browser.extensionUrl;
  const popup = await browser.open(`${extensionUrl}/popup/popup.html`);
  await browser.wait(popup, "document.documentElement.dataset.koalashotReady === 'true'");
  await browser.activate(fixture);
  // Exercise the primary product action; no original file/clipboard is produced.
  await browser.evaluate(popup, "document.querySelector('#edit-button').click()");
  const editor = await browser.findEditor();
  await browser.wait(editor, "document.querySelector('#capture-image').naturalWidth > 0 && !document.querySelector('#stage-wrap').hidden");
  await browser.setViewport(editor, 1280, 800, 1);
  await browser.evaluate(editor, "document.querySelector('#fit-button').click(); for(let i=0;i<3;i++) document.querySelector('#zoom-out-button').click(); document.querySelector('#stage-scroll').scrollTo(0,0)");
  await browser.wait(editor, "document.querySelector('#editor-keyboard-help').getBoundingClientRect().bottom <= innerHeight");
  await screenshot(editor, "editor-clean");
  const geometry = await browser.evaluate(editor, "(() => { const image=document.querySelector('#capture-image').getBoundingClientRect(),overlay=document.querySelector('#interaction-canvas').getBoundingClientRect();return {left:image.left-overlay.left,top:image.top-overlay.top,width:image.width};})()");
  const scale = geometry.width / layout.width;
  const point = (x,y) => [geometry.left + x*scale, geometry.top + y*scale];
  const card = layout.card;
  await browser.draw(editor, "rectangle", point(card.left-5,card.top-5), point(card.right+5,card.bottom+5));
  await browser.draw(editor, "arrow", point(card.right+190,card.top-85), point(card.right+15,card.top+15));
  await browser.draw(editor, "marker", point(card.left-25,card.top-25), point(card.left-25,card.top-25));
  await browser.evaluate(editor, "document.querySelector('[data-tool=select]').click(); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); document.querySelector('#interaction-canvas').blur()");
  await screenshot(editor, "editor-annotated");
  await browser.setViewport(popup, 1280, 800, 1);
  await screenshot(popup, "popup-capture");
  const count = await browser.evaluate(editor, "document.querySelector('#annotation-list').options.length-1");
  assert.equal(count, 3);
} finally {
  await browser.stop();
  await new Promise(resolve => server.close(resolve));
}
