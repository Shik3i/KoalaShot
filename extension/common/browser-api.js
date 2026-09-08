const browserNamespace = globalThis.browser || globalThis.chrome;

if (!browserNamespace) {
  throw new Error("KoalaShot browser APIs are unavailable.");
}

function getLastError() {
  const lastError = browserNamespace.runtime && browserNamespace.runtime.lastError;
  return lastError ? new Error(lastError.message) : null;
}

export function invoke(apiFunction, context, args = []) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    };
    const callback = (...values) => {
      const lastError = getLastError();
      if (lastError) {
        finish(reject, lastError);
        return;
      }
      finish(resolve, values.length > 1 ? values : values[0]);
    };

    let result;
    try {
      result = apiFunction.call(context, ...args, callback);
    } catch (firstError) {
      try {
        result = apiFunction.call(context, ...args);
      } catch (secondError) {
        finish(reject, secondError || firstError);
        return;
      }
    }

    if (result && typeof result.then === "function") {
      result.then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
    } else if (result !== undefined) {
      finish(resolve, result);
    }
  });
}

export function getApi() {
  return browserNamespace;
}

export async function queryActiveTab() {
  return invoke(browserNamespace.tabs.query, browserNamespace.tabs, [{
    active: true,
    currentWindow: true,
  }]);
}

export async function getTab(tabId) {
  return invoke(browserNamespace.tabs.get, browserNamespace.tabs, [tabId]);
}

export async function injectCaptureScript(tabId) {
  return invoke(browserNamespace.scripting.executeScript, browserNamespace.scripting, [{
    target: { tabId },
    files: ["/content/capture-page.js"],
  }]);
}

export function connectCapture(tabId, sessionId) {
  return browserNamespace.tabs.connect(tabId, { name: `koalashot-capture:${sessionId}` });
}

let lastScreenshotAt = 0;
export async function captureVisibleTab(windowId, { beforeCapture, signal } = {}) {
  const capture = async () => {
    const session = browserNamespace.storage?.session;
    let previous = lastScreenshotAt;
    if (session) {
      try {
        const values = await invoke(session.get, session, ["lastScreenshotAt"]);
        previous = Math.max(previous, Number(values?.lastScreenshotAt) || 0);
      } catch { /* Per-context timing and quota handling remain available. */ }
    }
    const pause = Math.min(1100, Math.max(0, 650 - (Date.now() - previous)));
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (signal?.aborted) throw new Error("Capture cancelled.");
        await beforeCapture?.();
        return await invoke(browserNamespace.tabs.captureVisibleTab, browserNamespace.tabs, [windowId, { format: "png" }]);
      } catch (error) {
        if (attempt || !/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(error.message)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1100));
      } finally {
        lastScreenshotAt = Date.now();
        if (session) {
          try { await invoke(session.set, session, [{ lastScreenshotAt }]); }
          catch { /* A bookkeeping failure must not replace the screenshot result. */ }
        }
      }
    }
  };
  return globalThis.navigator?.locks
    ? navigator.locks.request("koalashot-screenshot", capture)
    : capture();
}

export async function createTab(url) {
  return invoke(browserNamespace.tabs.create, browserNamespace.tabs, [{ url }]);
}

export async function storageGet(keys) {
  return invoke(browserNamespace.storage.local.get, browserNamespace.storage.local, [keys]);
}

export async function storageSet(values) {
  return invoke(browserNamespace.storage.local.set, browserNamespace.storage.local, [values]);
}

export async function containsPermission(permission) {
  if (!browserNamespace.permissions?.contains) {
    return false;
  }
  return Boolean(await invoke(browserNamespace.permissions.contains, browserNamespace.permissions, [{
    permissions: [permission],
  }]));
}

export async function requestPermission(permission) {
  if (!browserNamespace.permissions?.request) {
    return false;
  }
  return Boolean(await invoke(browserNamespace.permissions.request, browserNamespace.permissions, [{
    permissions: [permission],
  }]));
}

export async function ensureClipboardPermission() {
  const requiredPermissions = browserNamespace.runtime?.getManifest?.().permissions;
  if (Array.isArray(requiredPermissions) && requiredPermissions.includes("clipboardWrite")) {
    return true;
  }
  // permissions.request() must be invoked synchronously from the user-action
  // handler. Firefox can return false when the permission is already required,
  // so verify the effective permission only after the direct request finishes.
  try {
    if (await requestPermission("clipboardWrite")) {
      return true;
    }
  } catch {
    // A required permission is not requestable as an optional permission.
  }
  return containsPermission("clipboardWrite");
}

export function getExtensionUrl(path) {
  return browserNamespace.runtime.getURL(path);
}

export function getMessage(key, fallback = "") {
  const message = browserNamespace.i18n?.getMessage?.(key);
  return message || fallback;
}
