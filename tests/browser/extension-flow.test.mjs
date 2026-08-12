import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIST = join(ROOT, "dist");
const FIXTURE = "/tests/fixtures/basic-long-page.html";
const INTERNAL_FIXTURE = "/tests/fixtures/internal-scroll-container.html";
const browserName = (process.env.KOALASHOT_BROWSER || "").toLowerCase();

if (!["chrome", "firefox"].includes(browserName)) {
  throw new Error("Set KOALASHOT_BROWSER=chrome or KOALASHOT_BROWSER=firefox.");
}

function assertNotEmpty(value, message) {
  assert.ok(value, message);
  return value;
}

async function waitFor(description, read, predicate = Boolean, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`${description} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

function extensionIdFromPath(extensionPath) {
  const digest = createHash("sha256").update(extensionPath).digest();
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

function evaluatePointerScript(tool, start, end) {
  return `(() => {
    const button = document.querySelector('[data-tool="${tool}"]');
    button.click();
    const canvas = document.querySelector('#interaction-canvas');
    const rect = canvas.getBoundingClientRect();
    const point = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y });
    const first = point(${start[0]}, ${start[1]});
    const last = point(${end[0]}, ${end[1]});
    const init = (p) => ({ ...p, bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    canvas.dispatchEvent(new PointerEvent('pointerdown', init(first)));
    canvas.dispatchEvent(new PointerEvent('pointermove', init(last)));
    canvas.dispatchEvent(new PointerEvent('pointerup', init(last)));
    return { width: rect.width, height: rect.height };
  })()`;
}

function staticServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(`${ROOT}/`) || !existsSync(filePath)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const contentType = filePath.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    response.end(readFileSync(filePath));
  });
  return server;
}

class JsonSocket {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error}: ${message.message || ""}`));
      else pending.resolve(message);
    });
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  request(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (message) => { clearTimeout(timer); resolvePromise(message); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.socket?.close();
  }
}

class ChromeBrowser {
  constructor(baseUrl, profile, downloads) {
    this.baseUrl = baseUrl;
    this.profile = profile;
    this.downloads = downloads;
    this.extensionPath = join(DIST, "chrome");
    this.extensionId = extensionIdFromPath(this.extensionPath);
    this.process = null;
  }

