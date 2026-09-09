import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runUsabilityRegressions } from "./usability-regressions.mjs";

process.env.KOALASHOT_BROWSER = "chrome";
const { ChromeBrowser } = await import("./extension-flow.test.mjs");
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = join(root, ".cache", "usability");
mkdirSync(output, {recursive:true});
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = resolve(root, "." + pathname);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png"};
  response.writeHead(200, {"Content-Type":types[extname(file)] || "application/octet-stream"});
  response.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), "koalashot-usability-"));
const downloads = join(profile, "downloads");mkdirSync(downloads);
const browser = new ChromeBrowser(base, profile, downloads);
try {
  await browser.start();
  const fixture = await browser.open(`${base}/tests/fixtures/basic-long-page.html`, false);
  console.log(JSON.stringify(await runUsabilityRegressions(browser, fixture, output), null, 2));
} finally {
  await browser.stop();
  await new Promise(resolve => server.close(resolve));
}
