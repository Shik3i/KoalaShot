import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIST = join(ROOT, "dist");
const FIXTURE = "/tests/fixtures/basic-long-page.html";
const INTERNAL_FIXTURE = "/tests/fixtures/internal-scroll-container.html";
const browserName = (process.env.KOALASHOT_BROWSER || "").toLowerCase();
const clipboardDenialMode = process.env.KOALASHOT_CLIPBOARD_DENIAL === "1";

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
  let lastValue;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      lastValue = value;
      if (predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const observed = lastValue === undefined ? "" : `; last value: ${JSON.stringify(lastValue)}`;
  throw new Error(`${description} timed out${lastError ? `: ${lastError.message}` : ""}${observed}`);
}

function runProcess(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
}

function firstExisting(override, candidates) {
  return override || candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function playwrightChromiumCandidates() {
  const roots = process.platform === "win32"
    ? [join(process.env.LOCALAPPDATA || "", "ms-playwright")]
    : process.platform === "darwin"
      ? [join(homedir(), "Library", "Caches", "ms-playwright"), join(homedir(), ".cache", "ms-playwright")]
      : [join(homedir(), ".cache", "ms-playwright")];
  const executablePaths = process.platform === "win32"
    ? [["chrome-win64", "chrome.exe"]]
    : process.platform === "darwin"
      ? [
          ["chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
          ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
        ]
      : [["chrome-linux64", "chrome"], ["chrome-linux", "chrome"]];
  return roots.flatMap((root) => {
    if (!existsSync(root)) {
      return [];
    }
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
      .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))
      .flatMap((entry) => executablePaths.map((parts) => join(root, entry.name, ...parts)));
  });
}

function extensionIdFromManifestKey(key) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16);
  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

function evaluatePointerScript(tool, start, end) {
  return `(() => {
    document.querySelector('[data-tool="${tool}"]').click();
    const canvas = document.querySelector('#interaction-canvas');
    const rect = canvas.getBoundingClientRect();
    const point = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y });
    const first = point(${start[0]}, ${start[1]});
    const last = point(${end[0]}, ${end[1]});
    const init = (p) => ({ ...p, bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    canvas.dispatchEvent(new PointerEvent('pointerdown', init(first)));
    canvas.dispatchEvent(new PointerEvent('pointermove', init(last)));
    canvas.dispatchEvent(new PointerEvent('pointerup', init(last)));
  })()`;
}

function decodeBiDiValue(remote) {
  if (!remote || typeof remote !== "object") return remote;
  if (["undefined", "null"].includes(remote.type)) return remote.type === "null" ? null : undefined;
  if (["string", "number", "boolean", "bigint"].includes(remote.type)) return remote.value;
  if (remote.type === "array") return (remote.value || []).map(decodeBiDiValue);
  if (remote.type === "object") return Object.fromEntries((remote.value || []).map(([key, value]) => [key, decodeBiDiValue(value)]));
  return remote.value;
}