  async start() {
    const executable = process.env.KOALASHOT_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const port = 9322 + Math.floor(Math.random() * 200);
    const headless = process.env.KOALASHOT_CHROME_HEADLESS !== "0";
    this.process = spawn(executable, [
      ...(headless ? ["--headless=new"] : []), "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${this.profile}`, `--load-extension=${this.extensionPath}`, `--disable-extensions-except=${this.extensionPath}`,
      `--remote-debugging-port=${port}`, "--window-size=1280,900", `${this.baseUrl}${FIXTURE}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    await waitFor("Chrome DevTools endpoint", async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        return response.ok ? response.json() : null;
      } catch {
        return null;
      }
    });
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    this.socket = new JsonSocket(version.webSocketDebuggerUrl);
    await this.socket.connect();
    await this.socket.request("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: this.downloads });
  }

  async open(url, background = true) {
    const created = await this.socket.request("Target.createTarget", { url, background });
    const targetId = created.result.targetId;
    const attached = await this.socket.request("Target.attachToTarget", { targetId, flatten: true });
    const page = { targetId, sessionId: attached.result.sessionId };
    await this.wait(page, "document.readyState === 'complete'");
    return page;
  }

  async navigate(page, url) {
    await this.socket.request("Page.navigate", { url }, page.sessionId);
    await this.wait(page, "document.readyState === 'complete'");
  }

  async activate(page) {
    await this.socket.request("Target.activateTarget", { targetId: page.targetId });
  }

  async wait(page, expression) {
    return waitFor("page state", () => this.evaluate(page, expression), Boolean);
  }

  async evaluate(page, expression) {
    const result = await this.socket.request("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, page.sessionId);
    const remote = result.result?.result;
    if (remote?.subtype === "error") throw new Error(remote.description || "Browser evaluation failed.");
    return remote?.value;
  }

  async pages() {
    const result = await this.socket.request("Target.getTargets");
    return result.result.targetInfos.filter((target) => target.type === "page");
  }

  async findEditor() {
    return waitFor("editor tab", async () => {
      const target = (await this.pages()).find((item) => item.url.includes(`chrome-extension://${this.extensionId}/editor/editor.html?capture=`));
      if (!target) return null;
      const attached = await this.socket.request("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      return { targetId: target.targetId, sessionId: attached.result.sessionId };
    });
  }

  async close(page) {
    await this.socket.request("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
  }

  async stop() {
    this.socket?.close();
    this.process?.kill("SIGTERM");
    await delay(300);
  }
}

class FirefoxBrowser {
  constructor(baseUrl, profile, downloads) {
    this.baseUrl = baseUrl;
    this.profile = profile;
    this.downloads = downloads;
    this.process = null;
  }

  async start() {
    writeFileSync(join(this.profile, "user.js"), [
      `user_pref("browser.download.folderList", 2);`,
      `user_pref("browser.download.dir", ${JSON.stringify(this.downloads)});`,
      `user_pref("browser.helperApps.neverAsk.saveToDisk", "image/png,application/octet-stream");`,
      `user_pref("browser.download.manager.showWhenStarting", false);`,
      `user_pref("browser.download.alwaysOpenPanel", false);`,
    ].join("\n"));
    const executable = process.env.KOALASHOT_FIREFOX || "/Applications/Firefox.app/Contents/MacOS/firefox";
    const port = 9522 + Math.floor(Math.random() * 200);
    this.process = spawn(executable, ["--headless", "--no-remote", "--marionette", `--profile`, this.profile, `--remote-debugging-port=${port}`], { stdio: ["ignore", "pipe", "pipe"] });
    await waitFor("Firefox BiDi endpoint", async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        return response.status === 404 || response.ok;
      } catch {
        return false;
      }
    });
    this.socket = new JsonSocket(`ws://127.0.0.1:${port}/session`);
    await this.socket.connect();
    const session = await this.socket.request("session.new", { capabilities: { alwaysMatch: {} } });
    this.sessionId = session.result.sessionId;
    await this.socket.request("webExtension.install", { extensionData: { type: "path", path: join(DIST, "koalashot-firefox-0.2.0.zip"), temporary: true } }, this.sessionId);
    const prefs = readFileSync(join(this.profile, "prefs.js"), "utf8");
    const uuid = prefs.match(/"koalashot@koalastuff\.net":"([^"]+)"/)?.[1];
    assertNotEmpty(uuid, "Firefox did not expose the KoalaShot extension UUID.");
    this.extensionUrl = `moz-extension://${uuid}`;
  }

  async open(url) {
    const created = await this.socket.request("browsingContext.create", { type: "tab" }, this.sessionId);
    const page = { context: created.result.context };
    await this.navigate(page, url);
    return page;
  }

  async navigate(page, url) {
    await this.socket.request("browsingContext.navigate", { context: page.context, url, wait: "complete" }, this.sessionId);
  }

  async activate(page) {
    await this.socket.request("browsingContext.activate", { context: page.context }, this.sessionId);
  }

  async evaluate(page, expression) {
    const result = await this.socket.request("script.evaluate", {
      expression, awaitPromise: true, resultOwnership: "none", target: { context: page.context },
    }, this.sessionId);
    return result.result?.result?.value;
  }

  async wait(page, expression) {
    return waitFor("page state", () => this.evaluate(page, expression), Boolean);
  }

  async findEditor() {
    return waitFor("editor tab", async () => {
      const tree = await this.socket.request("browsingContext.getTree", {}, this.sessionId);
      const contexts = tree.result.contexts || [];
      for (const context of contexts) {
        const page = { context: context.context };
        const url = await this.evaluate(page, "location.href").catch(() => "");
        if (url.includes(`${this.extensionUrl}/editor/editor.html?capture=`)) return page;
      }
      return null;
    });
  }

  async close(page) {
    await this.socket.request("browsingContext.close", { context: page.context }, this.sessionId).catch(() => {});
  }

  async stop() {
    if (this.socket && this.sessionId) await this.socket.request("session.end", {}, this.sessionId).catch(() => {});
    this.socket?.close();
    this.process?.kill("SIGTERM");
    await delay(300);
  }
}

