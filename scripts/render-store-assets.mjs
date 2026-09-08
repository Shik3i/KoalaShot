// Layout real product captures at the store's upload dimensions. No product UI is fabricated.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const assets = join(root, "store-assets");
const server = createServer((request,response) => {
  const url = new URL(request.url, "http://localhost");
  const path = resolve(root, "." + decodeURIComponent(url.pathname));
  if (!path.startsWith(resolve(root) + sep) || !existsSync(path)) { response.writeHead(404).end(); return; }
  const type = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".json":"application/json", ".png":"image/png" }[extname(path)] || "application/octet-stream";
  response.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"}); response.end(readFileSync(path));
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.KOALASHOT_BROWSER = "chrome";
const { ChromeBrowser } = await import("../tests/browser/extension-flow.test.mjs");
const profile = join(tmpdir(), `koalashot-listing-${Date.now()}`); mkdirSync(join(profile,"downloads"),{recursive:true});
const browser = new ChromeBrowser(base,profile,join(profile,"downloads"),"/store-assets/source/listing.html");
const inventory = [];
try {
  await browser.start();
  for (const engine of ["chrome","firefox"]) {
    const destination = join(assets,engine); mkdirSync(destination,{recursive:true});
    const evidence = JSON.parse(readFileSync(join(assets,"screenshots",`${engine}-capture-evidence.json`)));
    assert.equal(evidence.version,JSON.parse(readFileSync(join(root,"package.json"))).version,"Regenerate source captures after changing versions");
    for (let slide=1;slide<=5;slide++) {
      const page=await browser.open(`${base}/store-assets/source/listing.html?browser=${engine}&slide=${slide}`);
      await browser.setViewport(page,1280,800,1);
      await browser.activate(page);
      try { await browser.wait(page,"document.documentElement.dataset.ready === 'true'"); }
      catch (error) {
        console.error(await browser.evaluate(page,"({text:document.body.innerText,images:[...document.images].map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth})),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,status:r.responseStatus}))})"));
        throw error;
      }
      const file=`Screen_${String(slide).padStart(2,"0")}.png`;
      await browser.captureScreenshot(page,join(destination,file));
      inventory.push({file:`${engine}/${file}`,width:1280,height:800,sourceBrowser:engine});
    }
    copyFileSync(join(root,"extension/icons/icon-128.png"),join(destination,"StoreIcon.png"));
  }
  for (const [kind,width,height,file,legacy] of [["promo",440,280,"SmallAD.png","chrome-small-promo-440x280.png"],["marquee",1400,560,"MarqueePromoTile.png","chrome-marquee-1400x560.png"]]) {
    const page=await browser.open(`${base}/store-assets/source/listing.html?kind=${kind}`);
    await browser.setViewport(page,width,height,1); await browser.activate(page); await browser.wait(page,"document.documentElement.dataset.ready === 'true'");
    await browser.captureScreenshot(page,join(assets,"chrome",file)); copyFileSync(join(assets,"chrome",file),join(assets,legacy));
    inventory.push({file:`chrome/${file}`,width,height});
  }
  writeFileSync(join(assets,"asset-manifest.json"),JSON.stringify({version:JSON.parse(readFileSync(join(root,"package.json"))).version,generatedAt:new Date().toISOString(),screenshots:"Actual packaged UI with separately composed explanatory labels; see screenshots/*-capture-evidence.json for capture scope.",files:inventory},null,2)+"\n");
  console.log(`Prepared ${inventory.length} store images and two store icons in store-assets/chrome and store-assets/firefox.`);
} finally { await browser.stop(); await new Promise(resolve=>server.close(resolve)); }