function chromeExecutable() {
  if (process.platform === "win32") {
    return firstExisting(process.env.KOALASHOT_CHROME, [
      ...playwrightChromiumCandidates(),
      join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    ]);
  }
  return firstExisting(process.env.KOALASHOT_CHROME, process.platform === "darwin"
    ? [...playwrightChromiumCandidates(), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : [...playwrightChromiumCandidates(), "google-chrome", "chromium", "chromium-browser"]);
}

function firefoxExecutable() {
  if (process.platform === "win32") {
    return firstExisting(process.env.KOALASHOT_FIREFOX, [
      join(process.env.ProgramFiles || "C:\\Program Files", "Mozilla Firefox", "firefox.exe"),
      join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Mozilla Firefox", "firefox.exe"),
    ]);
  }
  return firstExisting(process.env.KOALASHOT_FIREFOX, process.platform === "darwin"
    ? ["/Applications/Firefox.app/Contents/MacOS/firefox"]
    : ["firefox"]);
}

function staticServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const filePath = resolve(ROOT, `.${pathname}`);
    const relativePath = relative(ROOT, filePath);
    const outsideRoot = !relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
    if (outsideRoot || !existsSync(filePath)) {
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
      if (message.error) pending.reject(new Error(`${pending.method}${pending.sessionId ? ` [${pending.sessionId}]` : ""} ${typeof message.error === "string" ? message.error : JSON.stringify(message.error)}: ${message.message || ""}`));
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
        method,
        sessionId,
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
  constructor(baseUrl, profile, downloads, initialPath = FIXTURE) {
    this.baseUrl = baseUrl;
    this.profile = profile;
    this.downloads = downloads;
    this.initialPath = initialPath;
    this.extensionPath = join(DIST, "chrome");
    this.extensionId = extensionIdFromManifestKey(JSON.parse(readFileSync(join(this.extensionPath, "manifest.json"), "utf8")).key);
    this.process = null;
  }

  async start() {
    this.extensionPath = join(this.profile, "koalashot-chrome");
    cpSync(join(DIST, "chrome"), this.extensionPath, { recursive: true });
    const testManifestPath = join(this.extensionPath, "manifest.json");
    const testManifest = JSON.parse(readFileSync(testManifestPath, "utf8"));
    testManifest.host_permissions = ["<all_urls>"];
    testManifest.permissions = [...new Set([...(testManifest.permissions || []), "tabs", ...(clipboardDenialMode ? [] : ["clipboardWrite"])])];
    if (!clipboardDenialMode) {
      testManifest.optional_permissions = (testManifest.optional_permissions || []).filter((permission) => permission !== "clipboardWrite");
    }
    writeFileSync(testManifestPath, `${JSON.stringify(testManifest, null, 2)}\n`);
    const executable = chromeExecutable();
    const port = 9322 + Math.floor(Math.random() * 200);
    this.debugPort = port;
    const headless = process.env.KOALASHOT_CHROME_HEADLESS !== "0";
    this.process = spawn(executable, [
      ...(headless ? ["--headless=new"] : []), "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${this.profile}`, `--load-extension=${this.extensionPath}`, `--disable-extensions-except=${this.extensionPath}`,
      `--remote-debugging-port=${port}`, "--window-size=1280,900", `${this.baseUrl}${this.initialPath}`,
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
    await this.socket.request("Browser.grantPermissions", {
      origin: `chrome-extension://${this.extensionId}`,
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });
  }

  async open(url, background = true, newWindow = false) {
    const created = await this.socket.request("Target.createTarget", { url, background, newWindow });
    const targetId = created.result.targetId;
    const attached = await this.socket.request("Target.attachToTarget", { targetId, flatten: true });
    const page = { targetId, sessionId: attached.result.sessionId };
    await this.wait(page, "document.readyState === 'complete'");
    return page;
  }

  async navigate(page, url) {
    await (page.socket || this.socket).request("Page.navigate", { url }, page.sessionId);
    await this.wait(page, "document.readyState === 'complete'");
  }

  async lockViewport(page) {
    await this.socket.request("Emulation.setDeviceMetricsOverride", {
      width: 1262,
      height: 804,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1262,
      screenHeight: 804,
    }, page.sessionId);
  }

  async setViewport(page, width, height) {
    await (page.socket || this.socket).request("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    }, page.socket ? undefined : page.sessionId);
  }

  async activate(page) {
    await this.socket.request("Target.activateTarget", { targetId: page.targetId });
  }

  async wait(page, expression) {
    return waitFor("page state", () => this.evaluate(page, expression), Boolean);
  }

  async draw(page, tool, start, end) {
    return this.evaluate(page, evaluatePointerScript(tool, start, end));
  }

  async evaluate(page, expression) {
    let result;
    if (page.socket) {
      result = await page.socket.request("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      const remote = result.result?.result;
      if (remote?.subtype === "error") throw new Error(remote.description || "Browser evaluation failed.");
      return remote?.value;
    }
    try {
      result = await this.socket.request("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, page.sessionId);
    } catch (error) {
      if (!error.message.includes("Session with given id not found")) {
        throw error;
      }
      const attached = await this.socket.request("Target.attachToTarget", { targetId: page.targetId, flatten: true });
      page.sessionId = attached.result.sessionId;
      result = await this.socket.request("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, page.sessionId);
    }
    const remote = result.result?.result;
    if (remote?.subtype === "error") throw new Error(remote.description || "Browser evaluation failed.");
    return remote?.value;
  }

  async pages() {
    const result = await this.socket.request("Target.getTargets");
    return result.result.targetInfos.filter((target) => target.type === "page");
  }

  async existing(url) {
    const target = await waitFor("existing Chrome page", async () => (await this.pages()).find((item) => item.url === url) || null);
    const attached = await this.socket.request("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const page = { targetId: target.targetId, sessionId: attached.result.sessionId };
    await this.wait(page, "document.readyState === 'complete'");
    return page;
  }

  async findEditor() {
    return waitFor("editor tab", async () => {
      const targets = await this.pages();
      const target = targets.find((item) => item.url.includes(`/editor/editor.html?capture=`));
      if (!target) return { observedTargets: targets.map(({ type, url }) => ({ type, url })) };
      const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/list`);
      const descriptors = response.ok ? await response.json() : [];
      const descriptor = descriptors.find((item) => item.id === target.targetId && item.webSocketDebuggerUrl);
      if (!descriptor) return null;
      const socket = new JsonSocket(descriptor.webSocketDebuggerUrl);
      await socket.connect();
      const page = { targetId: target.targetId, socket };
      try {
        const state = await socket.request("Runtime.evaluate", {
          expression: "document.readyState",
          returnByValue: true,
        });
        if (state.result?.result?.value !== "complete") {
          socket.close();
          return null;
        }
      } catch (error) {
        socket.close();
        throw error;
      }
      return page;
    }, (value) => Boolean(value?.socket));
  }

  async close(page) {
    await this.socket.request("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
    page.socket?.close();
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
    this.extensionUuid = "00000000-0000-4000-8000-000000000001";
    this.extensionArchive = join(profile, "koalashot-firefox-test.zip");
    this.process = null;
  }

  async start() {
    writeFileSync(join(this.profile, "user.js"), [
      `user_pref("browser.download.folderList", 2);`,
      `user_pref("browser.download.dir", ${JSON.stringify(this.downloads)});`,
      `user_pref("browser.helperApps.neverAsk.saveToDisk", "image/png,application/octet-stream");`,
      `user_pref("browser.download.manager.showWhenStarting", false);`,
      `user_pref("browser.download.alwaysOpenPanel", false);`,
      `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ "koalashot@koalastuff.net": this.extensionUuid }))});`,
    ].join("\n"));
    const executable = firefoxExecutable();
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
    await runProcess(process.execPath, [
      join(ROOT, "scripts", "run-python.cjs"),
      join(ROOT, "scripts", "create-firefox-test-archive.py"),
      join(DIST, "firefox"),
      this.extensionArchive,
      ...(clipboardDenialMode ? [] : ["--grant-clipboard"]),
    ]);
    const installation = await this.socket.request("webExtension.install", { extensionData: { type: "archivePath", path: this.extensionArchive } }, this.sessionId);
    const uuid = installation.result?.extension;
    assertNotEmpty(uuid, "Firefox did not expose the KoalaShot extension UUID.");
    this.extensionUrl = `moz-extension://${this.extensionUuid}`;
  }

  async open(url) {
    const created = await this.socket.request("browsingContext.create", { type: "tab" }, this.sessionId);
    const page = { context: created.result.context };
    await this.navigate(page, url);
    return page;
  }

  async navigate(page, url) {
    try {
      await this.socket.request("browsingContext.navigate", { context: page.context, url, wait: "none" }, this.sessionId);
    } catch (error) {
      if (!error.message.includes("NS_ERROR_NOT_AVAILABLE")) {
        throw error;
      }
      await delay(250);
      try {
        await this.socket.request("browsingContext.navigate", { context: page.context, url, wait: "none" }, this.sessionId);
      } catch (retryError) {
        if (!retryError.message.includes("NS_ERROR_NOT_AVAILABLE")) throw retryError;
      }
      await waitFor("Firefox fallback navigation", () => this.evaluate(page, "({ href: location.href, readyState: document.readyState })"), (state) => state?.href === url && state?.readyState === "complete");
      return;
    }
    await this.wait(page, "document.readyState === 'complete'");
  }

  async activate(page) {
    await this.socket.request("browsingContext.activate", { context: page.context }, this.sessionId);
  }

  async setViewport(page, width, height) {
    await this.socket.request("browsingContext.setViewport", {
      context: page.context,
      viewport: { width, height },
      devicePixelRatio: 1,
    }, this.sessionId);
  }

  async evaluate(page, expression) {
    const result = await this.socket.request("script.evaluate", {
      expression, awaitPromise: true, resultOwnership: "none", target: { context: page.context },
    }, this.sessionId);
    return decodeBiDiValue(result.result?.result);
  }

  async wait(page, expression) {
    return waitFor("page state", () => this.evaluate(page, expression), Boolean);
  }

  async draw(page, tool, start, end) {
    await this.evaluate(page, `document.querySelector('[data-tool="${tool}"]').click()`);
    const rect = await this.evaluate(page, "document.querySelector('#interaction-canvas').getBoundingClientRect().toJSON()");
    const point = (coordinates) => ({ x: Math.round(rect.left + coordinates[0]), y: Math.round(rect.top + coordinates[1]) });
    const first = point(start);
    const last = point(end);
    try {
      await this.socket.request("input.performActions", {
        context: page.context,
        actions: [{
          type: "pointer",
          id: "koalashot-mouse",
          parameters: { pointerType: "mouse" },
          actions: [
            { type: "pointerMove", x: first.x, y: first.y, duration: 0 },
            { type: "pointerDown", button: 0 },
            { type: "pointerMove", x: last.x, y: last.y, duration: 50 },
            { type: "pointerUp", button: 0 },
          ],
        }],
      }, this.sessionId);
    } finally {
      await this.socket.request("input.releaseActions", { context: page.context }, this.sessionId).catch(() => {});
    }
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

async function runFlow() {
  const server = staticServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const profile = join(tmpdir(), `koalashot-${browserName}-${Date.now()}`);
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
    if (browserName === "chrome") await browser.lockViewport(fixture);
    await browser.activate(fixture);
    popup = browserName === "chrome" ? await browser.open(`chrome-extension://${browser.extensionId}/popup/popup.html`, false) : await browser.open(`${browser.extensionUrl}/popup/popup.html`);
    await waitFor("extension popup page", () => browser.evaluate(popup, "({ href: location.href, readyState: document.readyState, body: document.body?.innerText || '', ready: document.documentElement.dataset.koalashotReady === 'true' })"), (state) => state?.body.includes("Capture this page") && state.ready);
    popup.browser = browser;
    const popupState = await browser.evaluate(popup, "({ href: location.href, readyState: document.readyState, body: document.body?.innerText || '', markup: document.documentElement?.outerHTML.slice(0, 300) || '' })");
    assert.ok(popupState?.body.includes("Capture this page"), `Popup did not load (extensionId=${browser.extensionId || "n/a"}): ${JSON.stringify(popupState)}`);
    await browser.activate(fixture);
    await browser.evaluate(popup, "document.querySelector('#open-editor').checked = false; document.querySelector('#open-editor').dispatchEvent(new Event('change', { bubbles: true }));");

    const firstAction = clipboardDenialMode ? "copy-button" : browserName === "chrome" ? "save-button" : "copy-button";
    await browser.evaluate(popup, `document.querySelector('#${firstAction}').click()`);
    const firstCaptureStatus = await waitFor("popup capture status", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => clipboardDenialMode
      ? /Save the completed capture below/i.test(value)
      : browserName === "chrome" ? /PNG save started/i.test(value) : /Full-page screenshot copied/i.test(value));
    if (clipboardDenialMode) {
      assert.match(firstCaptureStatus, /Save the completed capture below/i);
      assert.equal(await browser.evaluate(popup, "!document.querySelector('#save-result-button').hidden"), true);
      await browser.evaluate(popup, "document.querySelector('#save-result-button').click()");
      assert.match(await waitFor("completed capture fallback save", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => /Captured PNG save started/i.test(value)), /Captured PNG save started/i);
      await waitFor("page cleanup after fallback capture", () => browser.evaluate(fixture, "({ scrollY, className: document.documentElement.className, style: Boolean(document.querySelector('#koalashot-capture-styles')) })"), (state) => state?.scrollY === 0 && !state.className.includes("koalashot-capturing") && !state.style);
      result.downloads = await waitFor("fallback PNG download", () => readdirSync(downloads).filter((name) => name.endsWith(".png")), (files) => files.length >= 1);
      return result;
    }
    if (browserName === "chrome") assert.match(firstCaptureStatus, /PNG save started/i);
    else {
      assert.match(firstCaptureStatus, /Full-page screenshot copied/i);
      result.clipboard.push(`popup: ${firstCaptureStatus}`);
    }
    await waitFor("page cleanup after popup capture", () => browser.evaluate(fixture, "({ scrollY, className: document.documentElement.className, style: Boolean(document.querySelector('#koalashot-capture-styles')) })"), (state) => state?.scrollY === 0 && !state.className.includes("koalashot-capturing") && !state.style);

    await browser.navigate(fixture, `${baseUrl}${INTERNAL_FIXTURE}`);
    if (browserName === "chrome") await browser.lockViewport(fixture);
    await browser.activate(fixture);
    await browser.evaluate(popup, "document.querySelector('#capture-target').value = 'page'; document.querySelector('#capture-target').dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#save-button').click()");
    const internalStatus = await waitFor("internal-scroll rejection", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => /scrollable area inside|internal scroll area|not supported/i.test(value));
    assert.match(internalStatus, /scrollable area inside|internal scroll area|not supported/i);
    await waitFor("cleanup after unsupported capture", () => browser.evaluate(fixture, "!document.documentElement.className.includes('koalashot-capturing')"));
    await browser.evaluate(popup, "document.querySelector('#capture-target').value = 'internal'; document.querySelector('#capture-target').dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#save-button').click()");
    const internalCaptureStatus = await waitFor("internal-scroll capture", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => /PNG save started/i.test(value));
    assert.match(internalCaptureStatus, /PNG save started/i);
    await waitFor("internal area cleanup after capture", () => browser.evaluate(fixture, "({ scrollTop: document.querySelector('.scroll-root').scrollTop, className: document.documentElement.className, style: Boolean(document.querySelector('#koalashot-capture-styles')) })"), (state) => state?.scrollTop === 0 && !state.className.includes("koalashot-capturing") && !state.style);

    await browser.navigate(fixture, `${baseUrl}${FIXTURE}`);
    if (browserName === "chrome") await browser.lockViewport(fixture);
    await browser.activate(fixture);
    await browser.evaluate(popup, "document.querySelector('#capture-target').value = 'page'; document.querySelector('#capture-target').dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#open-editor').checked = true; document.querySelector('#open-editor').dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#save-button').click()");
    const editorTriggerStatus = await waitFor("editor trigger", () => browser.evaluate(popup, "document.querySelector('#status').textContent"), (value) => /Editor opened|save failed|could not|failed/i.test(value));
    assert.match(editorTriggerStatus, /Editor opened/i, `Editor trigger status: ${editorTriggerStatus}`);
    editor = await browser.findEditor();
    await delay(300);
    editor.browser = browser;
    await browser.activate(editor);
    await browser.setViewport(editor, 1400, 1100);
    await browser.wait(editor, "document.querySelector('#stage-wrap') && !document.querySelector('#stage-wrap').hidden && !document.querySelector('#save-button').disabled");
    assert.equal(await browser.evaluate(editor, "document.querySelector('#source-hostname').textContent"), "127.0.0.1");
    assert.equal(await browser.evaluate(editor, "document.querySelector('#capture-image').naturalWidth > 0"), true);

    await browser.draw(editor, "rectangle", [80, 80], [260, 210]);
    await browser.draw(editor, "redact", [300, 90], [470, 180]);
    await browser.draw(editor, "ellipse", [500, 90], [680, 190]);
    await browser.draw(editor, "pixelate", [80, 230], [260, 330]);
    await browser.draw(editor, "blur", [300, 230], [470, 330]);
    await browser.draw(editor, "marker", [520, 250], [520, 250]);
    await browser.draw(editor, "text", [90, 240], [90, 240]);
    await browser.evaluate(editor, `(() => {
      document.querySelector('#text-input').value = 'Browser regression note';
      document.querySelector('#apply-text-button').click();
    })()`);
    await waitFor("immediate annotation draft persistence", () => browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('drafts').objectStore('drafts').getAll(); getAll.onsuccess = () => { resolve({ count: getAll.result[0]?.annotations?.length || 0, status: document.querySelector('#status').textContent }); request.result.close(); }; };
    })`), (state) => state?.count === 7, 15_000);
    await browser.activate(editor);
    await browser.draw(editor, "crop", [45, 45], [700, 500]);
    const cropInteraction = await browser.evaluate(editor, `(() => {
      const rect = document.querySelector('#interaction-canvas').getBoundingClientRect();
      return {
        applyDisabled: document.querySelector('#apply-crop-button').disabled,
        canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight }
      };
    })()`);
    assert.equal(cropInteraction.applyDisabled, false, `Crop pointer interaction failed: ${JSON.stringify(cropInteraction)}`);
    await browser.evaluate(editor, "document.querySelector('#apply-crop-button').click()");
    const annotationCount = await waitFor("annotation draft persistence", () => browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('drafts').objectStore('drafts').getAll(); getAll.onsuccess = () => { resolve({ count: getAll.result[0]?.annotations?.length || 0, crop: getAll.result[0]?.crop || null, status: document.querySelector('#status').textContent, metadata: document.querySelector('#capture-meta').textContent }); request.result.close(); }; };
    })`), (state) => state?.count === 7 && state.crop?.width > 0 && state.crop?.height > 0, 15_000);
    assert.equal(annotationCount.count, 7);
    assert.ok(annotationCount.crop.width > 0);

    await browser.evaluate(editor, "document.querySelector('#save-button').click()");
    const editorSaveStatus = await waitFor("edited PNG save", () => browser.evaluate(editor, "document.querySelector('#status').textContent"), (value) => /save started/i.test(value));
    assert.match(editorSaveStatus, /save started/i);
    await browser.evaluate(editor, "document.querySelector('#copy-button').click()");
    const editorCopyStatus = await waitFor("edited clipboard status", () => browser.evaluate(editor, "document.querySelector('#status').textContent"), (value) => /copied|Copy failed|permission/i.test(value));
    const clipboardDiagnostics = /Edited screenshot copied/i.test(editorCopyStatus) ? null : await browser.evaluate(editor, `(async () => {
      let permission = "unavailable";
      let textWrite = "not-run";
      let imageWrite = "not-run";
      try { permission = (await navigator.permissions.query({ name: "clipboard-write" })).state; } catch (error) { permission = error.message; }
      try { await navigator.clipboard.writeText("KoalaShot clipboard smoke test"); textWrite = "ok"; } catch (error) { textWrite = error.message; }
      try {
        const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); imageWrite = "ok";
      } catch (error) { imageWrite = error.message; }
      const image = document.querySelector("#capture-image");
      return { hasFocus: document.hasFocus(), visibility: document.visibilityState, secure: isSecureContext, permission, clipboardWrite: typeof navigator.clipboard?.write, clipboardItem: typeof ClipboardItem, textWrite, imageWrite, imageSize: [image?.naturalWidth, image?.naturalHeight] };
    })()`);
    assert.match(editorCopyStatus, /Edited screenshot copied/i, `Clipboard diagnostics: ${JSON.stringify(clipboardDiagnostics)}`);
    result.clipboard.push(`editor: ${editorCopyStatus}`);

    assert.equal(await browser.evaluate(editor, "document.querySelector('#undo-button').disabled"), false);
    await browser.evaluate(editor, "document.querySelector('#undo-button').click(); document.querySelector('#redo-button').click(); document.querySelector('#zoom-in-button').click(); document.querySelector('#zoom-out-button').click(); document.querySelector('#actual-size-button').click(); document.querySelector('#fit-button').click();");
    assert.match(await browser.evaluate(editor, "document.querySelector('#zoom-value').textContent"), /%$/);

    const editorUrl = await browser.evaluate(editor, "location.href");
    await browser.navigate(editor, editorUrl);
    await browser.wait(editor, "document.querySelector('#stage-wrap') && !document.querySelector('#stage-wrap').hidden");
    assert.equal(await browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('drafts').objectStore('drafts').getAll(); getAll.onsuccess = () => { resolve(getAll.result[0]?.annotations?.length || 0); request.result.close(); }; };
    })`), 7);

    await browser.setViewport(editor, 390, 844);
    const narrowLayout = await waitFor("responsive editor layout", () => browser.evaluate(editor, `({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      headerWidth: document.querySelector('.editor-header').getBoundingClientRect().width,
      sidebarOverflow: getComputedStyle(document.querySelector('.tool-sidebar')).overflowX,
      stageHeight: document.querySelector('.stage-panel').getBoundingClientRect().height
    })`), (state) => state?.width === 390 && state.scrollWidth <= 390 && state.headerWidth <= 390 && state.stageHeight >= 400);
    assert.equal(narrowLayout.scrollWidth <= narrowLayout.width, true);
    assert.match(narrowLayout.sidebarOverflow, /auto|scroll/);

    assert.equal(await readCaptureCount(editor), 1);

    await browser.evaluate(editor, "document.querySelector('#clear-button').click()");
    await delay(800);
    assert.equal(await browser.evaluate(editor, `new Promise((resolve, reject) => {
      const request = indexedDB.open('koalashot-captures', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const getAll = request.result.transaction('drafts').objectStore('drafts').getAll(); getAll.onsuccess = () => { resolve(getAll.result[0]?.annotations?.length || 0); request.result.close(); }; };
    })`), 0);
    await browser.evaluate(editor, "document.querySelector('#discard-button').click()");
    await delay(800);
    assert.equal(await readCaptureCount(popup), 0);
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

async function readCaptureCount(page) {
  return page.browser.evaluate(page, `new Promise((resolve, reject) => {
    const request = indexedDB.open('koalashot-captures', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('captures', 'readonly');
      const getAll = transaction.objectStore('captures').getAll();
      getAll.onerror = () => reject(getAll.error);
      getAll.onsuccess = () => { resolve(getAll.result.length); request.result.close(); };
    };
  })`);
}

const result = await runFlow();
console.log(JSON.stringify(result, null, 2));