async function readCaptureCount(page) {
  return page.browser.evaluate(page, `new Promise((resolve, reject) => {
    const request = indexedDB.open('koalashot-captures', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('captures', 'readonly');
      const getAll = transaction.objectStore('captures').getAll();
      getAll.onerror = () => reject(getAll.error);
      getAll.onsuccess = () => { resolve(getAll.result.length); request.result.close(); };
    };
  })`);
}

async function runFlow() {
  const server = staticServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const profile = join("/private/tmp", `koalashot-${browserName}-${Date.now()}`);
  const downloads = join(profile, "downloads");
  mkdirSync(downloads, { recursive: true });
  const browser = browserName === "chrome" ? new ChromeBrowser(baseUrl, profile, downloads) : new FirefoxBrowser(baseUrl, profile, downloads);
  let fixture = null;
  let popup = null;
  let editor = null;
  const result = { browser: browserName, clipboard: [], downloads: [] };
  try {
    await browser.start();
    fixture = await browser.open(`${baseUrl}${FIXTURE}`, false);
    await browser.activate(fixture);
    const extensionUrl = browserName === "chrome" ? `chrome-extension://${browser.extensionId}` : browser.extensionUrl;
    popup = await browser.open(`${extensionUrl}/popup/popup.html`);
    await browser.activate(fixture);
    await browser.evaluate(popup, `document.querySelector('#open-editor').checked = false; document.querySelector('#open-editor').dispatchEvent(new Event('change', { bubbles: true }));`);

    await browser.evaluate(popup, "document.querySelector('#copy-button').click()");
    const copyStatus = await waitFor("popup capture and clipboard status", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => /copied|Clipboard permission|Copy failed/i.test(value));
    result.clipboard.push(`popup: ${copyStatus}`);
    assert.match(copyStatus, /copied|Clipboard permission|Copy failed/i);
    await waitFor("page cleanup after popup copy", () => browser.evaluate(fixture, "({ scrollY, className: document.documentElement.className, style: Boolean(document.querySelector('#koalashot-capture-styles')) })"), (state) => state?.scrollY === 0 && !state.className.includes("koalashot-capturing") && !state.style);

    await browser.navigate(fixture, `${baseUrl}${INTERNAL_FIXTURE}`);
    await browser.activate(fixture);
    await browser.evaluate(popup, "document.querySelector('#save-button').click()");
    const internalStatus = await waitFor("internal-scroll rejection", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => /internal scroll area|not supported/i.test(value));
    assert.match(internalStatus, /internal scroll area|not supported/i);
    await waitFor("cleanup after unsupported capture", () => browser.evaluate(fixture, "!document.documentElement.className.includes('koalashot-capturing')"));

    await browser.navigate(fixture, `${baseUrl}${FIXTURE}`);
    await browser.activate(fixture);
    await browser.evaluate(popup, `document.querySelector('#open-editor').checked = true; document.querySelector('#open-editor').dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#save-button').click();`);
    editor = await browser.findEditor();
    editor.browser = browser;
    await browser.wait(editor, "document.querySelector('#stage-wrap') && !document.querySelector('#stage-wrap').hidden && !document.querySelector('#save-button').disabled");
    assert.equal(await browser.evaluate(editor, "document.querySelector('#source-hostname').textContent"), "127.0.0.1");
    assert.equal(await browser.evaluate(editor, "document.querySelector('#capture-image').naturalWidth > 0"), true);

    await browser.evaluate(editor, evaluatePointerScript("rectangle", [80, 80], [260, 210]));
    await browser.evaluate(editor, evaluatePointerScript("redact", [300, 90], [470, 180]));
    await browser.evaluate(editor, `(() => {
      document.querySelector('[data-tool="text"]').click();
      const canvas = document.querySelector('#interaction-canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2, pointerType: 'mouse', isPrimary: true, clientX: rect.left + 90, clientY: rect.top + 240 }));
      const input = document.querySelector('#text-input');
      input.value = 'Browser regression note';
      document.querySelector('#apply-text-button').click();
    })()`);
    await waitFor("annotation draft persistence", () => readCaptureCount(editor), (count) => count === 1);
    const annotationCount = await browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('captures').objectStore('captures').getAll(); getAll.onsuccess = () => { resolve(getAll.result[0]?.annotations?.length || 0); request.result.close(); }; };
    })`);
    assert.equal(annotationCount, 3);

    await browser.evaluate(editor, "document.querySelector('#save-button').click()");
    const editorSaveStatus = await waitFor("edited PNG save", () => browser.evaluate(editor, "document.querySelector('#status').textContent"), (value) => /save started/i.test(value));
    assert.match(editorSaveStatus, /save started/i);
    await browser.evaluate(editor, "document.querySelector('#copy-button').click()");
    const editorCopyStatus = await waitFor("edited clipboard status", () => browser.evaluate(editor, "document.querySelector('#status').textContent"), (value) => /copied|Copy failed|permission/i.test(value));
    result.clipboard.push(`editor: ${editorCopyStatus}`);

    const beforeUndo = await browser.evaluate(editor, "document.querySelector('#undo-button').disabled");
    assert.equal(beforeUndo, false);
    await browser.evaluate(editor, "document.querySelector('#undo-button').click(); document.querySelector('#redo-button').click();");
    await browser.evaluate(editor, "document.querySelector('#zoom-in-button').click(); document.querySelector('#zoom-out-button').click(); document.querySelector('#actual-size-button').click(); document.querySelector('#fit-button').click();");
    assert.match(await browser.evaluate(editor, "document.querySelector('#zoom-value').textContent"), /%$/);

    const persistedBeforeReload = await readCaptureCount(editor);
    assert.equal(persistedBeforeReload, 1);
    const editorUrl = await browser.evaluate(editor, "location.href");
    await browser.navigate(editor, editorUrl);
    await browser.wait(editor, "document.querySelector('#stage-wrap') && !document.querySelector('#stage-wrap').hidden");
    const persistedAfterReload = await browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('captures').objectStore('captures').getAll(); getAll.onsuccess = () => { resolve(getAll.result[0]?.annotations?.length || 0); request.result.close(); }; };
    })`);
    assert.equal(persistedAfterReload, 3);

    await browser.evaluate(editor, `(() => {
      const canvas = document.querySelector('#interaction-canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: rect.left + 120, clientY: rect.top + 120 }));
      document.querySelector('#delete-button').click();
    })()`);
    await delay(800);
    await browser.evaluate(editor, "document.querySelector('#clear-button').click()");
    await delay(800);
    const afterClear = await readCaptureCount(editor);
    assert.equal(afterClear, 1);
    const annotationsAfterClear = await browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('captures').objectStore('captures').getAll(); getAll.onsuccess = () => { resolve(getAll.result[0]?.annotations?.length || 0); request.result.close(); }; };
    })`);
    assert.equal(annotationsAfterClear, 0);

    await browser.evaluate(editor, "document.querySelector('#discard-button').click()");
    await delay(800);
    assert.equal(await readCaptureCount(editor), 0);
    result.downloads = readdirSync(downloads).filter((name) => name.endsWith(".png"));
    assert.ok(result.downloads.length >= 2, `Expected popup and editor PNG downloads, found ${result.downloads.length}`);
    return result;
  } finally {
    if (editor) await browser.close(editor);
    if (popup) await browser.close(popup);
    if (fixture) await browser.close(fixture);
    await browser.stop();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

const result = await runFlow();
console.log(JSON.stringify(result, null, 2));
