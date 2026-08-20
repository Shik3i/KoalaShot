import test from "node:test";
import assert from "node:assert/strict";

async function loadBrowserApi(permissionResult, containsResult = false, required = false) {
  const calls = { contains: 0, request: 0 };
  globalThis.browser = {
    runtime: {
      lastError: null,
      getManifest: () => ({ permissions: required ? ["clipboardWrite"] : [] }),
    },
    permissions: {
      contains() {
        calls.contains += 1;
        return Promise.resolve(containsResult);
      },
      request(details, callback) {
        calls.request += 1;
        assert.deepEqual(details, { permissions: ["clipboardWrite"] });
        Promise.resolve().then(() => callback?.(permissionResult));
        return Promise.resolve(permissionResult);
      },
    },
  };
  const moduleUrl = new URL("../../extension/common/browser-api.js", import.meta.url);
  moduleUrl.searchParams.set("permission-result", String(permissionResult));
  moduleUrl.searchParams.set("contains-result", String(containsResult));
  moduleUrl.searchParams.set("required", String(required));
  return { api: await import(moduleUrl), calls };
}

test("requests clipboardWrite synchronously without losing the user-action context", async () => {
  const { api, calls } = await loadBrowserApi(true);
  try {
    const permission = api.ensureClipboardPermission();
    assert.equal(calls.request, 1);
    assert.equal(calls.contains, 0);
    assert.equal(await permission, true);
  } finally {
    delete globalThis.browser;
  }
});

test("accepts an already-required clipboardWrite permission without an API request", async () => {
  const { api, calls } = await loadBrowserApi(false, true, true);
  try {
    const permission = api.ensureClipboardPermission();
    assert.equal(calls.request, 0);
    assert.equal(await permission, true);
    assert.equal(calls.contains, 0);
  } finally {
    delete globalThis.browser;
  }
});

test("checks the effective permission only after a denied direct request", async () => {
  const { api, calls } = await loadBrowserApi(false);
  try {
    const permission = api.ensureClipboardPermission();
    assert.equal(calls.request, 1);
    assert.equal(calls.contains, 0);
    assert.equal(await permission, false);
    assert.equal(calls.contains, 1);
  } finally {
    delete globalThis.browser;
  }
});
