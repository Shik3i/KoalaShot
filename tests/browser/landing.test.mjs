import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../dist/landing/", import.meta.url));
const output = fileURLToPath(new URL("../../.cache/website/", import.meta.url));
mkdirSync(output, { recursive: true });
const metadata = JSON.parse(readFileSync(join(root, "version.json")));
let stores = metadata.stores;
let unavailable = false;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/__test_observe_fetch.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end("window.__metadataSettled=false;const originalFetch=window.fetch;window.fetch=(...args)=>originalFetch(...args).finally(()=>{window.__metadataSettled=true})"); return;
  }
  if (url.pathname === "/version.json") {
    response.writeHead(unavailable ? 503 : 200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ...metadata, stores })); return;
  }
  let file = resolve(root, "." + url.pathname + (url.pathname.endsWith("/") ? "index.html" : ""));
  if (!file.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return; }
  const missing = !existsSync(file);
  if (missing) file = join(root, "404.html");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp" };
  response.writeHead(missing ? 404 : 200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  const body = readFileSync(file);
  response.end(extname(file) === ".html" ? body.toString().replace(/<script src=/, '<script src="/__test_observe_fetch.js"></script><script src=') : body);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.KOALASHOT_BROWSER = "chrome";
const { ChromeBrowser } = await import("./extension-flow.test.mjs");
const profile = join(tmpdir(), `koalashot-website-${Date.now()}`);
mkdirSync(join(profile, "downloads"), { recursive: true });
const browser = new ChromeBrowser(base, profile, join(profile, "downloads"));
try {
  await browser.start();
  for (const route of ["/", "/help/", "/privacy/", "/legal/", "/missing/nested/page"]) {
    const page = await browser.open(base + route, false);
    await browser.wait(page, "document.querySelector('[data-app-version]').textContent.length > 1");
    for (const width of [360, 1280]) {
      await browser.setViewport(page, width, 900, 1);
      const state = await browser.evaluate(page, `({width:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelector('h1').textContent,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),help:[...document.links].some(a=>a.pathname==='/help/'),css:[...document.styleSheets].some(s=>s.href?.endsWith('/styles.css'))})`);
      assert.ok(state.scroll <= state.width, JSON.stringify(state));
      assert.deepEqual(state.broken, []);
      assert.ok(state.help && state.css);
      if (route.includes("missing")) assert.equal(state.h1, "Page not found.");
      await browser.captureScreenshot(page, join(output, `${route.replaceAll("/", "_")}-${width}.png`));
    }
  }
  const chrome = "https://chromewebstore.google.com/detail/koalashot/" + "a".repeat(32);
  const firefox = "https://addons.mozilla.org/en-US/firefox/addon/koalashot/";
  for (const sample of [
    { stores: {}, visible: [] },
    { stores: { chrome }, visible: ["chrome"] },
    { stores: { firefox }, visible: ["firefox"] },
    { stores: { chrome, firefox }, visible: ["chrome", "firefox"] },
    { stores: { chrome: "https://evil.test/detail/koalashot/" + "a".repeat(32), firefox: "javascript:alert(1)" }, visible: [] },
    { stores: {}, visible: [], unavailable: true },
  ]) {
    stores = sample.stores; unavailable = Boolean(sample.unavailable);
    const page = await browser.open(base + "/", false);
    // Await the actual metadata request and its microtasks, including the failure branch.
    await browser.wait(page, "window.__metadataSettled === true");
    await browser.evaluate(page, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const links = await browser.evaluate(page, "[...document.querySelectorAll('[data-review]')].filter(a=>!a.hidden).map(a=>({browser:a.dataset.store,href:a.href}))");
    assert.deepEqual(links.map(a => a.browser), sample.visible);
    for (const link of links) assert.equal(link.href, link.browser === "chrome" ? `${chrome}/reviews` : `${firefox}reviews/`);
    assert.equal(await browser.evaluate(page, "document.querySelector('[data-app-version]').textContent"), `v${metadata.version}`);
  }
  console.log("Website: five routes at 360/1280px, nested 404 assets, all store states and failed metadata request passed.");
} finally {
  await browser.stop();
  await new Promise(resolve => server.close(resolve));
}
